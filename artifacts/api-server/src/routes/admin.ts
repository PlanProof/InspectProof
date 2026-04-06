import { Router, type IRouter } from 'express';
import { db, usersTable, projectsTable, inspectionsTable, planConfigsTable, emailLogsTable, reportsTable } from '@workspace/db';
import { eq, count, desc, sql, and, ne, asc } from 'drizzle-orm';
import { getUncachableStripeClient } from '../stripeClient';
import { getLimits } from '../lib/planLimits';
import bcrypt from 'bcryptjs';
import { decodeSessionToken } from '../lib/session-token';

const router: IRouter = Router();

function getUserId(req: any): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const { userId, valid } = decodeSessionToken(auth.slice(7));
    return valid ? userId : null;
  } catch {
    return null;
  }
}

async function requireAdmin(req: any, res: any, next: any) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  req.adminUser = user;
  next();
}

// ── Users ──────────────────────────────────────────────────────────────────────

router.get('/admin/users', requireAdmin, async (_req, res) => {
  const users = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));

  const usersWithUsage = await Promise.all(
    users.map(async (user) => {
      const [{ projectCount }] = await db
        .select({ projectCount: count() })
        .from(projectsTable)
        .where(and(eq(projectsTable.createdById, user.id), ne(projectsTable.status, 'archived')));

      const [{ inspectionCount }] = await db
        .select({ inspectionCount: count() })
        .from(inspectionsTable)
        .where(sql`project_id IN (SELECT id FROM projects WHERE created_by_id = ${user.id})`);

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        plan: user.plan ?? 'free_trial',
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId,
        planOverrideProjects: user.planOverrideProjects,
        planOverrideInspections: user.planOverrideInspections,
        usage: { projects: projectCount, inspections: inspectionCount },
        limits: getLimits(user.plan ?? 'free_trial'),
        createdAt: user.createdAt,
      };
    })
  );

  res.json({ users: usersWithUsage });
});

router.post('/admin/users', requireAdmin, async (req, res) => {
  const { email, firstName, lastName, role, plan, password, isAdmin, isActive } = req.body;

  if (!email || !firstName || !lastName || !password) {
    return res.status(400).json({ error: 'email, firstName, lastName and password are required' });
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length) return res.status(409).json({ error: 'Email already in use' });

  const passwordHash = await bcrypt.hash(password, 10);

  const [created] = await db.insert(usersTable).values({
    email: email.toLowerCase().trim(),
    passwordHash,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    role: role ?? 'inspector',
    plan: plan ?? 'free_trial',
    isAdmin: isAdmin ?? false,
    isActive: isActive ?? true,
  }).returning();

  return res.status(201).json({ user: { id: created.id, email: created.email, firstName: created.firstName, lastName: created.lastName, role: created.role, plan: created.plan } });
});

router.get('/admin/users/:id', requireAdmin, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  if (!user) return res.status(404).json({ error: 'Not found' });

  let stripeSubscription = null;
  if (user.stripeSubscriptionId) {
    try {
      const stripe = await getUncachableStripeClient();
      stripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    } catch {}
  }

  return res.json({ user, subscription: stripeSubscription });
});

router.patch('/admin/users/:id', requireAdmin, async (req, res) => {
  const { email, firstName, lastName, role, plan, isAdmin, isActive, planOverrideProjects, planOverrideInspections, password } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };

  if (email !== undefined) updates.email = email.toLowerCase().trim();
  if (firstName !== undefined) updates.firstName = firstName.trim();
  if (lastName !== undefined) updates.lastName = lastName.trim();
  if (role !== undefined) updates.role = role;
  if (plan !== undefined) updates.plan = plan;
  if (isAdmin !== undefined) updates.isAdmin = isAdmin;
  if (isActive !== undefined) updates.isActive = isActive;
  if (planOverrideProjects !== undefined) updates.planOverrideProjects = planOverrideProjects;
  if (planOverrideInspections !== undefined) updates.planOverrideInspections = planOverrideInspections;
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, Number(req.params.id)))
    .returning();

  res.json({ user: updated });
});

