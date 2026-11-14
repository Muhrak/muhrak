"use client";

import { productListFilterSchema, type ProductListFilter, type ProductStatusAction, type ProductSummary } from "@/schemas";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { focusRing } from "@/features/seller/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProductList, useProductStatus } from "./api";
import { priceLabel, ProductStatusChip, stockLabel } from "./parts";

/**
 * Figma "Seller – Products" (396:2525), dark only, converted to the light
 * Seller Centre palette. Left out on purpose: "Import CSV" (not in the MVP),
 * the theme toggle (the site is light only) and the "Views" column (views
 * are not counted yet).
 */

const TABS: { filter: ProductListFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "published", label: "Live" },
  { filter: "draft", label: "Draft" },
  { filter: "out_of_stock", label: "Out of stock" },
  { filter: "archived", label: "Archived" },
];

const FLASH: Record<string, string> = {
  draft: "Saved as a draft. Publish it when it is ready.",
  published: "Your product is live.",
};

export function ProductsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const filterParam = productListFilterSchema.safeParse(params.get("filter"));
  const filter: ProductListFilter = filterParam.success ? filterParam.data : "all";
  const flash = FLASH[params.get("saved") ?? ""];

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const list = useProductList(filter, query);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const status = useProductStatus();

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2 leading-[normal]">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">Products</h1>
          <p className="text-base text-text-muted">Everything listed in your Muhrak store.</p>
        </div>
        <Link
          href="/seller/products/new"
          className={cn(
            "flex h-[52px] w-fit items-center justify-center gap-2 rounded-full bg-side-accent px-7 text-base font-semibold whitespace-nowrap text-white hover:opacity-90",
            focusRing,
          )}
        >
          <Plus aria-hidden className="size-[18px]" strokeWidth={2.2} />
          Add product
        </Link>
      </div>

      {flash ? (
        <p role="status" className="rounded-[16px] bg-success/16 px-5 py-3.5 text-sm font-medium text-text-strong">
          {flash}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <nav aria-label="Filter products" className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1 lg:pb-0">
          {TABS.map((tab) => {
            const active = tab.filter === filter;
            return (
              <button
                key={tab.filter}
                type="button"
                aria-pressed={active}
                onClick={() => router.replace(tab.filter === "all" ? "/seller/products" : `/seller/products?filter=${tab.filter}`)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm leading-[normal] font-medium whitespace-nowrap",
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
        <label className="relative flex h-9 w-full items-center lg:w-[260px]">
          <span className="sr-only">Search by name or part number</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 size-4 text-text-subtle" />
          <input
            type="search"
            value={search}
            maxLength={60}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or part number"
            className={cn("h-9 w-full rounded-full border border-line bg-panel pr-4 pl-9 text-[13px] text-text-strong placeholder:text-text-subtle", focusRing)}
          />
        </label>
      </div>

      <section aria-label="Your products" className="flex flex-col gap-4 rounded-[24px] bg-panel px-4 py-[22px] sm:px-6">
        <div className="flex flex-col gap-1 leading-[normal]">
          <p className="text-lg font-medium text-text-strong">
            {counts ? `${counts[filter]} ${counts[filter] === 1 ? "product" : "products"}` : "Products"}
          </p>
          <p className="text-[13px] text-text-subtle">Most recently changed first</p>
        </div>

        {status.error ? (
          <p role="alert" className="text-sm text-destructive">
            {status.error instanceof ApiError ? status.error.message : "Something went wrong. Please try again."}
          </p>
        ) : null}

        {list.isPending ? (
          <p role="status" className="py-10 text-center text-sm text-text-muted">
            Loading your products…
          </p>
        ) : list.isError ? (
          <p role="alert" className="py-10 text-center text-sm text-destructive">
            Could not load your products. Reload the page to try again.
          </p>
        ) : items.length === 0 ? (
          <EmptyState filter={filter} searching={Boolean(query)} />
        ) : (
          <ProductTable
            items={items}
            busy={status.isPending}
            onAction={(id, action) => {
              status.reset();
              status.mutate({ id, action });
            }}
          />
        )}

        {list.hasNextPage ? (
          <button
            type="button"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            className={cn("mx-auto h-10 rounded-full border border-line px-5 text-sm font-semibold text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
          >
            {list.isFetchingNextPage ? "Loading…" : "Show more"}
          </button>
        ) : null}
      </section>
    </>
  );
}

function EmptyState({ filter, searching }: { filter: ProductListFilter; searching: boolean }) {
  const text = searching
    ? "No product matches this search."
    : filter === "all"
      ? "You have not added any products yet."
      : "No products here yet.";
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-[15px] text-text-muted">{text}</p>
      {filter === "all" && !searching ? (
        <Link href="/seller/products/new" className={cn("rounded-full bg-side-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90", focusRing)}>
          Add your first product
        </Link>
      ) : null}
    </div>
  );
}

const head = "text-[11px] leading-[normal] font-medium tracking-[0.06em] text-text-subtle uppercase";

function ProductTable({
  items,
  busy,
  onAction,
}: {
  items: ProductSummary[];
  busy: boolean;
  onAction: (id: string, action: ProductStatusAction) => void;
}) {
  return (
    <div className="flex flex-col">
      <div aria-hidden className="hidden items-center gap-4 border-b border-line pb-2.5 md:flex">
        <p className={cn(head, "flex-1")}>Product</p>
        <p className={cn(head, "w-[150px]")}>Category</p>
        <p className={cn(head, "w-[130px] text-right")}>Price</p>
        <p className={cn(head, "w-[80px] text-right")}>Stock</p>
        <p className={cn(head, "w-[110px]")}>Status</p>
        <span className="w-8" />
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0 md:h-[66px] md:gap-4 md:py-0">
            <Link href={`/seller/products/${item.id}`} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-[10px]", focusRing)}>
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#ededf0]">
                {item.coverThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- public photo thumbnail, fixed size
                  <img src={item.coverThumbUrl} alt="" className="size-full object-contain" />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-col gap-[3px] leading-[normal]">
                <span className="truncate text-sm font-medium text-text-strong">{item.name}</span>
                <span className="truncate text-xs text-text-subtle">{item.partNumber ? `Part no. ${item.partNumber}` : "No part number"}</span>
                <span className="text-xs font-medium text-text-strong md:hidden">{priceLabel(item.price)}</span>
              </span>
            </Link>
            <p className="hidden w-[150px] truncate text-sm text-text-muted md:block">{item.categoryName}</p>
            <p className="hidden w-[130px] text-right text-sm whitespace-nowrap text-text-strong md:block">{priceLabel(item.price)}</p>
            <p className="hidden w-[80px] text-right text-sm text-text-strong md:block">{stockLabel(item.stockQuantity, item.unit)}</p>
            <div className="w-auto md:w-[110px]">
              <ProductStatusChip status={item.status} stock={item.stockQuantity} />
            </div>
            <RowMenu item={item} busy={busy} onAction={onAction} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The "…" menu of a row: edit, and the allowed status changes. */
function RowMenu({ item, busy, onAction }: { item: ProductSummary; busy: boolean; onAction: (id: string, action: ProductStatusAction) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const actions: { action: ProductStatusAction; label: string }[] =
    item.status === "published"
      ? [
          { action: "unpublish", label: "Unpublish" },
          { action: "archive", label: "Archive" },
        ]
      : item.status === "draft"
        ? [
            { action: "publish", label: "Publish" },
            { action: "archive", label: "Archive" },
          ]
        : [{ action: "restore", label: "Restore as draft" }];

  return (
    <div ref={ref} className="relative w-8 shrink-0">
      <button
        type="button"
        aria-label={`Actions for ${item.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn("flex size-8 items-center justify-center rounded-full text-text-muted hover:bg-black/4 hover:text-text-strong", focusRing)}
      >
        <MoreHorizontal aria-hidden className="size-[18px]" />
      </button>
      {open ? (
        <div role="menu" className="absolute top-9 right-0 z-10 flex w-44 flex-col rounded-[14px] border border-line bg-panel p-1.5 shadow-lg">
          <Link role="menuitem" href={`/seller/products/${item.id}`} className={cn("rounded-[10px] px-3 py-2 text-sm text-text-strong hover:bg-surface", focusRing)}>
            Edit
          </Link>
          {actions.map(({ action, label }) => (
            <button
              key={action}
              role="menuitem"
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onAction(item.id, action);
              }}
              className={cn("rounded-[10px] px-3 py-2 text-left text-sm text-text-strong hover:bg-surface disabled:opacity-50", focusRing)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
