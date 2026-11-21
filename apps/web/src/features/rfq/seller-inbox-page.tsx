"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { rfqListFilterSchema, type RfqListFilter, type SellerRfq } from "@/schemas";
import { focusRing } from "@/features/seller/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDeclineRfq, useSellerRfq, useSellerRfqs } from "./api";
import { BuyerPhotos, closesIn, DetailTiles, neededByLabel, quantityLabel, RfqChip, sellerStatus, sentAgo, shortAge, Thumb } from "./parts";
import { Spinner } from "@/components/ui/spinner";
import { FilterChips, WorkspacePanel, WorkspaceSplit } from "@/components/layout/workspace";
import { useToast } from "@/components/ui/toast";
import { useRfqQuotes } from "@/features/quotation/api";
import { RfqQuotes } from "@/features/quotation/quote-view";
import { SendQuoteDialog } from "@/features/quotation/send-quote-dialog";

/**
 * /seller/rfq-inbox: Figma "Seller – RFQ Inbox (Dark)" (177:731), converted
 * to the light Seller Centre palette (as "Seller – Products"). Left out: the
 * theme toggle (light only), "Condition" (requests do not ask for one) and
 * "Photo from buyer" (comes with the AI photo route). "Send quote" (Day 11)
 * opens the quotation form; the request then shows its quotations (PDF,
 * withdraw, revise).
 *
 * Tabs: All / New (waiting for your reply) / Replied / Closed. The open
 * request is in the URL (?id=), so the link in the seller's email opens it.
 */

const TABS: { filter: RfqListFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "open", label: "New" },
  { filter: "quoted", label: "Replied" },
  { filter: "closed", label: "Closed" },
];

export function SellerInboxPage() {
  const params = useSearchParams();
  const router = useRouter();
  const parsed = rfqListFilterSchema.safeParse(params.get("filter"));
  const filter: RfqListFilter = parsed.success ? parsed.data : "all";
  const idParam = params.get("id");

  const list = useSellerRfqs(filter);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = list.data?.pages[0]?.counts;
  // Desktop opens the newest request when none is chosen (as in Figma); phones show the list first.
  const activeId = idParam ?? items[0]?.id ?? null;

  function go(next: { filter?: RfqListFilter; id?: string | null }) {
    const query = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") query.set("filter", f);
    const id = next.id === undefined ? idParam : next.id;
    if (id) query.set("id", id);
    router.replace(query.size ? `/seller/rfq-inbox?${query}` : "/seller/rfq-inbox", { scroll: false });
  }

  // One full-height panel like the Messenger (21 Nov 2026): list and request side by side, no page scroll.
  return (
    <WorkspacePanel side="seller" title="RFQ Inbox" description="Buyers asking for parts you sell.">
      <WorkspaceSplit
        showDetail={Boolean(idParam)}
        list={
          <>
            <div className="shrink-0 px-3 pt-3 pb-2">
              <FilterChips
                label="Filter requests"
                value={filter}
                onChange={(key) => go({ filter: key, id: null })}
                items={TABS.map((tab) => ({ key: tab.filter, label: tab.label, count: counts?.[tab.filter] }))}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {list.isPending ? (
                <Spinner label="Loading requests" className="py-10" />
              ) : list.isError ? (
                <p role="alert" className="px-4 py-10 text-center text-sm text-destructive">
                  Could not load requests. Reload the page to try again.
                </p>
              ) : items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-text-muted">
                  {filter === "all" ? "No quote requests yet. Buyers find your live products in search and ask you here." : "Nothing here."}
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {items.map((rfq) => (
                    <li key={rfq.id}>
                      <RequestRow rfq={rfq} active={rfq.id === activeId} onOpen={() => go({ id: rfq.id })} />
                    </li>
                  ))}
                </ul>
              )}
              {list.hasNextPage ? (
                <button
                  type="button"
                  onClick={() => void list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  className={cn("mx-auto my-2 flex h-9 items-center rounded-full border border-line px-4 text-sm font-medium text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
                >
                  {list.isFetchingNextPage ? "Loading…" : "Show more"}
                </button>
              ) : null}
            </div>
          </>
        }
        detail={activeId ? <RequestDetail id={activeId} onBack={() => go({ id: null })} /> : <EmptyDetail />}
      />
    </WorkspacePanel>
  );
}

function RequestRow({ rfq, active, onOpen }: { rfq: SellerRfq; active: boolean; onOpen: () => void }) {
  const closed = rfq.status !== "open" && rfq.status !== "quoted";
  const status = sellerStatus(rfq.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cn("flex w-full items-start gap-3 rounded-[14px] px-3 py-3 text-left hover:bg-surface", active && "bg-surface", focusRing)}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
        <span className="flex min-w-0 items-center gap-2">
          {!rfq.seen && rfq.status === "open" ? <span aria-label="Unread" className="size-[7px] shrink-0 rounded-full bg-success" /> : null}
          <span className={cn("truncate text-[15px]", !rfq.seen && rfq.status === "open" ? "font-medium text-text-strong" : closed ? "text-text-subtle" : "text-text-strong")}>
            {title(rfq)}
          </span>
        </span>
        <span className="truncate text-[13px] text-text-subtle">
          {rfq.buyer.name} · {rfq.deliveryCity}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5 leading-[normal]">
        <span className="text-xs text-text-subtle">{shortAge(rfq.createdAt)}</span>
        {rfq.status !== "open" ? <RfqChip tone={status.tone}>{rfq.status === "quoted" ? "Replied" : "Closed"}</RfqChip> : null}
      </span>
    </button>
  );
}

function title(rfq: Pick<SellerRfq, "partName" | "fitment">): string {
  return rfq.fitment ? `${rfq.partName} · ${rfq.fitment}` : rfq.partName;
}

function EmptyDetail() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center p-8 text-center text-sm text-text-muted">
      Choose a request to see what the buyer needs.
    </div>
  );
}

function RequestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const detail = useSellerRfq(id);
  const rfq = detail.data;

  if (detail.isPending) {
    return (
      <Spinner className="h-full min-h-[240px]" />
    );
  }
  if (!rfq) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-[15px] text-text-muted">This request could not be found.</p>
        <button type="button" onClick={onBack} className={cn("text-sm font-medium text-text-strong underline", focusRing)}>
          Back to the inbox
        </button>
      </div>
    );
  }

  const status = sellerStatus(rfq.status);
  return (
    <article className="flex flex-col gap-5 p-5 sm:p-6">
      <button type="button" onClick={onBack} className={cn("flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-text-muted hover:text-text-strong lg:hidden", focusRing)}>
        <ArrowLeft aria-hidden className="size-4" />
        All requests
      </button>

      <header className="flex flex-col gap-2.5 leading-[normal]">
        <span className="flex">
          <RfqChip tone={status.tone}>{status.label}</RfqChip>
        </span>
        <h2 className="text-xl font-medium tracking-[-0.01em] break-words text-text-strong sm:text-[22px]">{title(rfq)}</h2>
        <p className="text-sm text-text-muted">
          {rfq.buyer.name} · {rfq.deliveryCity}, {rfq.deliveryCountryName} · {sentAgo(rfq.createdAt)} · {rfq.reference}
        </p>
      </header>

      <DetailTiles
        tiles={[
          { label: "Quantity", value: quantityLabel(rfq.quantity, rfq.unit) },
          { label: "Part number", value: rfq.partNumber ?? "Not given" },
          { label: "Needed by", value: neededByLabel(rfq.neededBy) },
        ]}
      />

      {rfq.note ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-text-strong">Note from buyer</p>
          <p className="text-base leading-[1.5] break-words whitespace-pre-line text-text-body">{rfq.note}</p>
        </div>
      ) : null}

      <BuyerPhotos urls={rfq.buyerPhotoUrls} label={rfq.buyerPhotoUrls.length > 1 ? "Buyer's photos of the part" : "Buyer's photo of the part"} />

      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-medium text-text-strong">Asked about</p>
        <Link href={`/seller/products/${rfq.product.id}`} className={cn("flex w-fit max-w-full items-center gap-4 rounded-[16px] hover:underline", focusRing)}>
          <Thumb src={rfq.product.photoUrl} size="lg" />
          <span className="min-w-0 truncate text-[15px] font-medium text-text-strong">{rfq.product.name}</span>
        </Link>
      </div>

      <Link
        href={`/seller/messages?rfq=${encodeURIComponent(rfq.id)}`}
        className={cn("w-fit rounded-full border border-line px-5 py-2.5 text-[15px] font-medium text-text-strong hover:bg-black/4", focusRing)}
      >
        Open chat with {rfq.buyer.name}
      </Link>

      <RfqQuotes side="seller" rfqId={rfq.id} />

      <div className="h-px w-full bg-line" />
      <Footer rfq={rfq} />
    </article>
  );
}

