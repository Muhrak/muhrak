"use client";

import type { VerificationStatus } from "@/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSellerStats } from "../shell";
import { cn } from "@/lib/utils";
import { useSellerList } from "./api";
import { Avatar, DOC_SHORT, focusRing, formatDate, Panel, place, StatusChip, VERIFICATION, waitingFor } from "./parts";

/**
 * Figma "Admin – Sellers" (405:1892), dark frame converted to light.
 * Left out for now: theme toggle, "Export CSV", "Invite seller", and the
 * products, GMV, rating and account-status columns (no such data yet).
 * The queue's Approve / Reject buttons open the review page instead: a
 * seller is never approved without looking at the documents.
 */
export function SellersPage() {
  return (
    <>
      <div className="flex flex-col gap-2 leading-[normal]">
        <h1 className="text-[28px] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">Sellers</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-base text-text-muted">Verify, monitor and manage every seller on Muhrak.</p>
          <span className="flex h-6 items-center gap-1.5 rounded-full bg-sidebar-bg px-2.5 text-[13px] font-medium text-white">
            <span aria-hidden className="size-1.5 rounded-full bg-admin-orange" />
            Admin
          </span>
        </div>
      </div>
      <Kpis />
      <Queue />
      <AllSellers />
    </>
  );
}

function Kpis() {
  const stats = useSellerStats().data;
  const cards = [
    { label: "Total sellers", value: stats?.total, note: stats ? `${stats.draft} have not submitted yet` : "" },
    {
      label: "Awaiting verification",
      value: stats?.pending,
      note: stats?.oldestPendingAt ? `Oldest waiting ${waitingFor(stats.oldestPendingAt)}` : "Nobody waiting",
    },
    {
      label: "Verified",
      value: stats?.approved,
      note: stats && stats.total > 0 ? `${Math.round((stats.approved / stats.total) * 100)}% of all sellers` : "",
    },
    { label: "Changes needed", value: stats?.rejected, note: "Waiting for the seller to fix" },
  ];
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="flex flex-col gap-1.5 rounded-[24px] bg-panel px-[26px] py-[22px] leading-[normal]">
          <p className="text-[15px] text-text-body">{card.label}</p>
          <p className="text-[46px] font-light tracking-[-0.02em] text-text-strong">{card.value ?? "–"}</p>
          <p className="min-h-4 text-[13px] text-text-subtle">{card.note}</p>
        </div>
      ))}
    </div>
  );
}

function Queue() {
  const list = useSellerList("pending", 10);
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Panel label="Verification queue">
      <div className="flex flex-wrap items-center gap-3 pb-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
          <h2 className="text-xl font-medium text-text-strong">Verification queue</h2>
          <p className="text-[13px] text-text-subtle">Oldest first · review the documents before deciding</p>
        </div>
      </div>
      {list.isPending ? (
        <p className="py-6 text-sm text-text-muted">Loading…</p>
      ) : list.isError ? (
        <p role="alert" className="py-6 text-sm text-destructive">Could not load the queue. Reload the page.</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-sm text-text-muted">No sellers are waiting for review.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((seller, index) => (
            <li key={seller.userId} className={cn("flex flex-wrap items-center gap-3.5 py-3", index > 0 && "border-t border-line")}>
              <Avatar name={seller.companyName} />
              <div className="flex min-w-[180px] flex-1 flex-col gap-0.5 leading-[normal]">
                <p className="text-[15px] font-medium text-text-strong">{seller.companyName}</p>
                <p className="text-[13px] text-text-subtle">{place(seller.country, seller.city)}</p>
              </div>
              <p className="w-48 text-sm text-text-body max-md:hidden">{seller.documents.map((type) => DOC_SHORT[type]).join(", ")}</p>
              <p className="w-32 text-sm text-text-subtle">Waiting {waitingFor(seller.submittedAt)}</p>
              <Link
                href={`/admin/sellers/${seller.userId}`}
                className={cn("flex h-9 items-center justify-center rounded-full bg-sidebar-bg px-4 text-sm font-medium text-white hover:opacity-90", focusRing)}
              >
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage ? <LoadMore onClick={() => list.fetchNextPage()} busy={list.isFetchingNextPage} /> : null}
    </Panel>
  );
}

const FILTERS: { label: string; status?: VerificationStatus }[] = [
  { label: "All" },
  { label: "In review", status: "pending" },
  { label: "Verified", status: "approved" },
  { label: "Changes needed", status: "rejected" },
  { label: "Not submitted", status: "draft" },
];

function AllSellers() {
  const [status, setStatus] = useState<VerificationStatus | undefined>();
  const list = useSellerList(status);
  const router = useRouter();
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Panel label="All sellers" className="gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-xl leading-[normal] font-medium text-text-strong">All sellers</h2>
        <div role="tablist" aria-label="Filter by verification" className="flex flex-wrap gap-1 rounded-full bg-surface p-1">
          {FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              role="tab"
              aria-selected={status === filter.status}
              onClick={() => setStatus(filter.status)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium",
                status === filter.status ? "bg-sidebar-bg text-white" : "text-text-muted hover:text-text-strong",
                focusRing,
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left leading-[normal]">
          <thead>
            <tr className="text-xs font-medium tracking-[0.06em] text-text-subtle uppercase">
              <th className="pb-2.5 font-medium">Seller</th>
              <th className="pb-2.5 font-medium">Country</th>
              <th className="pb-2.5 font-medium">Documents</th>
              <th className="pb-2.5 font-medium">Verification</th>
              <th className="pb-2.5 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((seller) => (
              <tr
                key={seller.userId}
                onClick={() => router.push(`/admin/sellers/${seller.userId}`)}
                className="h-14 cursor-pointer border-t border-line text-sm text-text-body hover:bg-surface/60"
              >
                <td className="py-2 pr-4">
                  <Link href={`/admin/sellers/${seller.userId}`} className={cn("flex items-center gap-3 rounded-sm", focusRing)}>
                    <Avatar name={seller.companyName} size={34} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-medium text-text-strong">{seller.companyName}</span>
                      <span className="truncate text-[13px] text-text-subtle">{seller.email}</span>
                    </span>
                  </Link>
                </td>
                <td className="pr-4">{place(seller.country, seller.city)}</td>
                <td className="pr-4">{seller.documents.length}</td>
                <td className="pr-4">
                  <StatusChip tone={VERIFICATION[seller.status].tone}>{VERIFICATION[seller.status].label}</StatusChip>
                </td>
                <td className="text-text-subtle">{formatDate(seller.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isPending ? <p className="py-6 text-sm text-text-muted">Loading…</p> : null}
        {list.isError ? <p role="alert" className="py-6 text-sm text-destructive">Could not load sellers. Reload the page.</p> : null}
        {!list.isPending && !list.isError && rows.length === 0 ? <p className="py-6 text-sm text-text-muted">No sellers here yet.</p> : null}
      </div>
      {list.hasNextPage ? <LoadMore onClick={() => list.fetchNextPage()} busy={list.isFetchingNextPage} /> : null}
    </Panel>
  );
}

function LoadMore({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn("mt-3 h-9 self-center rounded-full border border-black/30 px-4 text-[13px] font-medium text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
    >
      {busy ? "Loading…" : "Load more"}
    </button>
  );
}
