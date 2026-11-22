import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Checkout, CheckoutRequest, PaymentEvent, PaymentEventType, PaymentProvider } from "./payment-provider";

/**
 * A TEST gateway (Day 12): no money moves. Its "checkout page" is a page in
 * the web app with "Pay (test)" and "Fail (test)" buttons; those ask the API
 * to send a webhook signed with FAKE_PAYMENT_SECRET, which goes through the
 * very same webhook handling as a real gateway's.
 *
 * Refused in production unless ALLOW_FAKE_PAYMENTS=true (env.ts): with it,
 * any buyer can mark their own order paid.
 */

export const FAKE_SIGNATURE_HEADER = "x-muhrak-test-signature";

const eventSchema = z.object({
  id: z.string().min(8).max(100),
  type: z.enum(["payment.succeeded", "payment.failed", "payment.expired"]),
  paymentId: z.string().min(8).max(100),
  reference: z.string().uuid(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
});

export interface FakePaymentProvider extends PaymentProvider {
  /** Build a signed webhook for a test outcome, exactly as the gateway would send it. */
  signEvent(input: { type: PaymentEventType; providerPaymentId: string; reference: string; amountMinor: number; currency: string }): {
    rawBody: Buffer;
    headers: Record<string, string>;
  };
}

export function createFakePaymentProvider(config: { secret: string; webAppUrl: string }): FakePaymentProvider {
  const sign = (body: Buffer) => createHmac("sha256", config.secret).update(body).digest("hex");

  return {
    name: "fake",

    async createCheckout(request: CheckoutRequest): Promise<Checkout> {
      const url = new URL(`${config.webAppUrl}/buyer/orders/test-checkout`);
      url.searchParams.set("order", request.orderId);
      url.searchParams.set("payment", request.reference);
      return { providerPaymentId: `fake_${randomUUID()}`, checkoutUrl: url.toString(), expiresAt: request.expiresAt };
    },

    verifyWebhook(rawBody, headers): PaymentEvent | null {
      const given = headers[FAKE_SIGNATURE_HEADER];
      if (typeof given !== "string" || !/^[0-9a-f]{64}$/.test(given)) return null;
      const expected = Buffer.from(sign(rawBody), "hex");
      const actual = Buffer.from(given, "hex");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      let parsed: z.infer<typeof eventSchema>;
      try {
        parsed = eventSchema.parse(JSON.parse(rawBody.toString("utf8")));
      } catch {
        return null;
      }
      return {
        eventId: parsed.id,
        type: parsed.type,
        providerPaymentId: parsed.paymentId,
        reference: parsed.reference,
        amountMinor: parsed.amount,
        currency: parsed.currency,
      };
    },

    signEvent(input) {
      const rawBody = Buffer.from(
        JSON.stringify({
          id: `evt_${randomUUID()}`,
          type: input.type,
          paymentId: input.providerPaymentId,
          reference: input.reference,
          amount: input.amountMinor,
          currency: input.currency,
        }),
      );
      return { rawBody, headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: sign(rawBody) } };
    },
  };
}
