import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import { syncPlanFromStripeByCustomerId } from "./routes/billing";
import { getStripeSecretKey } from "./stripeClient";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLAN_UPDATE_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

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
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signatureHeader = req.headers["stripe-signature"];
    if (!signatureHeader) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }
    const sig = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook");
      return res.status(400).json({ error: "Webhook secret not configured" });
    }

    // Verify signature using the webhook secret before processing anything
    let event: Stripe.Event;
    try {
      const secretKey = await getStripeSecretKey();
      if (!secretKey) {
        logger.error("Stripe secret key unavailable — rejecting webhook");
        return res.status(400).json({ error: "Stripe not configured" });
      }
      const stripeInstance = new Stripe(secretKey, { apiVersion: "2025-05-28.basil" });
      event = stripeInstance.webhooks.constructEvent(
        req.body as Buffer,
        sig,
        webhookSecret,
      );
    } catch (verifyErr: unknown) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      logger.warn({ err: verifyErr }, `Stripe signature verification failed: ${msg}`);
      return res.status(400).json({ error: "Webhook signature verification failed" });
    }

    // Signature verified — safe to process
    try {
      // Let StripeSync handle its own sync tables (unrecognised event types may throw — that's OK)
      try {
        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      } catch (syncErr: unknown) {
        logger.warn({ err: syncErr }, "StripeSync processWebhook warning (non-fatal)");
      }

      if (PLAN_UPDATE_EVENTS.has(event.type)) {
        const obj = (event.data.object as Record<string, unknown>);
        const customerId =
          (typeof obj.customer === "string" ? obj.customer : null) ??
          (typeof (obj.subscription as Record<string, unknown> | undefined)?.customer === "string"
            ? (obj.subscription as Record<string, unknown>).customer as string
            : null);

        if (customerId) {
          try {
            await syncPlanFromStripeByCustomerId(customerId);
            logger.info({ eventType: event.type, customerId }, "Plan synced from Stripe webhook");
          } catch (planErr: unknown) {
            logger.error({ err: planErr }, "Failed to sync plan from webhook");
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (err: unknown) {
      logger.error({ err }, "Stripe webhook processing error");
      return res.status(500).json({ error: "Webhook processing error" });
    }
  },
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
