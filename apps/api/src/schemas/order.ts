import { z } from "zod";
import { moneySchema } from "./money-schema";

/**
 * Orders and payments (Day 12, 22 Nov 2026). The buyer confirms a valid
 * quotation and pays Muhrak through the payment gateway; Muhrak pays the
 * seller after delivery (payment rules in docs/PLAN.md).
 *
 * - The amounts are the quotation's, copied by the SERVER when the order is
 *   made. The client never sends an amount.
 * - The order is live only once the gateway's signed webhook confirms the
 *   payment. The browser's return from the checkout page only shows
 *   "checking payment".
 * - Delivery city and country are the quotation's (its shipping was priced
 *   for them); the buyer adds the recipient, phone and street address. The
 *   seller sees these only after payment, so deals stay on Muhrak.
 *
 * Lifecycle (ORDER_TRANSITIONS in order.service.ts, one place):
 *   awaiting_payment -> paid -> packed -> shipped -> delivered -> completed
 *   awaiting_payment -> cancelled  (buyer cancels, or the time to pay ends)
 *   paid … delivered -> refunded   (admin, Day 15)
 */

export const ORDER_LIMITS = {
  /** Hours the buyer has to pay after confirming (developer default, 22 Nov 2026). */
  paymentHours: 24,
} as const;

export const orderStatusSchema = z.enum(["awaiting_payment", "paid", "packed", "shipped", "delivered", "completed", "cancelled", "refunded"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const paymentStatusSchema = z.enum(["pending", "succeeded", "failed", "expired", "refunded", "partially_refunded"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** Plain single-line text: no control characters. */
const line = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^\p{Cc}]*$/u, "Use plain text only");

const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\p{Cc}]*$/u, "Use plain text only")
    .nullable()
    .transform((value) => (value ? value : null));

/** Where the parts go. City and country come from the quotation, not from here. */
export const deliveryAddressInputSchema = z.object({
  recipientName: line(2, 80),
  /** A phone number the courier can call: digits with an optional +, spaces, dashes or brackets. */
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Enter a phone number, e.g. +968 9123 4567")
    .refine((value) => value.replace(/\D/g, "").length >= 7, "Enter a phone number, e.g. +968 9123 4567"),
  /** Building, street, area. */
  addressLine: line(5, 200),
  /** Landmark or delivery instructions. */
  notes: optionalLine(300),
});
export type DeliveryAddressInput = z.infer<typeof deliveryAddressInputSchema>;

/**
 * POST /v1/buyer/orders. `orderKey` is made by the browser when the confirm
 * page opens: confirming twice returns the first order.
 */
export const orderCreateSchema = z.object({
  quotationId: z.string().uuid(),
  orderKey: z.string().uuid(),
  delivery: deliveryAddressInputSchema,
});
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

/** GET /v1/{buyer|seller}/orders: newest first. */
export const orderListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const orderDeliverySchema = z.object({
  recipientName: z.string(),
  phone: z.string(),
  addressLine: z.string(),
  notes: z.string().nullable(),
  city: z.string(),
  countryName: z.string(),
});

/**
 * An order as its buyer or seller sees it. `delivery` is null for the
 * seller until the order is paid. The seller's payout share is only on the
 * seller's side (`sellerAmount`, after Muhrak's fee).
 */
export const orderSchema = z.object({
  id: z.string().uuid(),
  /** Human reference, e.g. "OR-1001". */
  reference: z.string(),
  status: orderStatusSchema,
  quotationId: z.string().uuid(),
  quotationReference: z.string(),
  rfqId: z.string().uuid(),
  seller: z.object({ id: z.string().uuid(), companyName: z.string() }),
  buyer: z.object({ name: z.string() }),
  subtotal: moneySchema,
  shipping: moneySchema,
  vatRateBp: z.number().int(),
  vat: moneySchema,
  total: moneySchema,
  /** Seller side only: what Muhrak pays the seller after delivery (total minus Muhrak's fee). */
  sellerAmount: moneySchema.nullable(),
  /** Seller side only: Muhrak's fee. */
  platformFee: moneySchema.nullable(),
  deliveryDays: z.number().int(),
  delivery: orderDeliverySchema.nullable(),
  /** While awaiting payment: when the order is cancelled if not paid. */
  paymentDueAt: z.string().nullable(),
  /** The latest payment attempt, if any. */
  payment: z.object({ status: paymentStatusSchema, updatedAt: z.string() }).nullable(),
  paidAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

export const orderResponseSchema = z.object({ order: orderSchema });
export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const orderListResponseSchema = z.object({
  items: z.array(orderSchema),
  nextCursor: z.string().nullable(),
});
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

/** GET /v1/buyer/orders/last-delivery: the buyer's last address, to fill in the confirm page. */
export const lastDeliveryResponseSchema = z.object({ delivery: deliveryAddressInputSchema.nullable() });
export type LastDeliveryResponse = z.infer<typeof lastDeliveryResponseSchema>;

/** POST /v1/buyer/orders/:id/pay: where to send the buyer to pay (the gateway's hosted page). */
export const payStartResponseSchema = z.object({ paymentId: z.string().uuid(), checkoutUrl: z.string().url() });
export type PayStartResponse = z.infer<typeof payStartResponseSchema>;

/** POST /v1/buyer/payments/:id/test-complete: only with the fake (test) gateway. */
export const testPaymentCompleteSchema = z.object({ outcome: z.enum(["succeeded", "failed"]) });
export type TestPaymentComplete = z.infer<typeof testPaymentCompleteSchema>;
