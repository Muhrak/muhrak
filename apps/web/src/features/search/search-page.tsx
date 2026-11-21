"use client";

import { Search } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PART_MATCH_LABELS, type PartSearchResult } from "@/schemas";
import { Footer, SiteNav } from "@/components/landing/sections";
import { LOGIN_PATH } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { priceLabel } from "@/features/catalog/parts";
import { availability, ProductPhoto, QuoteRequestDialog } from "@/features/rfq/quote-request-dialog";
import { AuroraBand, focus, Pagination } from "@/features/storefront/parts";
import { cn } from "@/lib/utils";
import { usePartSearch } from "./api";
import { Spinner } from "@/components/ui/spinner";

/**
 * /search: find a part by part number, name or machine (Day 8, the non-AI
 * route). Hero like the Sellers page; results in the row style of Figma
 * "Muhrak AI – Results v2" › "Recommended sellers" (248:6895), dark only,
 * converted to light with the buyer palette. Only live products of
 * verified sellers. Query, page and an open quote form live in the URL, so
 * Back, shared links and "log in, then come back" work.
 *
 * "Request quote" needs a BUYER sign-in (a seller signed in counts as a
 * visitor here): visitors go to the buyer login and come back with the
 * form open.
 */
export function SearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(50, Number(params.get("page")) || 1));
  const quoteFor = params.get("quote");
  const [draft, setDraft] = useState(q);
  const buyer = useSession("buyer");

  const search = usePartSearch({ q, page });
  const data = q.length >= 2 ? search.data : undefined;
  // The open quote form lives in the URL (?quote=<product>), so it survives the trip through the buyer login.
  const open = buyer?.user.role === "buyer" && quoteFor ? (data?.items.find((item) => item.productId === quoteFor) ?? null) : null;

  function href(next: { q?: string; page?: number; quote?: string | null }) {
    const merged = { q, page, quote: null as string | null, ...next };
    const query = new URLSearchParams();
    if (merged.q) query.set("q", merged.q);
    if (merged.page > 1) query.set("page", String(merged.page));
    if (merged.quote) query.set("quote", merged.quote);
    return query.size ? `/search?${query}` : "/search";
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    router.push(href({ q: draft.trim(), page: 1 }));
  }

  function requestQuote(result: PartSearchResult) {
    const withForm = href({ quote: result.productId });
    if (buyer?.user.role === "buyer") router.replace(withForm, { scroll: false });
    else router.push(`${LOGIN_PATH.buyer}?next=${encodeURIComponent(withForm)}`);
  }

  return (
    <main className="flex flex-1 flex-col bg-canvas text-ink">
      <AuroraBand className="lg:h-[470px]">
        <SiteNav side="buyer" />
        <div className="relative flex flex-col items-center px-4 pt-10 pb-14 text-center lg:pt-[86px] lg:pb-0">
          <p className="text-[13px] leading-[normal] tracking-[0.06em] text-[rgba(74,77,89,0.9)]">FIND A PART</p>
          <h1 className="mt-5 bg-linear-to-b from-ink via-[#292b36] via-55% to-[#737585] bg-clip-text pb-2 text-[56px] leading-[0.9] font-medium tracking-[-0.05em] text-transparent sm:text-[96px] lg:mt-7 lg:text-[120px]">
            Find a part
          </h1>
          <form
            role="search"
            onSubmit={onSearch}
            className="mt-8 flex w-full max-w-[560px] items-center gap-3 rounded-full border border-black/22 bg-white/60 py-1.5 pr-1.5 pl-[22px] backdrop-blur-[15px] focus-within:ring-3 focus-within:ring-ring/40 lg:mt-10"
          >
            <Search aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
            <label htmlFor="part-search" className="sr-only">
              Search parts
            </label>
            <input
              id="part-search"
              type="search"
              value={draft}
              maxLength={80}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Part number, part name or machine"
              className="h-[42px] min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-placeholder"
            />
            <button type="submit" className={cn("rounded-full bg-ink px-[22px] py-[11px] text-sm leading-[normal] font-medium text-white hover:opacity-90", focus)}>
              Search
            </button>
          </form>
        </div>
      </AuroraBand>

      <section aria-label="Results" className="flex flex-col items-center px-4 pt-16 pb-[110px] sm:px-10 lg:pt-[100px] xl:px-[60px]">
        {q.length < 2 ? (
          <Intro text="Type a part number such as 6020/F4, a part name, or a machine such as Kobelco SK380." />
        ) : search.isPending ? (
<Spinner label="Searching" className="py-16" />
        ) : search.isError ? (
          <p role="alert" className="py-10 text-sm text-destructive">
            Could not search right now. Please try again.
          </p>
        ) : data && data.items.length > 0 ? (
          <>
            <Image src="/landing/sparkle.svg" alt="" width={18} height={18} />
            <span className="h-14" />
            <p className="rounded-full bg-black/6 py-1.5 pr-3 pl-2.5 text-[13px] leading-[normal] font-medium">
              {data.total.toLocaleString("en-US")} {data.total === 1 ? "part" : "parts"} found
            </p>
            <span className="h-[22px]" />
            <h2 className="max-w-full text-center text-[40px] leading-[normal] tracking-[-0.03em] break-words sm:text-[56px] lg:text-[72px]">Matching sellers</h2>
            <span className="h-6" />
            <p className="max-w-[640px] text-center text-base leading-[normal] text-ink-secondary">
              For “{q}”. Ask a seller for a quote; they reply with a price and delivery time.
            </p>
            <span className="h-16" />
            <ul className="flex w-full max-w-[1320px] flex-col gap-3">
              {data.items.map((item) => (
                <li key={item.productId}>
                  <ResultRow result={item} onRequest={() => requestQuote(item)} />
                </li>
              ))}
            </ul>
            <div className="mt-[60px] w-full max-w-[1320px]">
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="parts" onPage={(next) => router.push(href({ page: next }))} />
            </div>
          </>
        ) : (
          <Intro
            text={`No live part matches “${q}” yet. Check the part number, or search by part name or machine.`}
            action={{ label: "Browse sellers", href: "/sellers" }}
          />
        )}
      </section>

      <Footer side="buyer" />
      {open ? <QuoteRequestDialog key={open.productId} result={open} onClose={() => router.replace(href({ quote: null }), { scroll: false })} /> : null}
    </main>
  );
}

