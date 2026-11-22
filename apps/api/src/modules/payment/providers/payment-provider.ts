/**
 * What Muhrak needs from a payment gateway (Day 12). The real gateway is
 * added on Day 13 behind this same interface; the fake one is for local
 * runs and tests only.
 *
 * Rules every implementation follows (payment rules, docs/PLAN.md):
 * - Hosted checkout: the card is typed on the gateway's page, never ours.
 * - The amount is sent in the smallest unit (OMR has 3 decimals: 1.250 OMR
 *   = 1250), exactly as the server computed it.
 * - Webhooks are verified (signature) before anything is read from them.
 */

export interface CheckoutRequest {
  /** Our payment id: the gateway sends it back on every event for this payment. */
  reference: string;
  orderId: string;
  orderReference: string;
  amountMinor: number;
  currency: "OMR";
  /** Where the gateway sends the buyer back (shows "checking payment"; never marks anything paid). */
  returnUrl: string;
  /** The checkout must stop accepting payment by then. */
  expiresAt: Date;
}

export interface Checkout {
  providerPaymentId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

export type PaymentEventType = "payment.succeeded" | "payment.failed" | "payment.expired";

/** A verified webhook event, reduced to what we act on (no card or personal data). */
export interface PaymentEvent {
  eventId: string;
  type: PaymentEventType;
  providerPaymentId: string;
  /** Our payment id, as sent in CheckoutRequest.reference. */
  reference: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<Checkout>;
  /** The event, or null when the signature or body is not valid (never throws for bad input). */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentEvent | null;
}
