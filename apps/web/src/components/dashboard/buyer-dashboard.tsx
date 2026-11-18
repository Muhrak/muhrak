"use client";

import Link from "next/link";
import { Icon } from "@/components/layout/icon";
import { useCurrentUser } from "@/features/auth/hooks";
import { EmptyPanel, OutlinePillLink, PanelRow, SolidPillLink, StatCards } from "./parts";

/**
 * Figma "Buyer – Dashboard" converted to the light theme of
 * "Seller – Dashboard (Light)": white cards on grey, the Muhrak AI card as
 * the black highlight card. Empty state for a new buyer; the photo search
 * itself arrives on Day 6.
 */
export function BuyerDashboard() {
  const user = useCurrentUser("buyer");
  if (!user) return null;

  return (
    <>
      {/* Welcome card and Muhrak AI card side by side (developer request, 17 Nov 2026). */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Your account" className="flex flex-col justify-between gap-6 rounded-[24px] bg-panel px-5 py-6 sm:px-7">
          <div className="flex min-w-0 flex-col gap-2.5 leading-[normal]">
            <h1 className="text-[24px] font-medium tracking-[-0.02em] break-words text-text-strong sm:text-[28px]">Welcome back, {user.fullName}</h1>
            <p className="truncate text-base text-text-muted">{user.email}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <OutlinePillLink href="/search">Browse parts</OutlinePillLink>
            <SolidPillLink href="/ai">Ask Muhrak AI</SolidPillLink>
          </div>
        </section>
        <MuhrakAiCard />
      </div>
      <StatCards
        stats={[
          { label: "Open requests", value: 0, note: "No requests yet" },
          { label: "Orders in progress", value: 0, note: "Nothing on the way" },
          { label: "Quotes received", value: 0, note: "Quotes from sellers show here" },
        ]}
      />
      <PanelRow>
        <EmptyPanel
          title="My requests"
          link={{ href: "/buyer/requests", label: "View all" }}
          icon="empty-message"
          emptyTitle="No requests yet"
          emptyText="Snap a photo of a part to get quotes from sellers."
        />
        <EmptyPanel
          title="My orders"
          link={{ href: "/buyer/orders", label: "View all" }}
          icon="empty-box"
          emptyTitle="No orders yet"
          emptyText="Orders you confirm with a seller show up here."
        />
      </PanelRow>
    </>
  );
}

function MuhrakAiCard() {
  return (
    <section aria-label="Muhrak AI" className="flex flex-col gap-5 rounded-[24px] bg-feature px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <p className="flex items-center gap-2 text-sm leading-[normal] text-sidebar-text">
            <span className="rounded-full bg-buyer-gradient px-[7px] py-0.5 text-[10px] font-bold text-white">AI</span>
            Muhrak AI
          </p>
          <h2 className="text-[22px] leading-[normal] font-medium text-white sm:text-[28px]">Not sure what it’s called? Snap it.</h2>
        </div>
        <p className="text-sm leading-[normal] text-feature-muted">No searches yet</p>
      </div>
      <Link
        href="/ai"
        className="flex items-center gap-4 rounded-[16px] border border-dashed border-white/14 bg-white/6 px-6 py-[22px] text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/40"
      >
        <Icon name="upload" className="size-[22px]" />
        <span className="flex min-w-0 flex-col gap-1 leading-[normal]">
          <span className="text-base">Drop a photo of the part or browse</span>
          <span className="text-[13px] text-feature-muted">JPG or PNG. Muhrak AI finds the part and the sellers who stock it.</span>
        </span>
      </Link>
    </section>
  );
}
