"use client";

import { formatMoney, type Order, type OrderStatus } from "@/schemas";
import type { PortalSide } from "@/features/auth/paths";

/** Order screens (Day 12): small shared pieces. Every number comes from the API. */

type Tone = "new" | "neutral" | "done" | "closed";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Muscat" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });
export const orderDate = (iso: string) => dateFormat.format(new Date(iso));
export const orderDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

/** What each side needs to hear about the status. */
export function orderStatus(status: OrderStatus, side: PortalSide): { label: string; tone: Tone } {
  switch (status) {
    case "awaiting_payment":
      return { label: side === "buyer" ? "To pay" : "Awaiting payment", tone: side === "buyer" ? "new" : "neutral" };
    case "paid":
      return { label: side === "seller" ? "Paid · to pack" : "Paid", tone: "done" };
    case "packed":
      return { label: "Packed", tone: "done" };
    case "shipped":
      return { label: "Shipped", tone: "done" };
    case "delivered":
      return { label: "Delivered", tone: "done" };
    case "completed":
      return { label: "Completed", tone: "closed" };
    case "cancelled":
      return { label: "Cancelled", tone: "closed" };
    case "refunded":
      return { label: "Refunded", tone: "closed" };
  }
}

/** Items, shipping, VAT, total; on the seller's side also Muhrak's fee and what the seller receives. */
export function OrderAmounts({ order }: { order: Order }) {
  const rows: [string, string][] = [
    ["Items", formatMoney(order.subtotal)],
    ["Shipping", order.shipping.amountMinor === 0 ? "Free" : formatMoney(order.shipping)],
    [order.vatRateBp > 0 ? `VAT ${order.vatRateBp / 100}%` : "VAT", order.vatRateBp > 0 ? formatMoney(order.vat) : "Not charged"],
  ];
  return (
    <dl className="flex w-full flex-col gap-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-text-muted">{label}</dt>
          <dd className="text-text-strong tabular-nums">{value}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2.5 text-base">
        <dt className="font-medium text-text-strong">{order.sellerAmount ? "Buyer pays" : "Total"}</dt>
        <dd className="font-semibold text-text-strong tabular-nums">{formatMoney(order.total)}</dd>
      </div>
      {order.platformFee && order.sellerAmount ? (
        <>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Muhrak fee</dt>
            <dd className="text-text-strong tabular-nums">− {formatMoney(order.platformFee)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-base">
            <dt className="font-medium text-text-strong">You receive</dt>
            <dd className="font-semibold text-text-strong tabular-nums">{formatMoney(order.sellerAmount)}</dd>
          </div>
        </>
      ) : null}
    </dl>
  );
}
