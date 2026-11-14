"use client";

import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CONDITION_LABELS, formatMoney, UNIT_LABELS, type PublicProductCard, type PublicSeller } from "@/schemas";
import { Footer, SiteNav } from "@/components/landing/sections";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePublicSeller, useSellerProducts } from "./api";
import { AuroraBand, CardImage, CategoryTabs, focus, initials, Pagination } from "./parts";

/**
 * /sellers/[id]: Figma "Buyer – Manufacturer Profile v2" (245:6812),
 * converted to light. Developer decisions (14 Nov 2026): only the Overview
 * and Products tabs (no Data Room / Distributors / Models yet), no
 * "Established" or "Replies within" lines (no real data), no "Send inquiry"
 * / "How to order" until quote requests exist. Verified sellers only.
 */

const dateFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export function SellerProfile({ id }: { id: string }) {
  const seller = usePublicSeller(id);

  if (seller.isPending) {
    return (
      <Shell>
        <p role="status" className="py-32 text-center text-sm text-ink-tertiary">
          Loading…
        </p>
      </Shell>
    );
  }
  if (seller.isError) {
    const missing = seller.error instanceof ApiError && seller.error.status === 404;
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-32 text-center">
          <p className="text-[15px] text-ink-tertiary">{missing ? "This seller is not on Muhrak, or is not verified yet." : "Could not load this seller. Please try again."}</p>
          <Link href="/sellers" className={cn("text-sm font-medium text-ink underline", focus)}>
            See all sellers
          </Link>
        </div>
      </Shell>
    );
  }
  return <Profile seller={seller.data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col bg-canvas text-ink">
      <AuroraBand>
        <SiteNav side="buyer" current="Sellers" />
      </AuroraBand>
      {children}
      <Footer side="buyer" />
    </main>
  );
}

function Profile({ seller }: { seller: PublicSeller }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "overview" ? "overview" : "products";
  const category = params.get("category") ?? "";
  const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));

  function go(next: { tab?: string; category?: string; page?: number }) {
    const merged = { tab, category, page: 1, ...next };
    const search = new URLSearchParams();
    if (merged.tab !== "products") search.set("tab", merged.tab);
    if (merged.category) search.set("category", merged.category);
    if (merged.page > 1) search.set("page", String(merged.page));
    router.push(search.size ? `/sellers/${seller.id}?${search}` : `/sellers/${seller.id}`, { scroll: false });
  }

  const location = [seller.city, seller.countryName].filter(Boolean).join(", ");
  const facts = [location, seller.verifiedSince ? `Verified since ${dateFormat.format(new Date(seller.verifiedSince))}` : null].filter(Boolean);

  return (
    <main className="flex flex-1 flex-col bg-canvas text-ink">
      {/* Figma "Top": 600 px, identity block from 400 px. */}
      <AuroraBand className="lg:h-[600px]">
        <SiteNav side="buyer" current="Sellers" />
        <div className="relative flex flex-col gap-6 px-4 pt-16 pb-10 sm:flex-row sm:items-center sm:gap-7 sm:px-10 lg:absolute lg:top-[400px] lg:left-0 lg:p-0 lg:pl-[60px] xl:pl-[60px]">
          <div className="flex h-[112px] w-[200px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-black/9 bg-linear-to-b from-white to-white/80 p-4">
            {seller.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public logo from storage
              <img src={seller.logoUrl} alt={`${seller.companyName} logo`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-2xl font-bold tracking-[0.12em] text-ink">{initials(seller.companyName)}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2.5 leading-[normal]">
            <h1 className="flex flex-wrap items-center gap-2.5 text-[26px] tracking-[-0.02em] text-ink sm:text-[30px]">
              {seller.companyName}
              <BadgeCheck aria-label="Verified seller" className="size-5 shrink-0 fill-ink text-white" />
            </h1>
            {seller.about ? <p className="line-clamp-2 max-w-[760px] text-[15px] text-ink-tertiary">{seller.about}</p> : null}
            <p className="text-[13px] text-ink-secondary">{facts.join("  ·  ")}</p>
          </div>
        </div>
      </AuroraBand>

      {/* Figma "Tabs": 16 px labels, 2 px underline on the active one. */}
      <nav aria-label="Seller sections" className="flex items-end gap-9 overflow-x-auto border-b border-black/8 bg-canvas px-4 sm:px-10 xl:px-[60px]">
        {(["overview", "products"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => go({ tab: key })}
            className={cn(
              "border-b-2 py-[18px] text-base leading-[normal] whitespace-nowrap",
              tab === key ? "border-ink font-medium text-ink" : "border-transparent text-ink-tertiary hover:text-ink",
              focus,
            )}
          >
            {key === "overview" ? "Overview" : "Products"}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <Overview seller={seller} onCategory={(id) => go({ tab: "products", category: id })} />
      ) : (
        <Products seller={seller} category={category} page={page} onCategory={(id) => go({ category: id })} onPage={(next) => go({ page: next })} />
      )}

      <Footer side="buyer" />
    </main>
  );
}

function Products({
  seller,
  category,
  page,
  onCategory,
  onPage,
}: {
  seller: PublicSeller;
  category: string;
  page: number;
  onCategory: (id: string) => void;
  onPage: (page: number) => void;
}) {
  const products = useSellerProducts(seller.id, { category: category || undefined, page });
  const tabs = [{ key: "", label: "All", count: seller.productCount }, ...seller.categories.map((item) => ({ key: item.id, label: item.name, count: item.count }))];
  const data = products.data;

  return (
    <section aria-label="Products" className="flex flex-col px-4 pt-12 pb-[110px] sm:px-10 xl:px-[60px]">
      <CategoryTabs tabs={tabs} active={category} onSelect={onCategory} />
      <div className="h-10" />
      {products.isPending ? (
        <p role="status" className="py-20 text-center text-sm text-ink-tertiary">
          Loading products…
        </p>
      ) : products.isError ? (
        <p role="alert" className="py-20 text-center text-sm text-destructive">
          Could not load products. Please try again.
        </p>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((product) => (
              <li key={product.id}>
                <ProductCardView product={product} />
              </li>
            ))}
          </ul>
          <div className="mt-[60px]">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="products" onPage={onPage} />
          </div>
        </>
      ) : (
        <p className="py-20 text-center text-[15px] text-ink-tertiary">This seller has no live products here yet.</p>
      )}
    </section>
  );
}