router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  const adminId = (req as any).adminUser?.id;
  if (targetId === adminId) return res.status(400).json({ error: 'Cannot delete your own account' });

  await db.delete(usersTable).where(eq(usersTable.id, targetId));
  return res.json({ success: true });
});

// ── Stats ──────────────────────────────────────────────────────────────────────

router.get('/admin/stats', requireAdmin, async (_req, res) => {
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);
  const [{ totalProjects }] = await db.select({ totalProjects: count() }).from(projectsTable);
  const [{ totalInspections }] = await db.select({ totalInspections: count() }).from(inspectionsTable);

  const planBreakdown = await db
    .select({ plan: usersTable.plan, cnt: count() })
    .from(usersTable)
    .groupBy(usersTable.plan);

  const recentUsers = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt))
    .limit(10);

  res.json({
    totalUsers,
    totalProjects,
    totalInspections,
    planBreakdown,
    recentUsers: recentUsers.map(u => ({
      id: u.id,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`,
      plan: u.plan,
      createdAt: u.createdAt,
    })),
  });
});

router.post('/admin/users/:id/sync-plan', requireAdmin, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  if (!user?.stripeSubscriptionId) {
    return res.status(400).json({ error: 'No Stripe subscription to sync' });
  }

  const stripe = await getUncachableStripeClient();
  const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
    expand: ['items.data.price.product'],
  });

  const product = (sub.items.data[0]?.price?.product as any);
  const newPlan = product?.metadata?.inspectproof_plan ?? 'starter';

  const [updated] = await db
    .update(usersTable)
    .set({ plan: newPlan, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();

  return res.json({ user: updated });
});

// ── Revenue / Financial Stats ──────────────────────────────────────────────────

router.get('/admin/revenue', requireAdmin, async (req, res) => {
  try {
    const stripe = await getUncachableStripeClient();

    // ── Subscriptions ──────────────────────────────────────────────────────────
    const [activeSubs, cancelledSubs, trialSubs] = await Promise.all([
      stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items.data.price'] }),
      stripe.subscriptions.list({ status: 'canceled', limit: 100, created: { gte: Math.floor(Date.now() / 1000) - 90 * 24 * 3600 } }),
      stripe.subscriptions.list({ status: 'trialing', limit: 100 }),
    ]);

    // ── MRR calculation from active subscriptions ──────────────────────────────
    let mrrCents = 0;
    const revenueByPlan: Record<string, number> = {};
    const priceToProductId: Record<string, string> = {};

    for (const sub of activeSubs.data) {
      for (const item of sub.items.data) {
        const price = item.price;
        const amount = price.unit_amount ?? 0;
        const interval = price.recurring?.interval;
        const monthlyAmount = interval === 'year' ? Math.round(amount / 12) : amount;
        mrrCents += monthlyAmount;

        // Map price → product for later lookup
        const productId = typeof price.product === 'string' ? price.product : (price.product as any)?.id;
        if (productId) priceToProductId[price.id] = productId;

        // Temporarily key by price nickname or product ID until we fetch products
        const tempKey = price.nickname ?? productId ?? price.id ?? 'unknown';
        revenueByPlan[tempKey] = (revenueByPlan[tempKey] ?? 0) + monthlyAmount;
      }
    }

    // Fetch unique products to resolve plan keys
    const uniqueProductIds = [...new Set(Object.values(priceToProductId))];
    const productPlanMap: Record<string, string> = {};
    if (uniqueProductIds.length > 0) {
      await Promise.all(uniqueProductIds.map(async (pid) => {
        try {
          const product = await stripe.products.retrieve(pid);
          productPlanMap[pid] = (product as any).metadata?.inspectproof_plan ?? product.name ?? pid;
        } catch {}
      }));
    }

    // Re-key revenueByPlan using proper plan labels
    const resolvedRevenueByPlan: Record<string, number> = {};
    for (const sub of activeSubs.data) {
      for (const item of sub.items.data) {
        const price = item.price;
        const amount = price.unit_amount ?? 0;
        const interval = price.recurring?.interval;
        const monthlyAmount = interval === 'year' ? Math.round(amount / 12) : amount;
        const productId = priceToProductId[price.id];
        const planKey = productId ? (productPlanMap[productId] ?? productId) : (price.nickname ?? 'unknown');
        resolvedRevenueByPlan[planKey] = (resolvedRevenueByPlan[planKey] ?? 0) + monthlyAmount;
      }
    }

    // ── Revenue from invoices (last 12 months) ─────────────────────────────────
    const twelveMonthsAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
    const invoices = await stripe.invoices.list({
      status: 'paid',
      limit: 100,
      created: { gte: twelveMonthsAgo },
    });

    let totalRevenueCents = 0;
    const monthlyRevenue: Record<string, number> = {};
    for (const inv of invoices.data) {
      totalRevenueCents += inv.amount_paid;
      const d = new Date(inv.created * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[key] = (monthlyRevenue[key] ?? 0) + inv.amount_paid;
    }

    // ── Current month revenue ──────────────────────────────────────────────────
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthRevenue = monthlyRevenue[thisMonthKey] ?? 0;

    // Fill missing months in the last 12 months
    const months: { month: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
      months.push({ month: label, revenue: (monthlyRevenue[key] ?? 0) / 100 });
    }

    // ── Failed / Past Due payments ─────────────────────────────────────────────
    const [pastDueInvoices, failedPayments] = await Promise.all([
      stripe.invoices.list({ status: 'open', limit: 20, due_date: { lte: Math.floor(Date.now() / 1000) } }),
      stripe.paymentIntents.list({ limit: 20 }),
    ]);
    const failedPaymentIntents = failedPayments.data.filter(pi => pi.status === 'requires_payment_method' || pi.status === 'canceled');

    // ── Recent paid invoices ───────────────────────────────────────────────────
    const recentInvoices = await stripe.invoices.list({ status: 'paid', limit: 10 });
    const recentPayments = await Promise.all(
      recentInvoices.data.map(async inv => {
        let customerEmail: string | null = null;
        let customerName: string | null = null;
        if (inv.customer) {
          try {
            const customer = await stripe.customers.retrieve(inv.customer as string);
            if (!('deleted' in customer)) {
              customerEmail = customer.email;
              customerName = customer.name ?? null;
            }
          } catch {}
        }
        return {
          id: inv.id,
          amount: inv.amount_paid / 100,
          currency: inv.currency.toUpperCase(),
          date: new Date(inv.created * 1000).toISOString(),
          customerEmail,
          customerName,
          description: inv.lines.data[0]?.description ?? inv.description ?? '—',
          hostedUrl: inv.hosted_invoice_url,
        };
      })
    );

    // ── Churn & conversion from DB ─────────────────────────────────────────────
    const [{ paidCount }] = await db
      .select({ paidCount: count() })
      .from(usersTable)
      .where(sql`plan NOT IN ('free_trial', 'enterprise') AND stripe_subscription_id IS NOT NULL`);

    const [{ trialCount }] = await db
      .select({ trialCount: count() })
      .from(usersTable)
      .where(eq(usersTable.plan, 'free_trial'));

    const totalUsersResult = await db.select({ cnt: count() }).from(usersTable);
    const totalUsers = Number(totalUsersResult[0].cnt);

    // ── Lifetime value estimate ────────────────────────────────────────────────
    const avgRevenuePerUser = Number(paidCount) > 0 ? mrrCents / Number(paidCount) : 0;

    res.json({
      mrr: mrrCents / 100,
      arr: (mrrCents * 12) / 100,
      totalRevenue12m: totalRevenueCents / 100,
      currentMonthRevenue: currentMonthRevenue / 100,
      activeSubscriptions: activeSubs.data.length,
      trialSubscriptions: trialSubs.data.length + Number(trialCount),
      cancelledLast90Days: cancelledSubs.data.length,
      pastDueCount: pastDueInvoices.data.length,
      failedPaymentCount: failedPaymentIntents.length,
      paidUsers: Number(paidCount),
      freeTrialUsers: Number(trialCount),
      totalUsers,
      avgRevenuePerUser: avgRevenuePerUser / 100,
      revenueByPlan: Object.entries(resolvedRevenueByPlan).map(([plan, cents]) => ({
        plan, mrr: cents / 100,
      })),
      monthlyRevenue: months,
      recentPayments,
    });
  } catch (err: any) {
    req.log.error({ err }, 'Revenue stats error');
    res.status(500).json({ error: 'Failed to load revenue stats', message: err.message });
  }
});

// ── Plan Configs ───────────────────────────────────────────────────────────────

router.get('/admin/plans', requireAdmin, async (_req, res) => {
  const plans = await db.select().from(planConfigsTable).orderBy(planConfigsTable.sortOrder);
  res.json({ plans });
});

// ── Email Logs ─────────────────────────────────────────────────────────────────

router.get('/admin/emails', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const offset = (page - 1) * limit;
    const typeFilter = req.query.type ? String(req.query.type) : null;
    const statusFilter = req.query.status ? String(req.query.status) : null;

    let query = db.select().from(emailLogsTable).$dynamic();
    let countQuery = db.select({ total: count() }).from(emailLogsTable).$dynamic();

    const conditions: ReturnType<typeof eq>[] = [];
    if (typeFilter) conditions.push(eq(emailLogsTable.type, typeFilter));
    if (statusFilter) conditions.push(eq(emailLogsTable.status, statusFilter));

    if (conditions.length === 1) {
      query = query.where(conditions[0]);
      countQuery = countQuery.where(conditions[0]);
    } else if (conditions.length > 1) {
      const where = and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]));
      query = query.where(where);
      countQuery = countQuery.where(where);
    }

    const [logs, [{ total }]] = await Promise.all([
      query.orderBy(desc(emailLogsTable.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    res.json({
      logs,
      total: Number(total),
      page,
      limit,
      pages: Math.ceil(Number(total) / limit),
    });
  } catch (err) {
    req.log.error({ err }, 'Email logs fetch error');
    res.status(500).json({ error: 'Failed to fetch email logs', message: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/admin/emails/:id/retry', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'invalid_id', message: 'Email log ID must be a valid integer.' });
    const [log] = await db.select().from(emailLogsTable).where(eq(emailLogsTable.id, id));

    if (!log) return res.status(404).json({ error: 'Email log not found' });
    if (log.status !== 'failed') return res.status(400).json({ error: 'Only failed emails can be retried' });

    const metadata = (log.metadata ?? {}) as Record<string, unknown>;

    const {
      sendInspectionAssignedEmail,
      sendInspectionReminderEmail,
      sendWelcomeEmail,
    } = await import('../lib/email');

    let retried = false;

    // ── Inspection emails: reconstruct from inspection/user/project tables ──────
    if (log.type === 'inspection_assigned' || log.type === 'inspection_reminder') {
      const inspectionId = typeof metadata.inspectionId === 'number' ? metadata.inspectionId : null;
      if (inspectionId) {
        const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspectionId));
        if (inspection && inspection.inspectorId) {
          const [inspector] = await db.select().from(usersTable).where(eq(usersTable.id, inspection.inspectorId));
          const project = inspection.projectId
            ? (await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId)))[0]
            : null;
          if (inspector?.email && project) {
            let sendOk: boolean;
            if (log.type === 'inspection_assigned') {
              sendOk = await sendInspectionAssignedEmail({
                inspectorName: `${inspector.firstName} ${inspector.lastName}`.trim(),
                inspectorEmail: inspector.email,
                inspectionType: inspection.inspectionType,
                projectName: project.name,
                projectAddress: [project.siteAddress, project.suburb, project.state].filter(Boolean).join(', '),
                scheduledDate: inspection.scheduledDate,
                scheduledTime: inspection.scheduledTime ?? null,
                inspectionId: inspection.id,
                isReassignment: Boolean(metadata.isReassignment),
              }, req.log);
            } else {
              sendOk = await sendInspectionReminderEmail({
                inspectorName: `${inspector.firstName} ${inspector.lastName}`.trim(),
                inspectorEmail: inspector.email,
                inspectionType: inspection.inspectionType,
                projectName: project.name,
                projectAddress: [project.siteAddress, project.suburb, project.state].filter(Boolean).join(', '),
                scheduledDate: inspection.scheduledDate,
                scheduledTime: inspection.scheduledTime ?? null,
                inspectionId: inspection.id,
                daysUntil: typeof metadata.daysUntil === 'number' ? metadata.daysUntil : 1,
              }, req.log);
            }
            if (!sendOk) {
              return res.status(502).json({ error: 'send_failed', message: 'Email provider rejected the retry. Check Resend configuration.' });
            }
            retried = true;
          }
        }
      }
    }

    // ── Welcome email: look up user by recipient email ─────────────────────────
    else if (log.type === 'welcome') {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, log.recipient));
      if (user) {
        await sendWelcomeEmail({
          toEmail: user.email,
          firstName: user.firstName,
          companyName: user.companyName ?? (typeof metadata.companyName === 'string' ? metadata.companyName : ''),
        }, req.log);
        retried = true;
      }
    }

    if (!retried) {
      const supportedTypes = 'inspection_assigned, inspection_reminder, welcome';
      return res.status(422).json({
        error: 'retry_not_supported',
        message: `Retry via the admin panel is supported for: ${supportedTypes}. For email type '${log.type}', please re-trigger the original action (e.g. re-send invite, re-request password reset).`,
      });
    }

    res.json({ success: true, message: 'Email retry triggered' });
  } catch (err) {
    req.log.error({ err }, 'Email retry error');
    res.status(500).json({ error: 'Failed to retry email', message: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.put('/admin/plans/:planKey', requireAdmin, async (req, res) => {
  const { planKey } = req.params;
  const {
    label, description, features,
    maxProjects, maxInspectionsMonthly, maxInspectionsTotal, maxTeamMembers,
    isPopular, isBestValue, sortOrder,
  } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (label !== undefined) updates.label = label;
  if (description !== undefined) updates.description = description;
  if (features !== undefined) updates.features = JSON.stringify(features);
  if (maxProjects !== undefined) updates.maxProjects = maxProjects === '' ? null : String(maxProjects);
  if (maxInspectionsMonthly !== undefined) updates.maxInspectionsMonthly = maxInspectionsMonthly === '' ? null : String(maxInspectionsMonthly);
  if (maxInspectionsTotal !== undefined) updates.maxInspectionsTotal = maxInspectionsTotal === '' ? null : String(maxInspectionsTotal);
  if (maxTeamMembers !== undefined) updates.maxTeamMembers = maxTeamMembers === '' ? null : String(maxTeamMembers);
  if (isPopular !== undefined) updates.isPopular = isPopular;
  if (isBestValue !== undefined) updates.isBestValue = isBestValue;
  if (sortOrder !== undefined) updates.sortOrder = String(sortOrder);

  await db.update(planConfigsTable).set(updates).where(eq(planConfigsTable.planKey, planKey));
  const [updated] = await db.select().from(planConfigsTable).where(eq(planConfigsTable.planKey, planKey));
  res.json({ plan: updated });
});

export default router;
