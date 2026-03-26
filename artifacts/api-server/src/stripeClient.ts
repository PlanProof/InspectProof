import Stripe from 'stripe';

async function getReplitCredentials(): Promise<{ publishableKey: string; secretKey: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) return null;

  try {
    const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
    const targetEnvironment = isProduction ? 'production' : 'development';

    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', 'stripe');
    url.searchParams.set('environment', targetEnvironment);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken,
      },
    });

    const data = await response.json() as { items?: Array<{ settings?: { publishable?: string; secret?: string } }> };
    const conn = data.items?.[0];
    if (!conn?.settings?.publishable || !conn?.settings?.secret) return null;

    return {
      publishableKey: conn.settings.publishable,
      secretKey: conn.settings.secret,
    };
  } catch {
    return null;
  }
}

async function getCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  const replit = await getReplitCredentials();
  if (replit) return replit;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (secretKey && publishableKey) return { secretKey, publishableKey };

  throw new Error(
    'Stripe credentials not found. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY, ' +
    'or connect via the Replit Stripe integration.'
  );
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as any });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();
    const connectionString =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) throw new Error('No database URL for Stripe sync');
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
