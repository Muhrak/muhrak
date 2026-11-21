"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { CONDITION_LABELS, formatMoney, UNIT_LABELS, type PublicProductCard, type PublicSeller } from "@/schemas";
import { Footer, SiteNav } from "@/components/landing/sections";
import { PageLoader } from "@/components/ui/logo-loader";
import { Spinner } from "@/components/ui/spinner";
import { LOGIN_PATH } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { availability, QuoteRequestDialog, type QuoteTarget } from "@/features/rfq/quote-request-dialog";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePublicSeller, useSellerProducts } from "./api";
import { Pagination } from "./parts";
import { Chip, LogoTile, softCard, softFocus, SoftHero, VerifiedMark } from "./soft";

/**
 * /sellers/[id]: a verified seller's page in the Muhrak AI style (developer
 * request, 18 Nov 2026): the landing nav, an identity card on the soft glow
 * (logo, serif name, verified mark, place, about, key facts), then Products
 * and About as chips. Product cards show the product's own photo and a
 * "Request quote" button (the same request form as search; buyer sign-in
 * needed). Only the facts Muhrak really has (no "Established" or "Replies within").
 */

const dateFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export function SellerProfile({ id }: { id: string }) {
  const seller = usePublicSeller(id);

  if (seller.isPending) {
    return (
      <Shell>
        <PageLoader className="min-h-[60dvh]" />
      </Shell>
    );
  }
  if (seller.isError) {
    const missing = seller.error instanceof ApiError && seller.error.status === 404;
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 px-4 py-32 text-center font-ai">
          <p className="font-ai-serif text-[28px] text-[#8b8d96]">{missing ? "Seller not found" : "Something went wrong"}</p>
          <p className="text-[15px] text-ink-tertiary">{missing ? "This seller is not on Muhrak, or is not verified yet." : "Could not load this seller. Please try again."}</p>
          <Link href="/sellers" className={cn("rounded-full bg-black/[0.055] px-4 py-2.5 text-[15px] text-ink-secondary hover:bg-black/[0.09]", softFocus)}>
            See all sellers
          </Link>
        </div>
      </Shell>
    );
  }
  return <Profile seller={seller.data} />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col bg-white text-ink">
      <SoftHero>
        <SiteNav side="buyer" current="Sellers" />
        <div className="h-24" />
      </SoftHero>
      {children}
      <Footer side="buyer" soft />
    </main>
  );
}

