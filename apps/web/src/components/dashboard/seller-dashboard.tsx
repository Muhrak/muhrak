"use client";

import Link from "next/link";
import { Icon } from "@/components/layout/icon";
import { useCurrentUser } from "@/features/auth/hooks";
import { cn } from "@/lib/utils";
import { AccountBadge, EmptyPanel, OutlinePillLink, PageHeader, PanelRow, SolidPillLink, StatCards } from "./parts";

/**
 * Figma "Seller – Dashboard (Light)" for a new seller: everything empty,
 * with the "Finish setting up your store" checklist. Counts are zero until
 * products (Day 5) and RFQs (Day 10) exist.
 */
export function SellerDashboard() {
  const user = useCurrentUser("seller");
  if (!user) return null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName}`}
        meta={user.email}
        badge={<AccountBadge label="Seller account" dotClass="bg-success" />}
        actions={
          <>
            <OutlinePillLink href="/seller/store">View my store</OutlinePillLink>
            <SolidPillLink href="/seller/products/new" icon="plus">
              Add product
            </SolidPillLink>
          </>
        }
      />
      <FinishSetup />
      <StatCards
        stats={[
          { label: "Live products", value: 0, note: "Add a product to go live" },
          { label: "Quote requests", value: 0, note: "New requests from buyers" },
          { label: "Store views", value: 0, note: "Last 30 days" },
        ]}
      />
      <PanelRow>
        <EmptyPanel
          title="Quote requests"
          link={{ href: "/seller/rfq-inbox", label: "View all" }}
          icon="empty-message"
          emptyTitle="No quote requests yet"
          emptyText="When a buyer asks for a price, it shows up here."
        />
        <EmptyPanel
          title="Your products"
          link={{ href: "/seller/products", label: "Manage" }}
          icon="empty-box"
          emptyTitle="No products yet"
          emptyText="Add your first product to appear in search."
        />
      </PanelRow>
    </>
  );
}

const steps = [
  { title: "Account created", text: "Your seller account is ready.", done: true },
  {
    title: "Add your first product",
    text: "Buyers can find you once a product is live.",
    action: { href: "/seller/products/new", label: "Add product", tone: "accent" as const },
  },
  {
    title: "Complete company profile",
    text: "Logo, address and what you sell.",
    action: { href: "/seller/company-profile", label: "Edit profile", tone: "white" as const },
  },
];

function FinishSetup() {
  const done = steps.filter((step) => step.done).length;
  return (
    <section aria-label="Finish setting up your store" className="flex flex-col gap-4 rounded-[24px] bg-feature px-5 py-[22px] sm:px-7">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="flex items-center gap-2 text-sm leading-[normal] text-feature-text">
            <span aria-hidden className="size-[7px] rounded-full bg-success" />
            Getting started
          </p>
          <h2 className="text-[22px] leading-[normal] font-medium tracking-[-0.01em] text-white sm:text-[28px]">Finish setting up your store</h2>
        </div>
        <p className="text-[15px] leading-[normal] text-feature-muted">
          {done} of {steps.length} done
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Store setup"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded-full bg-white/12"
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="grid gap-3.5 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2 rounded-[20px] bg-feature-tile px-[22px] pt-4 pb-[18px]">
            <div className="flex items-center gap-2 text-sm leading-[normal] text-feature-text">
              <span aria-hidden className={cn("size-[7px] rounded-full", step.done ? "bg-success" : "bg-step-pending")} />
              <span className="flex-1">{String(index + 1).padStart(2, "0")}</span>
              {step.done ? (
                <span className="text-success">
                  <Icon name="check-circle-done" className="size-[18px]" />
                  <span className="sr-only">Done</span>
                </span>
              ) : null}
            </div>
            <p className={cn("text-xl leading-[normal] font-medium tracking-[-0.01em]", step.done ? "text-feature-muted" : "text-white")}>
              {step.title}
            </p>
            <p className="text-[15px] leading-[1.45] text-feature-copy">{step.text}</p>
            {step.action ? (
              <Link
                href={step.action.href}
                className={cn(
                  "mt-1 flex h-10 w-fit items-center rounded-full px-5 text-sm leading-[normal] font-semibold outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-white/40",
                  step.action.tone === "accent" ? "bg-side-accent text-white" : "bg-white text-sidebar-bg",
                )}
              >
                {step.action.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
