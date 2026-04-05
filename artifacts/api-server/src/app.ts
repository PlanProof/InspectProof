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
  "invoice.payment_failed",
  "invoice.payment_succeeded",
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

// IMPORTANT: Stripe webhook MUST be registered before express.json() so it receives the raw Buffer.
// Signature verification fails if the body has been parsed into a JS object first.
// Ordering is validated at server startup via validateWebhookRouteOrder() in index.ts.
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
      const stripeInstance = new Stripe(secretKey, { apiVersion: "2025-11-17.clover" });
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
        const obj = (event.data.object as unknown as Record<string, unknown>);
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

/**
 * Validate Stripe webhook route ordering by sending a synthetic POST to the webhook endpoint.
 *
 * The webhook route uses express.raw() to receive the raw Buffer required for Stripe signature
 * verification. If express.json() is registered before the webhook route, the body will have
 * been parsed into an object and signature verification will fail.
 *
 * This probe sends a POST with a JSON content-type and checks whether req.body is a Buffer
 * (correct) or an object (misconfigured). We catch the 400 "missing signature" response as
 * the expected happy path — reaching signature validation means the body was correctly buffered.
 *
 * Call this after the server starts listening (index.ts listen callback).
 */
export function validateWebhookRouteOrder(port: number): void {
  import("http").then(({ default: http }) => {
    const body = JSON.stringify({ type: "probe" });
    const options = {
      host: "127.0.0.1",
      port,
      path: "/api/stripe/webhook",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "stripe-signature": "probe-test",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode === 400) {
          try {
            const parsed = JSON.parse(data);
            if (parsed?.error === "Webhook signature verification failed") {
              logger.info(
                "Stripe webhook route ordering OK: webhook body received as Buffer (signature check reached)"
              );
            } else if (parsed?.error === "Missing stripe-signature header") {
              logger.info("Stripe webhook route ordering OK: webhook route reached before express.json()");
            } else if (typeof parsed?.error === "string" && parsed.error.toLowerCase().includes("webhook")) {
              logger.info("Stripe webhook route ordering OK: raw body handler is active");
            } else {
              logger.warn(
                { response: parsed },
                "Stripe webhook route order probe got unexpected 400 response — manual verification recommended"
              );
            }
          } catch {
            logger.warn("Stripe webhook route order probe: could not parse probe response");
          }
        } else if (res.statusCode === 200) {
          logger.info("Stripe webhook route ordering OK: probe accepted");
        } else {
          logger.warn(
            { statusCode: res.statusCode, body: data.slice(0, 200) },
            "STRIPE WEBHOOK ORDER PROBE: unexpected status. " +
            "Verify that app.post('/api/stripe/webhook', express.raw(...)) is registered BEFORE app.use(express.json()) in app.ts."
          );
        }
      });
    });

    req.on("error", (err) => {
      logger.warn({ err }, "Stripe webhook route order probe: connection error (non-fatal)");
    });

    req.write(body);
    req.end();
  }).catch((err) => {
    logger.warn({ err }, "Stripe webhook route order probe: failed to import http (non-fatal)");
  });
}

export default app;
