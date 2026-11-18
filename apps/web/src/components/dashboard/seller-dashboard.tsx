"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/layout/icon";
import { useCurrentUser } from "@/features/auth/hooks";
import { useProductsPreview } from "@/features/catalog/api";
import { priceLabel, ProductStatusChip } from "@/features/catalog/parts";
import { useSellerRfqsPreview } from "@/features/rfq/api";
import { quantityLabel, RfqChip, sellerStatus, Thumb } from "@/features/rfq/parts";
import { useSellerAccount } from "@/features/seller/api";
import { cn } from "@/lib/utils";
import { EmptyPanel, OutlinePillLink, PanelRow, SolidPillLink, StatCards } from "./parts";

/**
 * Figma "Seller – Dashboard (Light)". Real data (developer report, 18 Nov
 * 2026): the setup checklist ticks off from the seller's own products and
 * profile and disappears once every step is done; the numbers and the two
 * panels show the seller's live products and quote requests.
 */
export function SellerDashboard() {
  const user = useCurrentUser("seller");
  const account = useSellerAccount();
  const products = useProductsPreview();
  const rfqs = useSellerRfqsPreview();
  if (!user) return null;

  const productCounts = products.data?.counts;
  const totalProducts = productCounts ? productCounts.all + productCounts.archived : 0;
  const live = productCounts?.published ?? 0;
  const openRfqs = rfqs.data?.counts.open ?? 0;
  const ready = account.isSuccess && products.isSuccess;
  const steps = ready ? setupSteps({ hasProduct: totalProducts > 0, hasProfile: Boolean(account.data?.profile) }) : null;

  return (
    <>
      {/* The seller's details in a black card, like the Buyer Centre welcome card (developer request, 18 Nov 2026). */}
      <section
        aria-label="Your account"
        className="flex flex-col gap-6 rounded-[24px] bg-feature px-5 py-6 sm:px-7 xl:flex-row xl:items-center xl:gap-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 leading-[normal]">
          <h1 className="text-[24px] font-medium tracking-[-0.02em] break-words text-white sm:text-[32px]">Welcome, {user.fullName}</h1>
          <p className="truncate text-base text-feature-muted">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <OutlinePillLink href="/seller/store" onDark>
            View my store
          </OutlinePillLink>
          <SolidPillLink href="/seller/products/new" icon="plus">
            Add product
          </SolidPillLink>
        </div>
      </section>
      {/* Shown only while something is left to do; gone once all steps are done. */}
      {steps && steps.some((step) => !step.done) ? <FinishSetup steps={steps} /> : null}
      <StatCards
        stats={[
          {
            label: "Live products",
            value: live,
            note: live > 0 ? "Buyers can find these" : totalProducts > 0 ? "Publish a product to go live" : "Add a product to go live",
          },
          { label: "Quote requests", value: openRfqs, note: openRfqs > 0 ? "Waiting for your reply" : "New requests from buyers" },
          { label: "Store views", value: 0, note: "Last 30 days" },
        ]}
      />
      <PanelRow>
        {rfqs.data && rfqs.data.items.length > 0 ? (
          <ListPanel title="Quote requests" link={{ href: "/seller/rfq-inbox", label: "View all" }}>
            {rfqs.data.items.map((rfq) => {
              const status = sellerStatus(rfq.status);
              return (
                <ListRow
                  key={rfq.id}
                  href={`/seller/rfq-inbox?id=${encodeURIComponent(rfq.id)}`}
                  photo={rfq.product.photoUrl}
                  title={rfq.partName}
                  meta={`${rfq.reference} · ${quantityLabel(rfq.quantity, rfq.unit)} · ${rfq.deliveryCity}`}
                  side={<RfqChip tone={status.tone}>{status.label}</RfqChip>}
                />
              );
            })}
          </ListPanel>
        ) : (
          <EmptyPanel
            title="Quote requests"
            link={{ href: "/seller/rfq-inbox", label: "View all" }}
            icon="empty-message"
            emptyTitle="No quote requests yet"
            emptyText="When a buyer asks for a price, it shows up here."
          />
        )}
        {products.data && products.data.items.length > 0 ? (
          <ListPanel title="Your products" link={{ href: "/seller/products", label: "Manage" }}>
            {products.data.items.map((product) => (
              <ListRow
                key={product.id}
                href={`/seller/products/${encodeURIComponent(product.id)}`}
                photo={product.coverThumbUrl}
                title={product.name}
                meta={[product.partNumber, priceLabel(product.price)].filter(Boolean).join(" · ")}
                side={<ProductStatusChip status={product.status} stock={product.stockQuantity} />}
              />
            ))}
          </ListPanel>
        ) : (
          <EmptyPanel
            title="Your products"
            link={{ href: "/seller/products", label: "Manage" }}
            icon="empty-box"
            emptyTitle="No products yet"
            emptyText="Add your first product to appear in search."
          />
        )}
      </PanelRow>
    </>
  );
}

/** A dashboard panel with rows (the filled version of EmptyPanel). */
function ListPanel({ title, link, children }: { title: string; link: { href: string; label: string }; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-h-[260px] flex-1 flex-col rounded-[24px] bg-panel px-6 py-[22px]">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl leading-[normal] font-medium tracking-[-0.01em] text-text-strong">{title}</h2>
        <Link
          href={link.href}
          className="flex items-center gap-1.5 rounded-sm text-[15px] leading-[normal] font-medium text-text-strong outline-none hover:underline focus-visible:ring-3 focus-visible:ring-brand-blue/40"
        >
          {link.label}
          <Icon name="arrow-right" className="size-[15px]" />
        </Link>
      </div>
      <ul className="mt-3 flex flex-col">{children}</ul>
    </section>
  );
}

function ListRow({ href, photo, title, meta, side }: { href: string; photo: string | null; title: string; meta: string; side: ReactNode }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} className="flex items-center gap-3.5 rounded-[12px] py-3 outline-none hover:bg-surface/60 focus-visible:ring-3 focus-visible:ring-brand-blue/40">
        <Thumb src={photo} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
          <span className="truncate text-[15px] font-medium text-text-strong">{title}</span>
          <span className="truncate text-[13px] text-text-muted">{meta}</span>
        </span>
        {side}
      </Link>
    </li>
  );
}

interface Step {
  title: string;
  text: string;
  done?: boolean;
  action?: { href: string; label: string; tone: "accent" | "white" };
}

function setupSteps({ hasProduct, hasProfile }: { hasProduct: boolean; hasProfile: boolean }): Step[] {
  return [
    { title: "Account created", text: "Your seller account is ready.", done: true },
    hasProduct
      ? { title: "Add your first product", text: "Your first product is in your catalogue.", done: true }
      : {
          title: "Add your first product",
          text: "Buyers can find you once a product is live.",
          action: { href: "/seller/products/new", label: "Add product", tone: "accent" },
        },
    hasProfile
      ? { title: "Complete company profile", text: "Logo, address and what you sell.", done: true }
      : {
          title: "Complete company profile",
          text: "Logo, address and what you sell.",
          action: { href: "/seller/company-profile", label: "Edit profile", tone: "white" },
        },
  ];
}

function FinishSetup({ steps }: { steps: Step[] }) {
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