function Profile({ seller }: { seller: PublicSeller }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "overview" ? "overview" : "products";
  const category = params.get("category") ?? "";
  const page = Math.max(1, Math.min(1000, Number(params.get("page")) || 1));
  const quoteFor = params.get("quote");
  const buyer = useSession("buyer");

  function href(next: { tab?: string; category?: string; page?: number; quote?: string | null }) {
    const merged = { tab, category, page: 1, quote: null as string | null, ...next };
    const search = new URLSearchParams();
    if (merged.tab !== "products") search.set("tab", merged.tab);
    if (merged.category) search.set("category", merged.category);
    if (merged.page > 1) search.set("page", String(merged.page));
    if (merged.quote) search.set("quote", merged.quote);
    return search.size ? `/sellers/${seller.id}?${search}` : `/sellers/${seller.id}`;
  }

  function go(next: { tab?: string; category?: string; page?: number }) {
    router.push(href(next), { scroll: false });
  }

  // "Request quote" needs a BUYER sign-in (a seller signed in counts as a visitor here): visitors go to
  // the buyer login and come back with the form open (?quote= in the URL), like on /search.
  function requestQuote(productId: string) {
    const withForm = href({ category, page, quote: productId });
    if (buyer?.user.role === "buyer") router.replace(withForm, { scroll: false });
    else router.push(`${LOGIN_PATH.buyer}?next=${encodeURIComponent(withForm)}`);
  }

  const place = [seller.city, seller.countryName].filter(Boolean).join(", ");
  const facts: { label: string; value: string }[] = [
    { label: "Live products", value: seller.productCount.toLocaleString("en-US") },
    { label: "Verified since", value: seller.verifiedSince ? dateFormat.format(new Date(seller.verifiedSince)) : "Verified" },
    { label: "On Muhrak since", value: dateFormat.format(new Date(seller.memberSince)) },
  ];

  return (
    <main className="flex flex-1 flex-col bg-white text-ink">
      <SoftHero>
        <SiteNav side="buyer" current="Sellers" />
        <div className="mx-auto w-full max-w-[1100px] px-4 pt-6 pb-14 font-ai sm:px-8 lg:pt-12 lg:pb-20">
          <Link href="/sellers" className={cn("inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-tertiary hover:text-ink", softFocus)}>
            <span aria-hidden>←</span> All sellers
          </Link>
          {/* Identity card. */}
          <section aria-label={seller.companyName} className={cn("mt-5 flex flex-col gap-7 p-6 sm:p-9", softCard)}>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <LogoTile name={seller.companyName} logoUrl={seller.logoUrl} className="size-[104px] rounded-[26px] shadow-sm sm:size-[120px]" initialsClass="text-[40px]" />
              <div className="flex min-w-0 flex-col gap-2">
                <h1 className="font-ai-serif text-[34px] leading-[1.08] tracking-[-0.01em] break-words text-ink sm:text-[46px]">
                  {seller.companyName}
                  {/* Inline, so it stays next to the last word when the name wraps. */}
                  <VerifiedMark className="ml-2 inline size-6 align-[-0.08em] sm:size-7" />
                </h1>
                <p className="text-[15px] text-ink-tertiary">
                  {place}
                  {seller.verifiedSince ? <span> · Verified by Muhrak</span> : null}
                </p>
                {seller.about ? <p className="mt-1 line-clamp-3 max-w-[680px] text-[15px] leading-relaxed text-ink-secondary">{seller.about}</p> : null}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 sm:gap-3">
              {facts.map((fact) => (
                <div key={fact.label} className="flex min-w-0 flex-col gap-1 rounded-[16px] bg-[#f5f8fc] px-3 py-3 sm:rounded-[20px] sm:px-5 sm:py-4">
                  <dt className="text-[10px] tracking-[0.06em] text-ink-tertiary uppercase sm:text-[12px]">{fact.label}</dt>
                  <dd className="text-[14px] text-ink sm:text-lg">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </SoftHero>

      <section className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-24 font-ai sm:px-8 lg:pb-[120px]">
        <nav aria-label="Seller sections" className="flex gap-2">
          <Chip active={tab === "products"} count={seller.productCount} onClick={() => go({ tab: "products" })}>
            Products
          </Chip>
          <Chip active={tab === "overview"} onClick={() => go({ tab: "overview" })}>
            About
          </Chip>
        </nav>
        <div className="mt-8">
          {tab === "overview" ? (
            <Overview seller={seller} onCategory={(id) => go({ tab: "products", category: id })} />
          ) : (
            <Products
              seller={seller}
              category={category}
              page={page}
              onCategory={(id) => go({ category: id })}
              onPage={(next) => go({ category, page: next })}
              onRequest={requestQuote}
              quoteFor={buyer?.user.role === "buyer" ? quoteFor : null}
              onCloseQuote={() => router.replace(href({ category, page }), { scroll: false })}
            />
          )}
        </div>
      </section>

      <Footer side="buyer" soft />
    </main>
  );
}

function Products({
  seller,
  category,
  page,
  onCategory,
  onPage,
  onRequest,
  quoteFor,
  onCloseQuote,
}: {
  seller: PublicSeller;
  category: string;
  page: number;
  onCategory: (id: string) => void;
  onPage: (page: number) => void;
  onRequest: (productId: string) => void;
  quoteFor: string | null;
  onCloseQuote: () => void;
}) {
  const products = useSellerProducts(seller.id, { category: category || undefined, page });
  const data = products.data;
  // Only a product on this page of this seller can be asked about (a tampered ?quote= opens nothing).
  const quoted = quoteFor ? data?.items.find((item) => item.id === quoteFor) : undefined;
  const target: QuoteTarget | null = quoted
    ? {
        productId: quoted.id,
        name: quoted.name,
        partNumber: quoted.partNumber,
        fitment: quoted.fitment,
        photoUrl: quoted.photoUrl,
        price: quoted.price,
        availability: quoted.availability,
        stockQuantity: quoted.stockQuantity,
        leadTimeDays: quoted.leadTimeDays,
        seller: { id: seller.id, companyName: seller.companyName, city: seller.city, countryName: seller.countryName },
      }
    : null;

  return (
    <div className="flex flex-col gap-8">
      {seller.categories.length > 1 ? (
        <div aria-label="Categories" className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
          <Chip active={!category} count={seller.productCount} onClick={() => onCategory("")}>
            All
          </Chip>
          {seller.categories.map((item) => (
            <Chip key={item.id} active={category === item.id} count={item.count} onClick={() => onCategory(item.id)}>
              {item.name}
            </Chip>
          ))}
        </div>
      ) : null}
      {products.isPending ? (
        <Spinner label="Loading products" className="py-20" />
      ) : products.isError ? (
        <p role="alert" className="py-20 text-center text-sm text-destructive">
          Could not load products. Please try again.
        </p>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {data.items.map((product) => (
              <li key={product.id}>
                <ProductCardView product={product} onRequest={() => onRequest(product.id)} />
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="products" onPage={onPage} />
        </>
      ) : (
        <p className="py-16 text-center text-[15px] text-ink-tertiary">This seller has no live products here yet.</p>
      )}
      {target ? <QuoteRequestDialog key={target.productId} result={target} onClose={onCloseQuote} /> : null}
    </div>
  );
}

/** A product: its own photo, name, price, part number, category and condition, and "Request quote". */
function ProductCardView({ product, onRequest }: { product: PublicProductCard; onRequest: () => void }) {
  const unit = product.unit === "piece" ? "" : ` / ${UNIT_LABELS[product.unit].one}`;
  return (
    <article className={cn("flex h-full flex-col p-3", softCard)}>
      <div className="relative aspect-square overflow-hidden rounded-[20px] bg-linear-to-b from-white to-[#eef3f8]">
        {product.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public product photo from storage, sized by CSS
          <img src={product.photoUrl} alt={product.name} loading="lazy" className="absolute inset-[6%] size-[88%] object-contain" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-placeholder">No photo yet</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-2 pt-4 pb-2">
        <h3 className="line-clamp-2 text-base leading-snug font-medium text-ink">{product.name}</h3>
        <p className="text-[15px] text-ink">
          {product.price ? `${formatMoney(product.price)}${unit}` : "Price on request"}
          <span className="text-[13px] text-ink-tertiary"> · {availability(product)}</span>
        </p>
        <p className="truncate text-[13px] text-ink-tertiary">{product.partNumber ? `Part no. ${product.partNumber}` : product.categoryName}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          <span className="rounded-full bg-black/[0.055] px-2.5 py-1 text-[12px] text-ink-secondary">{CONDITION_LABELS[product.condition]}</span>
          {product.partNumber ? <span className="rounded-full bg-black/[0.055] px-2.5 py-1 text-[12px] text-ink-secondary">{product.categoryName}</span> : null}
        </div>
        <button
          type="button"
          onClick={onRequest}
          className={cn("mt-4 h-11 w-full rounded-full bg-ink text-[15px] font-medium text-white hover:opacity-90", softFocus)}
        >
          Request quote
        </button>
      </div>
    </article>
  );
}

function Overview({ seller, onCategory }: { seller: PublicSeller; onCategory: (id: string) => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className={cn("flex flex-col gap-8 p-6 sm:p-8", softCard)}>
        <div className="flex flex-col gap-3">
          <h2 className="font-ai-serif text-[28px] leading-tight text-ink">About {seller.companyName}</h2>
          <p className="max-w-[680px] text-[15px] leading-relaxed whitespace-pre-line text-ink-secondary">{seller.about || "This seller has not written an introduction yet."}</p>
        </div>
        {seller.brands.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-ink">Brands they carry</h3>
            <ul className="flex flex-wrap gap-2">
              {seller.brands.map((brand) => (
                <li key={brand} className="rounded-full bg-black/[0.055] px-3.5 py-2 text-[14px] text-ink-secondary">
                  {brand}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {seller.categories.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-ink">What they sell</h3>
            <div className="flex flex-wrap gap-2">
              {seller.categories.map((item) => (
                <Chip key={item.id} count={item.count} onClick={() => onCategory(item.id)}>
                  {item.name}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <dl className={cn("flex h-fit flex-col divide-y divide-black/8 px-6", softCard)}>
        {[
          { label: "Location", value: [seller.city, seller.countryName].filter(Boolean).join(", ") },
          { label: "Verified by Muhrak", value: seller.verifiedSince ? `Since ${dateFormat.format(new Date(seller.verifiedSince))}` : "Yes" },
          { label: "On Muhrak since", value: dateFormat.format(new Date(seller.memberSince)) },
          { label: "Live products", value: seller.productCount.toLocaleString("en-US") },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-4 text-sm">
            <dt className="text-ink-tertiary">{row.label}</dt>
            <dd className="text-right text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
