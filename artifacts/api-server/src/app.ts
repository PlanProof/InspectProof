import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import { syncPlanFromStripeByCustomerId } from "./routes/billing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Stripe webhook MUST be registered before express.json() so it gets the raw Buffer
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing stripe-signature' });
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      // Let StripeSync handle its own sync tables
      try {
        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      } catch (syncErr: any) {
        // StripeSync may fail for events it doesn't recognise — that's fine,
        // we still need to update our own users table below.
        logger.warn({ err: syncErr }, 'StripeSync processWebhook warning (non-fatal)');
      }

      // Parse the event ourselves so we can update our users table
      let event: any;
      try {
        // Without the webhook secret we can't verify — parse the raw payload
        event = JSON.parse((req.body as Buffer).toString());
      } catch {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      const PLAN_UPDATE_EVENTS = new Set([
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
      ]);

      if (PLAN_UPDATE_EVENTS.has(event.type)) {
        const obj = event.data?.object;
        const customerId: string | null =
          obj?.customer ?? obj?.subscription?.customer ?? null;

        if (customerId) {
          try {
            await syncPlanFromStripeByCustomerId(customerId);
            logger.info({ event: event.type, customerId }, 'Plan synced from Stripe webhook');
          } catch (planErr: any) {
            logger.error({ err: planErr }, 'Failed to sync plan from webhook');
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, 'Stripe webhook error');
      return res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use(
  "/api/storage/sample-plans",
  express.static(path.join(__dirname, "..", "static", "sample-plans"), {
    setHeaders(res) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Disposition", "inline");
    },
  }),
);

app.use("/api", router);

export default app;