function Footer({ rfq }: { rfq: SellerRfq }) {
  const decline = useDeclineRfq();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [quoting, setQuoting] = useState(false);
  const quotes = useRfqQuotes("seller", rfq.id);
  const active = quotes.data?.find((quote) => quote.status === "active");
  const dialog = quoting ? <SendQuoteDialog rfq={rfq} revising={active} onClose={() => setQuoting(false)} /> : null;

  if (rfq.status === "declined") {
    return <p className="text-sm text-text-muted">You declined this request{rfq.declineReason ? `: “${rfq.declineReason}”` : "."}</p>;
  }
  if (rfq.status === "cancelled") return <p className="text-sm text-text-muted">The buyer cancelled this request.</p>;
  if (rfq.status === "expired") return <p className="text-sm text-text-muted">This request closed after 7 days without a reply.</p>;
  if (rfq.status === "quoted") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-text-muted">
          {active ? "You replied with a quotation. Send a revised one if the price or terms change." : "Your quotation is no longer valid. Send a new one if you can still supply."}
        </p>
        <button
          type="button"
          onClick={() => setQuoting(true)}
          className={cn("h-11 rounded-full border border-line px-5 text-[15px] font-medium text-text-strong hover:bg-black/4", focusRing)}
        >
          {active ? "Send revised quotation" : "Send new quotation"}
        </button>
        {dialog}
      </div>
    );
  }

  const error = decline.error instanceof ApiError ? decline.error.message : decline.error ? "Something went wrong. Please try again." : null;

  return (
    <div className="flex flex-col gap-3">
      {asking ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (decline.isPending) return;
            decline.mutate({ id: rfq.id, reason: reason.trim() || null }, {
                onSuccess: () => {
                  setAsking(false);
                  toast.success("Request declined.");
                },
              });
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="decline-reason" className="text-sm font-medium text-text-strong">
            Tell the buyer why <span className="font-normal text-text-subtle">Optional</span>
          </label>
          <input
            id="decline-reason"
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Out of stock until next month"
            className={cn("h-[52px] w-full rounded-[12px] border border-line bg-panel px-4 text-base text-text-strong placeholder:text-text-subtle", focusRing)}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={decline.isPending}
              className={cn("h-11 rounded-full bg-[#0c0c0d] px-6 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}
            >
              {decline.isPending ? "Declining…" : "Decline request"}
            </button>
            <button type="button" onClick={() => setAsking(false)} className={cn("h-11 rounded-full border border-line px-5 text-[15px] font-medium text-text-strong hover:bg-black/4", focusRing)}>
              Keep it
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-text-muted">{closesIn(rfq.expiresAt)} if you do not reply.</p>
          <button
            type="button"
            onClick={() => setQuoting(true)}
            className={cn("h-11 rounded-full bg-side-accent px-6 text-[15px] font-semibold text-white hover:opacity-90", focusRing)}
          >
            Send quote
          </button>
          <button
            type="button"
            onClick={() => {
              decline.reset();
              setAsking(true);
            }}
            className={cn("rounded-full px-2 py-4 text-[15px] leading-[normal] font-medium text-text-muted hover:text-text-strong", focusRing)}
          >
            Decline
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}
