import { Router, type IRouter } from 'express';
import { db, usersTable, projectsTable, inspectionsTable, planConfigsTable } from '@workspace/db';
import { eq, count, and, gte, sql, inArray } from 'drizzle-orm';
import { getUncachableStripeClient, getStripePublishableKey } from '../stripeClient';
import { getLimits, PLAN_LIMITS } from '../lib/planLimits';
import { requireAuth } from '../middleware/auth';

const router: IRouter = Router();

router.get('/billing/plan-configs', async (_req, res) => {
  try {
    const plans = await db.select().from(planConfigsTable).orderBy(planConfigsTable.sortOrder);
    res.json({
      plans: plans.map(p => {
        const limits = getLimits(p.planKey);
        return {
          ...p,
          features: JSON.parse(p.features || '[]'),
          monthlyPriceAud: limits.monthlyPriceAud,
          annualPriceAud: limits.annualPriceAud,
        };
      }),
    });
  } catch {
    res.json({ plans: [] });
  }
});

router.get('/billing/plans', async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active: true, expand: ['data.default_price'] });
    const prices = await stripe.prices.list({ active: true });

    const plans = products.data
      .filter(p => p.metadata?.inspectproof_plan)
      .sort((a, b) => Number(a.metadata.sort_order ?? 0) - Number(b.metadata.sort_order ?? 0))
      .map(product => {
        const productPrices = prices.data.filter(pr => pr.product === product.id);
        return {
          id: product.id,
          plan: product.metadata.inspectproof_plan,
          name: product.name,
          description: product.description,
          prices: productPrices.map(pr => ({
            id: pr.id,
            unit_amount: pr.unit_amount,
            currency: pr.currency,
            interval: (pr.recurring as any)?.interval ?? null,
          })),
          limits: getLimits(product.metadata.inspectproof_plan),
        };
      });

    const publishableKey = await getStripePublishableKey();
    res.json({ plans, publishableKey });
  } catch (err: any) {
    console.error('billing/plans error:', err.message);
    res.json({ plans: [], publishableKey: null });
  }
});

router.get('/billing/subscription', requireAuth, async (req: any, res) => {
  const caller = req.authUser!;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, caller.id));
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Resolve billing owner: team members share their org admin's plan and quota pool.
  let billingOwner = user;
  if (!user.isCompanyAdmin && !user.isAdmin && user.adminUserId) {
    const adminId = parseInt(user.adminUserId);
    if (!isNaN(adminId)) {
      const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
      if (admin) billingOwner = admin;
    }
  }

  const limits = getLimits(billingOwner.plan ?? 'free_trial');

  // Get all org member IDs (billing owner + all their team members)
  const teamMemberRows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.adminUserId, String(billingOwner.id)));
  const orgMemberIds = [billingOwner.id, ...teamMemberRows.map(m => m.id)];

  // Count ALL projects across the entire org pool — archived projects are NOT
  // excluded because archiving does not free a quota slot.
  const [{ projectCount }] = await db
    .select({ projectCount: count() })
    .from(projectsTable)
    .where(inArray(projectsTable.createdById, orgMemberIds));

  // Count inspections across the entire org pool (respecting plan's quota type)
  let inspectionCount = 0;
  if (limits.maxInspectionsTotal !== null || limits.maxInspectionsMonthly !== null) {
    const idList = orgMemberIds.join(',');
    if (limits.maxInspectionsTotal !== null) {
      const [{ val }] = await db
        .select({ val: count() })
        .from(inspectionsTable)
        .where(
          sql`project_id IN (SELECT id FROM projects WHERE created_by_id = ANY(ARRAY[${sql.raw(idList)}]::int[]))`
        );
      inspectionCount = val;
    } else if (limits.maxInspectionsMonthly !== null) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const [{ val }] = await db
        .select({ val: count() })
        .from(inspectionsTable)
        .where(
          and(
            sql`project_id IN (SELECT id FROM projects WHERE created_by_id = ANY(ARRAY[${sql.raw(idList)}]::int[]))`,
            gte(inspectionsTable.createdAt, startOfMonth)
          )
        );
      inspectionCount = val;
    }
  }

  // Stripe subscription details come from the billing owner's record
  let stripeSubscription = null;
  if (billingOwner.stripeSubscriptionId) {
    try {
      const stripe = await getUncachableStripeClient();
      stripeSubscription = await stripe.subscriptions.retrieve(billingOwner.stripeSubscriptionId);
    } catch {}
  }

  return res.json({
    plan: billingOwner.plan ?? 'free_trial',
    limits,
    usage: {
      projects: projectCount,
      inspections: inspectionCount,
    },
    stripeCustomerId: billingOwner.stripeCustomerId,
    stripeSubscriptionId: billingOwner.stripeSubscriptionId,
    subscription: stripeSubscription ? {
      status: stripeSubscription.status,
      currentPeriodEnd: (stripeSubscription as any).current_period_end,
      cancelAtPeriodEnd: (stripeSubscription as any).cancel_at_period_end,
    } : null,
  });
});