function Intro({ text, action }: { text: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex max-w-[560px] flex-col items-center gap-4 py-6 text-center">
      <Image src="/landing/sparkle.svg" alt="" width={18} height={18} />
      <p className="text-base leading-[1.5] text-ink-secondary">{text}</p>
      {action ? (
        <a href={action.href} className={cn("rounded-full border border-black/25 px-5 py-2.5 text-sm font-medium hover:bg-black/4", focus)}>
          {action.label}
        </a>
      ) : null}
    </div>
  );
}

/** Figma seller row: photo 64, name + seller · place, match tag, price + availability, "Request quote". */
export function ResultRow({ result, onRequest }: { result: PartSearchResult; onRequest: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[18px] border border-black/8 bg-linear-to-b from-white/90 to-white/60 py-4 pr-5 pl-4 backdrop-blur-[15px] md:flex-nowrap">
      <ProductPhoto src={result.photoUrl} className="size-16" />
      <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1.5 leading-[normal]">
        <p className="truncate text-[17px]" title={result.name}>
          {result.name}
        </p>
        <p className="truncate text-sm">
          <a href={`/sellers/${result.seller.id}`} className={cn("rounded-sm text-ink-secondary hover:underline", focus)}>
            {result.seller.companyName}
          </a>
          <span className="text-ink-tertiary">
            {" "}
            · {result.seller.city}, {result.seller.countryName}
          </span>
        </p>
        {result.partNumber ? <p className="truncate text-[13px] text-ink-tertiary">Part no. {result.partNumber}</p> : null}
      </div>
      {/* Phones: tag and price on one line, the button full width below. */}
      <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-3 md:w-auto md:flex-nowrap">
        <span className="shrink-0 rounded-full bg-black/6 px-[11px] py-[5px] text-xs leading-[normal] font-medium whitespace-nowrap">{PART_MATCH_LABELS[result.match]}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal] md:min-w-[120px] md:flex-none">
          <p className="text-[18px] whitespace-nowrap">{priceLabel(result.price)}</p>
          <p className="text-[13px] text-ink-tertiary">{availability(result)}</p>
        </div>
        <button type="button" onClick={onRequest} className={cn("w-full shrink-0 rounded-full bg-ink px-[22px] py-3 text-sm leading-[normal] font-medium whitespace-nowrap text-white hover:opacity-90 md:w-auto", focus)}>
          Request quote
        </button>
      </div>
    </div>
  );
}
