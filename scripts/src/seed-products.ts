import { getUncachableStripeClient } from './stripeClient';

const PRODUCTS = [
  {
    name: 'Starter',
    plan: 'starter',
    sortOrder: 1,
    description: 'For growing inspection businesses. Up to 10 projects and 50 inspections per month.',
    monthlyAmount: 5900,
    annualAmount: 59000,
  },
  {
    name: 'Professional',
    plan: 'professional',
    sortOrder: 2,
    description: 'Unlimited projects and inspections. Full customisation. Ideal for established practices.',
    monthlyAmount: 14900,
    annualAmount: 149000,
  },
];

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  console.log('Seeding InspectProof products in Stripe (sandbox)...\n');

  for (const p of PRODUCTS) {
    const existing = await stripe.products.search({
      query: `name:'${p.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`✓ ${p.name} already exists (${existing.data[0].id})`);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      prices.data.forEach(pr =>
        console.log(`  └─ price ${pr.id}  ${(pr.unit_amount! / 100).toFixed(2)} AUD/${(pr.recurring as any)?.interval}`)
      );
      continue;
    }

    const product = await stripe.products.create({
      name: p.name,
      description: p.description,
      metadata: {
        inspectproof_plan: p.plan,
        sort_order: String(p.sortOrder),
      },
    });
    console.log(`✓ Created product: ${product.name} (${product.id})`);

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: p.monthlyAmount,
      currency: 'aud',
      recurring: { interval: 'month' },
      metadata: { billing_period: 'monthly' },
    });
    console.log(`  └─ Monthly: $${(p.monthlyAmount / 100).toFixed(2)} AUD/month (${monthly.id})`);

    const annual = await stripe.prices.create({
      product: product.id,
      unit_amount: p.annualAmount,
      currency: 'aud',
      recurring: { interval: 'year' },
      metadata: { billing_period: 'annual' },
    });
    console.log(`  └─ Annual:  $${(p.annualAmount / 100).toFixed(2)} AUD/year (${annual.id})`);
  }

  console.log('\nDone. Stripe webhooks will sync these products to your database.');
}

seedProducts().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
