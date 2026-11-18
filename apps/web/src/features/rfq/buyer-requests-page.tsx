"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { rfqListFilterSchema, type BuyerRfq, type RfqListFilter } from "@/schemas";
import { OutlinePillLink, SolidPillLink } from "@/components/dashboard/parts";
import { focusRing } from "@/features/seller/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useBuyerRfq, useBuyerRfqs, useCancelRfq } from "./api";
import { buyerStatus, closesIn, DetailTiles, neededByLabel, quantityLabel, RfqChip, sentAgo } from "./parts";
import { LogoLoader } from "@/components/ui/logo-loader";
import { useToast } from "@/components/ui/toast";

/**
 * /buyer/requests: Figma "Buyer – Inquiries & RFQs (Dark)" (304:12),
 * converted to the light Buyer Centre palette. Each request went to one
 * seller (developer decision, 15 Nov 2026), so the detail shows that
 * seller instead of a list of quotes; quotes arrive with Day 11. Filters:
 * All / Open / Quoted / Closed (there are no separate "inquiries" yet).
 * Left out: the theme toggle (light only) and the AI block (text search
 * requests have no photo).
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
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2 leading-[normal]">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">Inquiries &amp; RFQs</h1>
          <p className="text-base text-text-muted">Parts you asked sellers to quote.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <OutlinePillLink href="/search">Browse parts</OutlinePillLink>
          <SolidPillLink href="/ai">Ask Muhrak AI</SolidPillLink>
        </div>
      </div>

      <nav aria-label="Filter requests" className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {TABS.map((tab) => {
          const active = tab.filter === filter;
          return (
            <button
              key={tab.filter}
              type="button"
              aria-pressed={active}
              onClick={() => go({ filter: tab.filter, id: null })}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm leading-[normal] font-medium whitespace-nowrap",
                active ? "bg-[#0c0c0d] text-white" : "border border-line bg-panel text-text-strong hover:bg-black/4",
                focusRing,
              )}
            >
              {tab.label}
              {counts ? <span className={cn("text-xs font-normal", active ? "text-white/55" : "text-text-subtle")}>{counts[tab.filter]}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row lg:items-start">
        <section
          aria-label="Requests"
          className={cn("flex w-full shrink-0 flex-col rounded-[24px] bg-panel p-2.5 lg:sticky lg:top-6 lg:w-[420px]", idParam && "hidden lg:flex")}
        >
          {list.isPending ? (
<LogoLoader label="Loading your requests" className="py-10" />
          ) : list.isError ? (
            <p role="alert" className="px-4 py-10 text-center text-sm text-destructive">
              Could not load your requests. Reload the page to try again.
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="text-[15px] text-text-muted">{filter === "all" ? "You have not asked for a quote yet." : "Nothing here."}</p>
              {filter === "all" ? (
                <Link href="/search" className={cn("rounded-full bg-side-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90", focusRing)}>
                  Find a part
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-col">
              {items.map((rfq, index) => (
                <li key={rfq.id} className={cn(index > 0 && "border-t border-line")}>
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
              className={cn("mx-auto my-2 h-10 rounded-full border border-line px-5 text-sm font-semibold text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
            >
              {list.isFetchingNextPage ? "Loading…" : "Show more"}
            </button>
          ) : null}
        </section>

        <section aria-label="Request" className={cn("min-w-0 flex-1", !idParam && "hidden lg:block")}>
          {activeId ? (
            <RequestDetail id={activeId} onBack={() => go({ id: null })} />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-[24px] bg-panel p-8 text-center text-[15px] text-text-muted">
              Your quote requests appear here.
            </div>
          )}
        </section>
      </div>
    </>
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
      className={cn("flex w-full items-center gap-3 rounded-[16px] px-3.5 py-3.5 text-left hover:bg-surface", active && "bg-surface", focusRing)}
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
      <LogoLoader className="rounded-[24px] bg-panel p-10" />
    );
  }
  if (!rfq) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[24px] bg-panel p-8 text-center">
        <p className="text-[15px] text-text-muted">This request could not be found.</p>
        <button type="button" onClick={onBack} className={cn("text-sm font-medium text-text-strong underline", focusRing)}>
          Back to your requests
        </button>
      </div>
    );
  }

  const status = buyerStatus(rfq.status);
  return (
    <article className="flex flex-col gap-5 rounded-[24px] bg-panel p-5 sm:p-7">
      <button type="button" onClick={onBack} className={cn("flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-text-muted hover:text-text-strong lg:hidden", focusRing)}>
        <ArrowLeft aria-hidden className="size-4" />
        All requests
      </button>

      <header className="flex flex-col gap-2.5 leading-[normal]">
        <span className="flex">
          <RfqChip tone={status.tone}>{status.label}</RfqChip>
        </span>
        <h2 className="text-[22px] font-medium tracking-[-0.01em] break-words text-text-strong sm:text-[26px]">{title(rfq)}</h2>
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
  if (rfq.status === "quoted") return <p className="text-[15px] text-text-body">{rfq.seller.companyName} sent you a quote.</p>;

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