router.post('/billing/checkout', requireAuth, async (req: any, res) => {
  const caller = req.authUser!;
  if (!caller.isCompanyAdmin && !caller.isAdmin) {
    return res.status(403).json({ error: 'forbidden', message: 'Only company admins can manage billing.' });
  }

  const { priceId } = req.body;
  if (!priceId) return res.status(400).json({ error: 'priceId required' });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, caller.id));
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Server-side guard: if the user already has a Stripe customer ID,
  // they must use the billing portal to change or start a subscription
  // (not a new checkout session). This prevents duplicate subscriptions
  // regardless of the UI path taken. New signups with no customer record
  // may still use checkout — this endpoint will create the customer for them.
  if (user.stripeCustomerId) {
    return res.status(409).json({
      error: 'existing_customer',
      message: 'You already have a Stripe billing account. Please use the billing portal to manage your subscription.',
      usePortal: true,
    });
  }

  const stripe = await getUncachableStripeClient();

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: { userId: String(user.id) },
    });
    customerId = customer.id;
    await db.update(usersTable).set({ stripeCustomerId: customerId }).where(eq(usersTable.id, caller.id));
  }

  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? req.get('host');
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `https://${domain}/billing?success=1`,
    cancel_url: `https://${domain}/billing?cancelled=1`,
    metadata: { userId: String(caller.id) },
  });

  return res.json({ url: session.url });
});

router.post('/billing/portal', requireAuth, async (req: any, res) => {
  const caller = req.authUser!;
  if (!caller.isCompanyAdmin && !caller.isAdmin) {
    return res.status(403).json({ error: 'forbidden', message: 'Only company admins can manage billing.' });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, caller.id));
  if (!user?.stripeCustomerId) return res.status(400).json({ error: 'No billing account found' });

  const stripe = await getUncachableStripeClient();
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? req.get('host');
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `https://${domain}/billing`,
  });

  return res.json({ url: session.url });
});

router.get('/billing/enterprise-enquiry', requireAuth, async (_req: any, res) => {
  return res.json({
    message: 'Enterprise enquiry received.',
    email: 'enterprise@inspectproof.com.au',
  });
});

// Sync the user's plan from Stripe after checkout or on demand.
// Looks up all active subscriptions for the user's Stripe customer and
// writes the plan + subscription ID back to our users table.
export async function syncPlanFromStripe(userId: number): Promise<{ plan: string; subscriptionId: string | null }> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new Error('User not found');

  const customerId = user.stripeCustomerId;
  if (!customerId) return { plan: user.plan ?? 'free_trial', subscriptionId: null };

  const stripe = await getUncachableStripeClient();

  // Fetch subscriptions in any "live" state — active, trialing, past_due, and unpaid.
  // We prefer active > trialing > past_due > unpaid (most healthy first).
  // Subscriptions in all of these states still represent a paid commitment and
  // should retain the plan key — only fully canceled subscriptions trigger a downgrade.
  // Specifically: past_due means payment failed but retrying, unpaid means retries exhausted
  // but not yet canceled — in both cases the user should keep their plan until cancellation.
  const [activeResult, trialingResult, pastDueResult, unpaidResult] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1, expand: ['data.items.data.price'] }),
    stripe.subscriptions.list({ customer: customerId, status: 'trialing', limit: 1, expand: ['data.items.data.price'] }),
    stripe.subscriptions.list({ customer: customerId, status: 'past_due', limit: 1, expand: ['data.items.data.price'] }),
    stripe.subscriptions.list({ customer: customerId, status: 'unpaid', limit: 1, expand: ['data.items.data.price'] }),
  ]);

  const sub = activeResult.data[0] ?? trialingResult.data[0] ?? pastDueResult.data[0] ?? unpaidResult.data[0] ?? null;

  if (!sub) {
    // No live subscription — downgrade to free_trial and persist the change
    await db.update(usersTable).set({
      plan: 'free_trial',
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: 'canceled',
      isActive: false,
    }).where(eq(usersTable.id, userId));
    return { plan: 'free_trial', subscriptionId: null };
  }

  const item = sub.items.data[0];
  const productId = typeof item?.price?.product === 'string'
    ? item.price.product
    : (item?.price?.product as any)?.id;

  let planKey = 'free_trial';
  if (productId) {
    const product = await stripe.products.retrieve(productId);
    planKey = product.metadata?.inspectproof_plan ?? 'free_trial';
  }

  await db.update(usersTable).set({
    plan: planKey,
    stripeSubscriptionId: sub.id,
    stripeSubscriptionStatus: sub.status,
    isActive: true,
  }).where(eq(usersTable.id, userId));

  return { plan: planKey, subscriptionId: sub.id };
}

// Sync via customer ID (used in webhook where we have customerId but not userId)
// Also propagates mobileOnly to all team members when the admin's plan changes.
export async function syncPlanFromStripeByCustomerId(customerId: string): Promise<void> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.stripeCustomerId, customerId));
  if (!user) return;
  await syncPlanFromStripe(user.id);
  await syncTeamMembersMobileOnly(user.id);
}

// Update mobile_only flag for all team members of an org admin based on their plan
export async function syncTeamMembersMobileOnly(adminUserId: number): Promise<void> {
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminUserId));
  if (!admin) return;
  const isMobileOnly = (admin.plan ?? "free_trial") === "free_trial";
  // Update all team members whose adminUserId matches
  await db.update(usersTable)
    .set({ mobileOnly: isMobileOnly, updatedAt: new Date() })
    .where(eq(usersTable.adminUserId, String(adminUserId)));
}

router.post('/billing/sync-plan', requireAuth, async (req: any, res) => {
  const caller = req.authUser!;
  if (!caller.isCompanyAdmin && !caller.isAdmin) {
    return res.status(403).json({ error: 'forbidden', message: 'Only company admins can manage billing.' });
  }

  try {
    const result = await syncPlanFromStripe(caller.id);
    await syncTeamMembersMobileOnly(caller.id);
    return res.json(result);
  } catch (err: any) {
    console.error('sync-plan error:', err.message);
    return res.status(500).json({ error: 'Failed to sync plan' });
  }
});

export default router;
