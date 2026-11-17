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

  // Rectangular search like a shop header; one copy in the nav (lg+), one in the page below lg.
  const searchBox = (id: string) => (
    <form
      role="search"
      onSubmit={onSearch}
      className="flex h-11 w-full items-center rounded-[10px] border border-black/14 bg-white/70 pl-4 backdrop-blur-[15px] focus-within:ring-3 focus-within:ring-ring/40 lg:w-[300px]"
    >
      <label htmlFor={id} className="sr-only">
        Search sellers
      </label>
      <input
        id={id}
        type="search"
        value={draft}
        maxLength={60}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Search sellers, brands, part no."
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-placeholder"
      />
      <button type="submit" aria-label="Search" className={cn("flex h-full w-11 shrink-0 items-center justify-center rounded-r-[10px] text-ink hover:bg-black/4", focus)}>
        <Search aria-hidden className="size-[18px]" />
      </button>
    </form>
  );

  const tabs = [
    { key: "", label: "All", count: data?.allCount ?? 0 },
    ...(data?.categories ?? []).map((item) => ({ key: item.id, label: item.name, count: item.count })),
  ];

  return (
    <main className="flex flex-1 flex-col bg-canvas text-ink">
      {/* Shop-listing header (developer request, 17 Nov 2026): search in the
          nav on desktop (under the title on smaller screens), the title with
          the count lined up with the logo, in the short aurora band. */}
      <AuroraBand>
        <SiteNav side="buyer" current="Sellers" search={searchBox("seller-search")} />
        {/* Fade the shortened aurora into the page so it has no hard edge. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent to-canvas" />
        <div className="relative flex flex-col gap-5 px-4 pt-8 pb-6 sm:px-12 lg:pt-12 lg:pb-8">
          <h1 className="flex items-baseline gap-2.5 text-[34px] leading-[normal] font-medium tracking-[-0.03em] text-ink sm:text-[44px]">
            Sellers
            {data ? <span className="text-[15px] font-normal tracking-normal text-ink-tertiary">({data.allCount})</span> : null}
          </h1>
          <div className="lg:hidden">{searchBox("seller-search-mobile")}</div>
        </div>
      </AuroraBand>

      <section aria-label="Sellers" className="flex flex-col px-4 pt-2 pb-[110px] sm:px-12">
        <CategoryTabs
          tabs={tabs}
          active={category}
          onSelect={(key) => go({ category: key })}
          sort={{
            label: sort === "name" ? "Sorted A to Z. Show newest first" : "Newest first. Sort A to Z",
            onToggle: () => go({ sort: sort === "name" ? "newest" : "name", page: 1 }),
          }}
        />
        <div className="h-8" />

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
            <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 min-[1600px]:grid-cols-6">
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
