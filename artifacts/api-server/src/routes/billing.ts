import { Router, type IRouter } from 'express';
import { db, usersTable, projectsTable, inspectionsTable, planConfigsTable } from '@workspace/db';
import { eq, count, and, ne, gte, sql } from 'drizzle-orm';
import { getUncachableStripeClient, getStripePublishableKey } from '../stripeClient';
import { getLimits, PLAN_LIMITS } from '../lib/planLimits';

const router: IRouter = Router();

function getUserId(req: any): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString();
    const [userId] = decoded.split(':');
    return Number(userId);
  } catch {
    return null;
  }
}

router.get('/billing/plan-configs', async (_req, res) => {
  try {
    const plans = await db.select().from(planConfigsTable).orderBy(planConfigsTable.sortOrder);
    res.json({ plans: plans.map(p => ({ ...p, features: JSON.parse(p.features || '[]') })) });
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

router.get('/billing/subscription', async (req: any, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const limits = getLimits(user.plan ?? 'free_trial');

  const [{ projectCount }] = await db
    .select({ projectCount: count() })
    .from(projectsTable)
    .where(and(eq(projectsTable.createdById, userId), ne(projectsTable.status, 'archived')));

  let inspectionCount = 0;
  if (limits.maxInspectionsTotal !== null) {
    const [{ val }] = await db
      .select({ val: count() })
      .from(inspectionsTable)
      .where(
        sql`project_id IN (SELECT id FROM projects WHERE created_by_id = ${userId})`
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
          sql`project_id IN (SELECT id FROM projects WHERE created_by_id = ${userId})`,
          gte(inspectionsTable.createdAt, startOfMonth)
        )
      );
    inspectionCount = val;
  }

  let stripeSubscription = null;
  if (user.stripeSubscriptionId) {
    try {
      const stripe = await getUncachableStripeClient();
      stripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    } catch {}
  }

  return res.json({
    plan: user.plan ?? 'free_trial',
    limits,
    usage: {
      projects: projectCount,
      inspections: inspectionCount,
    },
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    subscription: stripeSubscription ? {
      status: stripeSubscription.status,
      currentPeriodEnd: (stripeSubscription as any).current_period_end,
      cancelAtPeriodEnd: (stripeSubscription as any).cancel_at_period_end,
    } : null,
  });
});

router.post('/billing/checkout', async (req: any, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { priceId } = req.body;
  if (!priceId) return res.status(400).json({ error: 'priceId required' });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const stripe = await getUncachableStripeClient();

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: { userId: String(user.id) },
    });
    customerId = customer.id;
    await db.update(usersTable).set({ stripeCustomerId: customerId }).where(eq(usersTable.id, userId));
  }

  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? req.get('host');
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `https://${domain}/billing?success=1`,
    cancel_url: `https://${domain}/billing?cancelled=1`,
    metadata: { userId: String(userId) },
  });

  return res.json({ url: session.url });
});

router.post('/billing/portal', async (req: any, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.stripeCustomerId) return res.status(400).json({ error: 'No billing account found' });

  const stripe = await getUncachableStripeClient();
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? req.get('host');
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `https://${domain}/billing`,
  });

  return res.json({ url: session.url });
});

router.get('/billing/enterprise-enquiry', async (req: any, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  return res.json({
    message: 'Enterprise enquiry received.',
    email: 'enterprise@inspectproof.com.au',
  });
});

export default router;
