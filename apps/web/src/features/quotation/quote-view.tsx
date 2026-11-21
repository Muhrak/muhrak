"use client";

import { ChevronDown, FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { formatMoney, QUOTE_STATUS_LABELS, type Quote, type QuoteStatus } from "@/schemas";
import type { PortalSide } from "@/features/auth/paths";
import { RfqChip } from "@/features/rfq/parts";
import { focusRing } from "@/features/seller/parts";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { downloadQuotePdf, useRfqQuotes, useWithdrawQuote } from "./api";

/**
 * A request's quotations (Day 11), for its buyer and its seller. The newest
 * is shown in full (items, totals, terms, notes, PDF); earlier ones (replaced,
 * withdrawn, expired) are listed below it. Every number comes from the API.
 */

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Muscat" });
export const quoteDate = (iso: string) => dateFormat.format(new Date(iso));

export function quoteStatus(status: QuoteStatus): { label: string; tone: "new" | "closed" } {
  return { label: status === "active" ? "Valid" : status === "superseded" ? "Replaced" : QUOTE_STATUS_LABELS[status], tone: status === "active" ? "new" : "closed" };
}

export function itemCountLabel(quote: Pick<Quote, "items">): string {
  return `${quote.items.length} item${quote.items.length === 1 ? "" : "s"}`;
}

/** The quotations of one request, or nothing while there are none. */
export function RfqQuotes({ side, rfqId }: { side: PortalSide; rfqId: string }) {
  const quotes = useRfqQuotes(side, rfqId);
  const [showEarlier, setShowEarlier] = useState(false);
  if (quotes.isPending) return null;
  if (quotes.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load the quotations. Reload the page to try again.
      </p>
    );
  }
  const [latest, ...earlier] = quotes.data;
  if (!latest) return null;
  return (
    <div className="flex flex-col gap-3">
      <QuoteDetails side={side} quote={latest} />
      {earlier.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={showEarlier}
            onClick={() => setShowEarlier((value) => !value)}
            className={cn("flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-text-muted hover:text-text-strong", focusRing)}
          >
            Earlier quotations ({earlier.length})
            <ChevronDown aria-hidden className={cn("size-4 transition-transform", showEarlier && "rotate-180")} />
          </button>
          {showEarlier ? (
            <ul className="flex flex-col divide-y divide-line rounded-[16px] border border-line">
              {earlier.map((quote) => (
                <li key={quote.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="font-medium text-text-strong">{quote.reference}</span>
                  <span className="text-text-muted">
                    {quoteDate(quote.createdAt)} · {itemCountLabel(quote)} · {formatMoney(quote.total)}
                  </span>
                  <span className="flex-1" />
                  <RfqChip tone={quoteStatus(quote.status).tone}>{quoteStatus(quote.status).label}</RfqChip>
                  <PdfButton side={side} quote={quote} compact />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QuoteDetails({ side, quote }: { side: PortalSide; quote: Quote }) {
  const status = quoteStatus(quote.status);
  return (
    <section aria-label={`Quotation ${quote.reference}`} className="flex flex-col gap-4 rounded-[20px] border border-line p-4 sm:p-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] font-medium text-text-strong">
            <span className="whitespace-nowrap">Quotation {quote.reference}</span>
            <RfqChip tone={status.tone}>{status.label}</RfqChip>
          </p>
          <p className="text-[13px] text-text-muted">
            {side === "buyer" ? `From ${quote.seller.companyName} · ` : ""}Sent {quoteDate(quote.createdAt)} ·{" "}
            {quote.status === "active" ? `Valid until ${quoteDate(quote.validUntil)}` : quote.closedAt ? `${status.label} ${quoteDate(quote.closedAt)}` : status.label}
          </p>
        </div>
        <PdfButton side={side} quote={quote} />
      </header>

      {/* Items: a table from sm up, stacked rows on phones. */}
      <div className="overflow-hidden rounded-[14px] border border-line">
        <table className="w-full border-collapse text-sm max-sm:hidden">
          <thead>
            <tr className="bg-surface text-left text-[13px] text-text-muted">
              <th scope="col" className="w-10 px-3 py-2.5 font-medium">#</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Item</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Qty</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Rate</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.position} className="border-t border-line align-top">
                <td className="px-3 py-2.5 text-text-muted">{item.position}.</td>
                <td className="px-3 py-2.5 text-text-strong">
                  <ItemText item={item} />
                </td>
                <td className="px-3 py-2.5 text-right text-text-strong tabular-nums">{item.quantity.toLocaleString("en-US")}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-text-strong tabular-nums">{formatMoney(item.unitPrice)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-text-strong tabular-nums">{formatMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-line sm:hidden">
          {quote.items.map((item) => (
            <li key={item.position} className="flex flex-col gap-1 px-3.5 py-3 text-sm">
              <span className="text-text-strong">
                {item.position}. <ItemText item={item} />
              </span>
              <span className="flex justify-between gap-3 text-text-muted tabular-nums">
                <span>
                  {item.quantity.toLocaleString("en-US")} × {formatMoney(item.unitPrice)}
                </span>
                <span className="font-medium text-text-strong">{formatMoney(item.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Totals quote={quote} />

      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-text-muted">Delivery</dt>
        <dd className="text-text-strong">
          Within {quote.deliveryDays} day{quote.deliveryDays === 1 ? "" : "s"} after payment, to {quote.buyer.deliveryCity}, {quote.buyer.deliveryCountryName}
        </dd>
        <dt className="text-text-muted">Payment</dt>
        <dd className="text-text-strong">On Muhrak, before the order starts</dd>
      </dl>

      {quote.terms ? <TextBlock title="Seller's terms" text={quote.terms} /> : null}
      {quote.notes ? <TextBlock title="Notes" text={quote.notes} /> : null}

      {side === "seller" && quote.status === "active" ? <WithdrawControl quote={quote} /> : null}
    </section>
  );
}

function ItemText({ item }: { item: Quote["items"][number] }) {
  return (
    <span className="break-words">
      {item.partNumber ? <span className="font-medium">{item.partNumber} </span> : null}
      {item.description}
      {item.details ? <span className="mt-0.5 block text-[13px] whitespace-pre-line text-text-muted">{item.details}</span> : null}
    </span>
  );
}

function Totals({ quote }: { quote: Quote }) {
  const rows: [string, string][] = [
    ["Items", formatMoney(quote.subtotal)],
    ["Shipping", quote.shipping.amountMinor === 0 ? "Free" : formatMoney(quote.shipping)],
    [quote.vatRateBp > 0 ? `VAT ${quote.vatRateBp / 100}%` : "VAT", quote.vatRateBp > 0 ? formatMoney(quote.vat) : "Not charged"],
  ];
  return (
    <dl className="ml-auto flex w-full max-w-[340px] flex-col gap-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-text-muted">{label}</dt>
          <dd className="text-text-strong tabular-nums">{value}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2.5 text-base">
        <dt className="font-medium text-text-strong">Total</dt>
        <dd className="font-semibold text-text-strong tabular-nums">{formatMoney(quote.total)}</dd>
      </div>
    </dl>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-text-strong">{title}</p>
      <p className="text-sm leading-[1.5] break-words whitespace-pre-line text-text-body">{text}</p>
    </div>
  );
}

export function PdfButton({ side, quote, compact }: { side: PortalSide; quote: Pick<Quote, "id" | "reference">; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadQuotePdf(side, quote);
        } catch (error) {
          toast.error(error instanceof ApiError ? error.message : "The PDF could not be downloaded. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
      aria-label={compact ? `Download ${quote.reference} as PDF` : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border border-line font-medium text-text-strong hover:bg-black/4 disabled:opacity-60",
        compact ? "size-9 justify-center" : "h-9 px-3.5 text-sm",
        focusRing,
      )}
    >
      {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileDown aria-hidden className="size-4" />}
      {compact ? null : "PDF"}
    </button>
  );
}

function WithdrawControl({ quote }: { quote: Quote }) {
  const withdraw = useWithdrawQuote();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const error = withdraw.error instanceof ApiError ? withdraw.error.message : withdraw.error ? "Something went wrong. Please try again." : null;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-text-body">The buyer will see this quotation as withdrawn and can no longer accept it.</p>
          <button
            type="button"
            disabled={withdraw.isPending}
            onClick={() =>
              withdraw.mutate(quote.id, {
                onSuccess: () => {
                  setConfirming(false);
                  toast.success("Quotation withdrawn.");
                },
              })
            }
            className={cn("h-9 rounded-full bg-[#0c0c0d] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}
          >
            {withdraw.isPending ? "Withdrawing…" : "Yes, withdraw"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={cn("h-9 rounded-full border border-line px-4 text-sm font-medium text-text-strong hover:bg-black/4", focusRing)}>
            Keep it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            withdraw.reset();
            setConfirming(true);
          }}
          className={cn("w-fit rounded-sm text-sm font-medium text-text-muted hover:text-text-strong", focusRing)}
        >
          Withdraw quotation
        </button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
