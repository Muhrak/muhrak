"use client";

import Link from "next/link";
import { Icon } from "@/components/layout/icon";
import { useCurrentUser } from "@/features/auth/hooks";
import { AccountBadge, EmptyPanel, OutlinePillLink, PageHeader, PanelRow, SolidPillLink, StatCards } from "./parts";

/**
 * Figma "Buyer – Dashboard" converted to the light theme of
 * "Seller – Dashboard (Light)": white cards on grey, the Muhrak AI card as
 * the black highlight card. Empty state for a new buyer; the photo search
 * itself arrives on Day 6.
 */
export function BuyerDashboard() {
  const user = useCurrentUser();
  if (!user) return null;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.fullName}`}
        meta={user.email}
        badge={<AccountBadge label="Buyer account" dotClass="bg-white" />}
        actions={
          <>
            <OutlinePillLink href="/buyer/find-part">Browse parts</OutlinePillLink>
            <SolidPillLink href="/buyer/find-part" tone="navy">
              Ask Muhrak AI
            </SolidPillLink>
          </>
        }
      />
      <MuhrakAiCard />
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
        href="/buyer/find-part"
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
