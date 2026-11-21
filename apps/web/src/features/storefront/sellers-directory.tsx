"use client";

import { ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { SellerCard } from "@/schemas";
import { Footer, SiteNav } from "@/components/landing/sections";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useSellerDirectory } from "./api";
import { Pagination } from "./parts";
import { Chip, LogoTile, SearchPill, softCard, softFocus, SoftHero, VerifiedMark } from "./soft";

/**
 * /sellers: the directory of verified sellers, in the Muhrak AI style
 * (developer request, 18 Nov 2026; replaces the Figma "Buyer – Manufacturers
 * v2" layout): the landing nav exactly, a serif heading with the AI page's
 * search pill on the soft glow, category chips, and seller cards that lead
 * with the company logo (not a product photo). Only verified sellers.
 * Search, category, sort and page live in the URL, so Back and shared links work.
 */
export function SellersDirectory() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q")?.slice(0, 60) ?? "";
  const category = params.get("category") ?? "";
  const sort = params.get("sort") === "newest" ? "newest" : "name";
  const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));

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

  return (
    <main className="flex flex-1 flex-col bg-white text-ink">
      <SoftHero>
        <SiteNav side="buyer" current="Sellers" />
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-4 pt-10 pb-16 text-center font-ai lg:pt-16 lg:pb-24">
          <p className="text-[13px] font-medium tracking-[0.08em] text-ink-tertiary">VERIFIED SELLERS · GCC</p>
          <h1 className="mt-4 font-ai-serif text-[44px] leading-[1.05] tracking-[-0.02em] text-[#8b8d96] sm:text-[64px]">Find a trusted seller</h1>
          <p className="mt-4 max-w-[520px] text-base leading-normal text-ink-tertiary sm:text-[17px]">
            Every seller here is checked by Muhrak before they can sell. Search by name, brand or part number.
          </p>
          <div className="mt-8 w-full max-w-[640px]">
            <SearchPill
              key={q}
              id="seller-search"
              label="Search sellers"
              placeholder="Seller, brand or part number…"
              initial={q}
              maxLength={60}
              onSearch={(text) => go({ q: text })}
            />
          </div>
        </div>
      </SoftHero>

      <section aria-label="Sellers" className="mx-auto flex w-full max-w-[1320px] flex-col px-4 pt-10 pb-24 font-ai sm:px-8 lg:pb-[120px]">
        <div className="flex items-center gap-3">
          <nav aria-label="Categories" className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-1">
            <Chip active={!category} count={data?.allCount} onClick={() => go({ category: "" })}>
              All
            </Chip>
            {(data?.categories ?? []).map((item) => (
              <Chip key={item.id} active={category === item.id} count={item.count} onClick={() => go({ category: item.id })}>
                {item.name}
              </Chip>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => go({ sort: sort === "name" ? "newest" : "name" })}
            aria-label={sort === "name" ? "Sorted A to Z. Show newest first" : "Newest first. Sort A to Z"}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-black/[0.055] px-4 text-[15px] leading-none text-ink-secondary hover:bg-black/[0.09]",
              softFocus,
            )}
          >
            <ArrowUpDown aria-hidden className="size-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">{sort === "name" ? "A to Z" : "Newest"}</span>
          </button>
        </div>
        {q ? (
          <p className="mt-5 text-[15px] text-ink-tertiary">
            Results for “<span className="text-ink">{q}</span>”.{" "}
            <button type="button" onClick={() => go({ q: "" })} className={cn("rounded-sm text-ink underline underline-offset-2", softFocus)}>
              Clear
            </button>
          </p>
        ) : null}

        <div className="mt-8">
          {directory.isPending ? (
            <Spinner label="Loading sellers" className="py-20" />
          ) : directory.isError ? (
            <p role="alert" className="py-20 text-center text-sm text-destructive">
              Could not load sellers. Please try again.
            </p>
          ) : data && data.items.length > 0 ? (
            <>
              <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.items.map((seller) => (
                  <li key={seller.id}>
                    <SellerCardView seller={seller} />
                  </li>
                ))}
              </ul>
              <div className="mt-14">
                <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="sellers" onPage={(next) => go({ page: next })} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <p className="font-ai-serif text-[28px] text-[#8b8d96]">{q ? "No seller matches that" : "No sellers here yet"}</p>
              <p className="text-[15px] text-ink-tertiary">{q ? `Nothing found for “${q}”. Try a brand or a part number.` : "Verified sellers will appear here."}</p>
              {q || category ? (
                <Chip onClick={() => router.push("/sellers")}>Show all sellers</Chip>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <Footer side="buyer" soft />
    </main>
  );
}

/** A seller: their logo on a pale tile, name with the verified mark, place, main category and product count. */
function SellerCardView({ seller }: { seller: SellerCard }) {
  const place = [seller.city, seller.countryName].filter(Boolean).join(", ");
  return (
    <Link href={`/sellers/${seller.id}`} className={cn("group flex h-full flex-col p-3 transition-shadow hover:shadow-[0_18px_44px_-22px_rgba(10,11,18,0.35),inset_0_0_0_1px_rgba(10,11,18,0.08)]", softCard, softFocus)}>
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-[20px] bg-linear-to-b from-[#f5f8fc] to-[#e9f1f9]">
        <LogoTile name={seller.companyName} logoUrl={seller.logoUrl} className="size-[42%] rounded-[22px] shadow-sm" initialsClass="text-[32px]" />
        {seller.isNew ? (
          <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium tracking-[0.06em] text-ink">NEW</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-2 pt-4 pb-2">
        <p className="flex items-center gap-1.5 text-base leading-tight font-medium text-ink">
          <span className="min-w-0 truncate group-hover:underline">{seller.companyName}</span>
          <VerifiedMark className="size-[18px]" />
        </p>
        <p className="truncate text-[13px] text-ink-tertiary">{place}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {seller.mainCategory ? <span className="rounded-full bg-black/[0.055] px-2.5 py-1 text-[12px] text-ink-secondary">{seller.mainCategory}</span> : null}
          <span className="rounded-full bg-black/[0.055] px-2.5 py-1 text-[12px] text-ink-secondary">
            {seller.productCount} {seller.productCount === 1 ? "product" : "products"}
          </span>
        </div>
      </div>
    </Link>
  );
}
