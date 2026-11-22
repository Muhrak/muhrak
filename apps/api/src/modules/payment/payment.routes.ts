import express, { Router } from "express";
import { z } from "zod";
import { testPaymentCompleteSchema, type PayStartResponse, type TestPaymentComplete } from "../../schemas";
import { validateBody, validateParams } from "../../shared/http";
import { limitByIp, limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import * as paymentService from "./payment.service";

/**
 * Routes layer: HTTP only.
 * - POST /v1/payments/webhook/:provider: the gateway's webhook. No login; the
 *   signature is checked over the RAW body (mounted before the JSON parser).
 * - POST /v1/buyer/orders/:id/pay: the signed-in BUYER starts paying their order.
 * - POST /v1/buyer/payments/:id/test-complete: the fake (test) gateway only.
 */
export const paymentWebhookRouter = Router();
export const buyerOrderPayRouter = Router();
export const buyerPaymentRouter = Router();

const MINUTE = 60_000;
const idParams = z.object({ id: z.string().uuid() });
const idOf = (params: unknown) => (params as { id: string }).id;

// ---------------------------------------------------------------- webhook

const providerParams = z.object({ provider: z.string().regex(/^[a-z0-9-]{2,30}$/) });

paymentWebhookRouter.post(
  "/:provider",
  limitByIp({ name: "payment-webhook:ip", max: 600, windowMs: MINUTE }),
  express.raw({ type: "*/*", limit: "64kb" }),
  validateParams(providerParams),
  async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = await paymentService.handleWebhook((req.params as { provider: string }).provider, rawBody, req.headers);
    // The gateway only needs to know whether we took the event; never echo details.
    res.status(result.status).json({ received: result.status === 200 });
  },
);

// ---------------------------------------------------------------- buyer

buyerOrderPayRouter.use(requireAuth, requireRole("buyer"));
buyerPaymentRouter.use(requireAuth, requireRole("buyer"));

const payLimit = limitByUser({ name: "order-pay:buyer", max: 30, windowMs: 15 * MINUTE }, "Too many payment attempts. Please wait a little.");

buyerOrderPayRouter.post("/:id/pay", payLimit, validateParams(idParams), async (req, res) => {
  const body: PayStartResponse = await paymentService.startPayment(req.auth!.userId, idOf(req.params));
  res.json(body);
});

buyerPaymentRouter.post("/:id/test-complete", payLimit, validateParams(idParams), validateBody(testPaymentCompleteSchema), async (req, res) => {
  res.json(await paymentService.completeTestPayment(req.auth!.userId, idOf(req.params), req.body as TestPaymentComplete));
});