/** Figma product card: label line, square photo, name + price, subtitle. (Product pages come with buyer search, Day 8.) */
function ProductCardView({ product }: { product: PublicProductCard }) {
  const unit = product.unit === "piece" ? "" : ` / ${UNIT_LABELS[product.unit].one}`;
  return (
    <article className="flex flex-col">
      <p className="h-[14px] text-[11px] leading-[normal] tracking-[0.06em] text-ink-secondary">{product.isNew ? "NEW" : ""}</p>
      <div className="h-2.5" />
      <CardImage src={product.photoUrl} />
      <div className="h-3.5" />
      <div className="flex items-start gap-2 text-[13px] leading-[normal] text-ink">
        <h3 className="min-w-0 flex-1 font-medium tracking-[0.04em]">{product.name}</h3>
        <p className="shrink-0 whitespace-nowrap">{product.price ? `${formatMoney(product.price)}${unit}` : "Price on request"}</p>
      </div>
      <p className="mt-1 text-xs leading-[normal] text-ink-tertiary">
        {[product.partNumber ? `Part no. ${product.partNumber}` : null, product.categoryName, CONDITION_LABELS[product.condition]].filter(Boolean).join(" · ")}
      </p>
    </article>
  );
}

function Overview({ seller, onCategory }: { seller: PublicSeller; onCategory: (id: string) => void }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Location", value: [seller.city, seller.countryName].filter(Boolean).join(", ") },
    { label: "Verified by Muhrak", value: seller.verifiedSince ? `Since ${dateFormat.format(new Date(seller.verifiedSince))}` : "Yes" },
    { label: "On Muhrak since", value: dateFormat.format(new Date(seller.memberSince)) },
    { label: "Live products", value: seller.productCount.toLocaleString("en-US") },
  ];
  return (
    <section aria-label="Overview" className="grid gap-10 px-4 pt-12 pb-[110px] sm:px-10 lg:grid-cols-[1fr_380px] xl:px-[60px]">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl leading-[normal] font-medium text-ink">About {seller.companyName}</h2>
          <p className="max-w-[760px] text-[15px] leading-relaxed whitespace-pre-line text-ink-secondary">{seller.about || "This seller has not written an introduction yet."}</p>
        </div>
        {seller.brands.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm leading-[normal] font-medium text-ink">Brands they carry</h2>
            <ul className="flex flex-wrap gap-2">
              {seller.brands.map((brand) => (
                <li key={brand} className="rounded-full border border-black/10 bg-white/70 px-3.5 py-[7px] text-[13px] leading-[normal] text-ink">
                  {brand}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {seller.categories.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm leading-[normal] font-medium text-ink">What they sell</h2>
            <ul className="flex flex-wrap gap-2">
              {seller.categories.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => onCategory(category.id)}
                    className={cn("rounded-full border border-black/10 bg-white/70 px-3.5 py-[7px] text-[13px] leading-[normal] text-ink hover:bg-white", focus)}
                  >
                    {category.name} <span className="text-ink-tertiary">{category.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <dl className="flex h-fit flex-col divide-y divide-black/8 rounded-[18px] border border-black/8 bg-white px-6">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-4 text-sm leading-[normal]">
            <dt className="text-ink-tertiary">{row.label}</dt>
            <dd className="text-right text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
