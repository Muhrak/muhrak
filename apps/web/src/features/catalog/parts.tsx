import { CURRENCY_DECIMALS, formatMoney, UNIT_LABELS, type Money, type ProductStatus, type ProductUnit } from "@/schemas";
import { StatusChip, type Tone } from "@/features/seller/parts";

/** Below this many in stock, a live product shows "Low stock" (Figma "Seller – Products"). */
export const LOW_STOCK = 2;

/** Figma status chips: Live, Low stock, Out of stock; plus Draft and Archived. */
export function productStatusChip(status: ProductStatus, stock: number | null): { label: string; tone: Tone } {
  if (status === "archived") return { label: "Archived", tone: "neutral" };
  if (status === "draft") return { label: "Draft", tone: "neutral" };
  if (stock === 0) return { label: "Out of stock", tone: "danger" };
  if (stock !== null && stock <= LOW_STOCK) return { label: "Low stock", tone: "warning" };
  return { label: "Live", tone: "success" };
}

export function ProductStatusChip({ status, stock }: { status: ProductStatus; stock: number | null }) {
  const chip = productStatusChip(status, stock);
  return <StatusChip tone={chip.tone}>{chip.label}</StatusChip>;
}

export function priceLabel(price: Money | null): string {
  return price ? formatMoney(price) : "Price on request";
}

/** Minor units -> the decimal text the seller typed, e.g. 120500 OMR -> "120.500". No floats. */
export function toDecimalText(price: Money): string {
  const decimals = CURRENCY_DECIMALS[price.currency];
  const base = 10 ** decimals;
  return `${Math.floor(price.amountMinor / base)}.${String(price.amountMinor % base).padStart(decimals, "0")}`;
}

export function stockLabel(stock: number | null, unit: ProductUnit): string {
  if (stock === null) return "—";
  const words = UNIT_LABELS[unit];
  return unit === "piece" ? String(stock) : `${stock} ${stock === 1 ? words.one : words.many}`;
}
