"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { rfqListFilterSchema, type BuyerRfq, type RfqListFilter } from "@/schemas";
import { FilterChips, WorkspacePanel, WorkspaceSplit, workspaceButton } from "@/components/layout/workspace";
import { focusRing } from "@/features/seller/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useBuyerRfq, useBuyerRfqs, useCancelRfq } from "./api";
import { BuyerPhotos, buyerStatus, closesIn, DetailTiles, neededByLabel, quantityLabel, RfqChip, sentAgo } from "./parts";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { RfqQuotes } from "@/features/quotation/quote-view";

/**
 * /buyer/requests: Figma "Buyer – Inquiries & RFQs (Dark)" (304:12),
 * converted to the light Buyer Centre palette. Each request went to one
 * seller (developer decision, 15 Nov 2026), so the detail shows that
 * seller; the seller's quotations (Day 11) show under it, newest first, each
 * with its PDF. Filters:
 * All / Open / Quoted / Closed (there are no separate "inquiries" yet).
 * Left out: the theme toggle (light only) and the AI block (text search
 * requests have no photo).
 *
 * Layout (21 Nov 2026, developer request): one full-height panel like the
 * Messenger (WorkspacePanel): compact title, list and detail side by side,
 * each scrolling on its own; no page scroll.
 */

const TABS: { filter: RfqListFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "open", label: "Open" },
  { filter: "quoted", label: "Quoted" },
  { filter: "closed", label: "Closed" },
];

export function BuyerRequestsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const parsed = rfqListFilterSchema.safeParse(params.get("filter"));
  const filter: RfqListFilter = parsed.success ? parsed.data : "all";
  const idParam = params.get("id");

  const list = useBuyerRfqs(filter);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const activeId = idParam ?? items[0]?.id ?? null;

  function go(next: { filter?: RfqListFilter; id?: string | null }) {
    const query = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") query.set("filter", f);
    const id = next.id === undefined ? idParam : next.id;
    if (id) query.set("id", id);
    router.replace(query.size ? `/buyer/requests?${query}` : "/buyer/requests", { scroll: false });
  }

  return (
    <WorkspacePanel
      side="buyer"
      title="Inquiries & RFQs"
      description="Parts you asked sellers to quote."
      actions={
        <>
          <Link href="/search" className={workspaceButton.outline}>
            Browse parts
          </Link>
          <Link href="/ai" className={workspaceButton.solid}>
            Ask Muhrak AI
          </Link>
        </>
      }
    >
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
                <Spinner label="Loading your requests" className="py-10" />
              ) : list.isError ? (
                <p role="alert" className="px-4 py-10 text-center text-sm text-destructive">
                  Could not load your requests. Reload the page to try again.
                </p>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                  <p className="text-sm text-text-muted">{filter === "all" ? "You have not asked for a quote yet." : "Nothing here."}</p>
                  {filter === "all" ? (
                    <Link href="/search" className={workspaceButton.solid}>
                      Find a part
                    </Link>
                  ) : null}
                </div>
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
        detail={
          activeId ? (
            <RequestDetail id={activeId} onBack={() => go({ id: null })} />
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center p-8 text-center text-sm text-text-muted">Your quote requests appear here.</div>
          )
        }
      />
    </WorkspacePanel>
  );
}

function title(rfq: Pick<BuyerRfq, "partName" | "fitment">): string {
  return rfq.fitment ? `${rfq.partName} · ${rfq.fitment}` : rfq.partName;
}

function RequestRow({ rfq, active, onOpen }: { rfq: BuyerRfq; active: boolean; onOpen: () => void }) {
  const status = buyerStatus(rfq.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      className={cn("flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left hover:bg-surface", active && "bg-surface", focusRing)}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
        <span className="truncate text-[15px] font-medium text-text-strong">{title(rfq)}</span>
        <span className="truncate text-xs text-text-subtle">
          RFQ · Sent {sentAgo(rfq.createdAt)} · {rfq.seller.companyName}
        </span>
      </span>
      <RfqChip tone={status.tone}>{status.label}</RfqChip>
    </button>
  );
}

function RequestDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const detail = useBuyerRfq(id);
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
          Back to your requests
        </button>
      </div>
    );
  }

  const status = buyerStatus(rfq.status);
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
        <p className="text-[13px] text-text-subtle">
          RFQ #{rfq.reference} · Sent {sentAgo(rfq.createdAt)} · Delivery to {rfq.deliveryCity}, {rfq.deliveryCountryName}
        </p>
      </header>

      <DetailTiles
        tiles={[
          { label: "Quantity", value: quantityLabel(rfq.quantity, rfq.unit) },
          { label: "Part number", value: rfq.partNumber ?? "Not given" },
          { label: "Needed by", value: neededByLabel(rfq.neededBy) },
        ]}
      />

      <BuyerPhotos urls={rfq.buyerPhotoUrls} label={rfq.buyerPhotoUrls.length > 1 ? "Your photos, shared with the seller" : "Your photo, shared with the seller"} />

      {/* Who it went to (Figma: the photo + "Muhrak AI" block). */}
      <div className="flex items-center gap-4">
        <span className="flex size-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#ededf0]">
          {rfq.product.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public product photo thumbnail
            <img src={rfq.product.photoUrl} alt="" className="size-full object-contain" />
          ) : null}
        </span>
        <div className="flex min-w-0 flex-col gap-1 leading-[normal]">
          <p className="truncate text-[15px] font-medium text-text-strong">{rfq.product.name}</p>
          <p className="truncate text-[13px] text-text-subtle">
            Sent to{" "}
            <Link href={`/sellers/${rfq.seller.id}`} className={cn("rounded-sm text-text-body hover:underline", focusRing)}>
              {rfq.seller.companyName}
            </Link>
            {rfq.seller.city ? ` · ${rfq.seller.city}, ${rfq.seller.countryName}` : ""}
          </p>
        </div>
      </div>

      {rfq.note ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-text-strong">Your note</p>
          <p className="text-[15px] leading-[1.5] break-words whitespace-pre-line text-text-body">{rfq.note}</p>
        </div>
      ) : null}

      <Link
        href={`/buyer/messages?rfq=${encodeURIComponent(rfq.id)}`}
        className={cn("w-fit rounded-full border border-line px-5 py-2.5 text-[15px] font-medium text-text-strong hover:bg-black/4", focusRing)}
      >
        Open chat with {rfq.seller.companyName}
      </Link>

      <RfqQuotes side="buyer" rfqId={rfq.id} />

      <div className="h-px w-full bg-line" />
      <Outcome rfq={rfq} />
    </article>
  );
}

function Outcome({ rfq }: { rfq: BuyerRfq }) {
  const cancel = useCancelRfq();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const error = cancel.error instanceof ApiError ? cancel.error.message : cancel.error ? "Something went wrong. Please try again." : null;

  if (rfq.status === "declined") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-text-body">
          {rfq.seller.companyName} declined this request{rfq.declineReason ? `: “${rfq.declineReason}”` : "."}
        </p>
        <Link href={`/search?q=${encodeURIComponent(rfq.partNumber ?? rfq.partName)}`} className={cn("w-fit rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-text-strong hover:bg-black/4", focusRing)}>
          Find another seller
        </Link>
      </div>
    );
  }
  if (rfq.status === "cancelled") return <p className="text-[15px] text-text-muted">You cancelled this request.</p>;
  if (rfq.status === "expired") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-text-muted">{rfq.seller.companyName} did not reply within 7 days, so this request closed.</p>
        <Link href={`/search?q=${encodeURIComponent(rfq.partNumber ?? rfq.partName)}`} className={cn("w-fit rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-text-strong hover:bg-black/4", focusRing)}>
          Search again
        </Link>
      </div>
    );
  }
  if (rfq.status === "quoted") {
    return <p className="text-[15px] text-text-body">{rfq.seller.companyName} sent you a quotation. Ask them anything about it in the chat.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
          <p className="text-[15px] font-medium text-text-strong">Waiting for a quote</p>
          <p className="text-[13px] text-text-subtle">{closesIn(rfq.expiresAt)} if {rfq.seller.companyName} does not reply.</p>
        </div>
        {confirming ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(rfq.id, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success("Request cancelled.", "The seller can no longer reply to it.");
                  },
                })}
              className={cn("h-9 rounded-full bg-[#0c0c0d] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}
            >
              {cancel.isPending ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={cn("h-9 rounded-full border border-line px-4 text-sm font-medium text-text-strong hover:bg-black/4", focusRing)}>
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              cancel.reset();
              setConfirming(true);
            }}
            className={cn("h-9 rounded-full border border-line px-4 text-sm font-medium text-text-strong hover:bg-black/4", focusRing)}
          >
            Cancel request
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
