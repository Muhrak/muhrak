"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SellerCard } from "@/schemas";
import { Footer, SiteNav } from "@/components/landing/sections";
import { cn } from "@/lib/utils";
import { useSellerDirectory } from "./api";
import { AuroraBand, CardImage, CategoryTabs, focus, initials, Pagination } from "./parts";

/**
 * /sellers: Figma "Buyer – Manufacturers v2" (244:6812), renamed Sellers,
 * converted to light. Only verified sellers. Search, tab, sort and page
 * live in the URL, so Back and shared links work.
 */
export function SellersDirectory() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q")?.slice(0, 60) ?? "";
  const category = params.get("category") ?? "";
  const sort = params.get("sort") === "newest" ? "newest" : "name";
  const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
  const [draft, setDraft] = useState(q);

  const directory = useSellerDirectory({ q: q || undefined, category: category || undefined, sort, page });
  const data = directory.data;

  function go(next: { q?: string; category?: string; sort?: string; page?: number }) {
    const merged = { q, category, sort, page: 1, ...next };
    const search = new URLSearchParams();
    if (merged.q) search.set("q", merged.q);
    if (merged.category) search.set("category", merged.category);
    if (merged.sort !== "name") search.set("sort", merged.sort);
    if (merged.page > 1) search.set("page", String(merged.page));
    router.push(search.size ? `/sellers?${search}` : "/sellers", { scroll: false });
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    go({ q: draft.trim() });
  }

  const tabs = [
    { key: "", label: "All", count: data?.allCount ?? 0 },
    ...(data?.categories ?? []).map((item) => ({ key: item.id, label: item.name, count: item.count })),
  ];

  return (
    <main className="flex flex-1 flex-col bg-canvas text-ink">
      {/* Figma Hero: 470 px, copy from 170 px. */}
      <AuroraBand className="lg:h-[470px]">
        <SiteNav side="buyer" current="Sellers" />
        <div className="relative flex flex-col items-center px-4 pt-10 pb-14 text-center lg:pt-[86px] lg:pb-0">
          <p className="text-[13px] leading-[normal] tracking-[0.06em] text-[rgba(74,77,89,0.9)]">VERIFIED SELLERS</p>
          <h1 className="mt-5 bg-linear-to-b from-ink via-[#292b36] via-55% to-[#737585] bg-clip-text pb-2 text-[64px] leading-[0.9] font-medium tracking-[-0.05em] text-transparent sm:text-[96px] lg:mt-7 lg:text-[120px]">
            Sellers
          </h1>
          <form
            role="search"
            onSubmit={onSearch}
            className="mt-8 flex w-full max-w-[560px] items-center gap-3 rounded-full border border-black/22 bg-white/60 py-1.5 pr-1.5 pl-[22px] backdrop-blur-[15px] focus-within:ring-3 focus-within:ring-ring/40 lg:mt-10"
          >
            <Search aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
            <label htmlFor="seller-search" className="sr-only">
              Search sellers
            </label>
            <input
              id="seller-search"
              type="search"
              value={draft}
              maxLength={60}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Company name, brand, model or part number"
              className="h-[42px] min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-placeholder"
            />
            <button type="submit" className={cn("rounded-full bg-ink px-[22px] py-[11px] text-sm leading-[normal] font-medium text-white hover:opacity-90", focus)}>
              Search
            </button>
          </form>
        </div>
      </AuroraBand>

      <section aria-label="Sellers" className="flex flex-col px-4 pt-12 pb-[110px] sm:px-10 xl:px-[60px]">
        <CategoryTabs
          tabs={tabs}
          active={category}
          onSelect={(key) => go({ category: key })}
          sort={{
            label: sort === "name" ? "Sorted A to Z. Show newest first" : "Newest first. Sort A to Z",
            onToggle: () => go({ sort: sort === "name" ? "newest" : "name", page: 1 }),
          }}
        />
        <div className="h-10" />

        {directory.isPending ? (
          <p role="status" className="py-20 text-center text-sm text-ink-tertiary">
            Loading sellers…
          </p>
        ) : directory.isError ? (
          <p role="alert" className="py-20 text-center text-sm text-destructive">
            Could not load sellers. Please try again.
          </p>
        ) : data && data.items.length > 0 ? (
          <>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((seller) => (
                <li key={seller.id}>
                  <SellerCardView seller={seller} />
                </li>
              ))}
            </ul>
            <div className="mt-[60px]">
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="sellers" onPage={(next) => go({ page: next })} />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-[15px] text-ink-tertiary">{q ? `No seller matches “${q}”.` : "No sellers here yet."}</p>
            {q || category ? (
              <button type="button" onClick={() => router.push("/sellers")} className={cn("text-sm font-medium text-ink underline", focus)}>
                Show all sellers
              </button>
            ) : null}
          </div>
        )}
      </section>

      <Footer side="buyer" />
    </main>
  );
}

/** Figma "Manufacturer Grid Card": label line, square image with the logo badge, name + products, category · country. */
function SellerCardView({ seller }: { seller: SellerCard }) {
  return (
    <Link href={`/sellers/${seller.id}`} className={cn("group flex flex-col rounded-[14px]", focus)}>
      <p className="h-[14px] text-[11px] leading-[normal] tracking-[0.06em] text-ink-secondary">{seller.isNew ? "NEW" : ""}</p>
      <div className="h-2.5" />
      <CardImage src={seller.coverPhotoUrl}>
        <span className="absolute bottom-[15px] left-[13px] flex h-[30px] max-w-[60%] min-w-[92px] items-center justify-center overflow-hidden rounded-[8px] border border-black/8 bg-white px-2">
          {seller.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public logo from storage
            <img src={seller.logoUrl} alt="" className="max-h-[22px] max-w-full object-contain" />
          ) : (
            <span className="text-[11px] font-semibold tracking-[0.08em] text-ink">{initials(seller.companyName)}</span>
          )}
        </span>
      </CardImage>
      <div className="h-3.5" />
      <div className="flex items-start gap-2 text-[13px] leading-[normal] text-ink">
        <p className="min-w-0 flex-1 font-medium tracking-[0.04em] uppercase group-hover:underline">{seller.companyName}</p>
        <p className="shrink-0 whitespace-nowrap">
          {seller.productCount} {seller.productCount === 1 ? "product" : "products"}
        </p>
      </div>
      <p className="mt-1 text-xs leading-[normal] text-ink-tertiary">
        {[seller.mainCategory, seller.city ? `${seller.city}, ${seller.countryName}` : seller.countryName].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}
