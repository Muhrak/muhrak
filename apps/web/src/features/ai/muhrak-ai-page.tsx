"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUp, Camera, ChevronRight, ClipboardList, House, ImageIcon, Loader2, Pencil, RotateCcw, Search, Store, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { browser } from "react-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PART_MATCH_LABELS, type AiConfidence, type AiSuggestion, type PartSearchResponse, type PartSearchResult } from "@/schemas";
import { NavActions, SignedOutActions } from "@/components/landing/nav-actions";
import { LOGIN_PATH } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { useCategories } from "@/features/catalog/api";
import { priceLabel } from "@/features/catalog/parts";
import { availability, ProductPhoto, QuoteRequestDialog } from "@/features/rfq/quote-request-dialog";
import { usePartSearch } from "@/features/search/api";
import { acceptFor, checkFile, uploadFile } from "@/features/upload/upload-file";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { startIdentification, useAiAvailable, useBuyerIdentification, useBuyerIdentificationPhoto } from "./api";

/**
 * /ai: Muhrak AI (Day 8; redesigned 18 Nov 2026 from the developer's
 * reference refs/muhrak ai: one simple white card, a soft glow, a serif
 * question, suggestion chips and an input pill with a round button). The
 * glow uses the buyer blue palette only.
 *
 * Everything happens inside the card, no separate result page:
 * - a photo (round camera button, a chip, or drag and drop) is uploaded
 *   (private, cleaned of metadata), Muhrak AI identifies it and matching
 *   parts are listed, with each step shown as it runs;
 * - text typed in the pill searches by part number, name or machine.
 * A matching part opens the quote request in a modal.
 *
 * Photo search needs a BUYER sign-in (it costs money and is limited per
 * user); a visitor or a signed-in seller goes to the buyer login and comes
 * back here. Text search is public. The identification id, the text, edited
 * details, page and an open quote form live in the URL, so reload and Back
 * keep them.
 */

const PAGE = "/ai";

/** Local previews of photos sent from this tab, by identification id (shown again after Back / Forward). */
const previews = new Map<string, string>();

/** URL keys of details the buyer edited; a key present (even empty) overrides what the AI read. */
const KEYS = { name: "name", partNumber: "pn", machine: "machine", category: "cat" } as const;

interface Details {
  name: string;
  partNumber: string;
  machine: string;
  category: string;
}

/** A photo being sent from this page; `id` once Muhrak AI has it (the URL then takes over). */
type LocalRun = { previewUrl: string; stage: "uploading" | "identifying"; id?: string };

const chip = cn(
  "inline-flex h-11 items-center gap-2 rounded-full bg-black/[0.055] px-[18px] text-[15px] leading-none text-ink-secondary transition-colors hover:bg-black/[0.09] disabled:opacity-50 sm:h-12 sm:px-5 sm:text-base",
  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
);

function fromSuggestion(suggestion: AiSuggestion): Details {
  // What the AI only guessed ("low") is left out, as on Add product.
  const sure = (confidence: AiConfidence) => confidence !== "low";
  const fit = suggestion.fitments.value[0];
  return {
    name: suggestion.name.value ?? "",
    partNumber: sure(suggestion.partNumbers.confidence) ? (suggestion.partNumbers.value[0] ?? "") : "",
    machine: sure(suggestion.fitments.confidence) && fit ? `${fit.make} ${fit.model}` : "",
    category: sure(suggestion.category.confidence) ? (suggestion.category.value?.id ?? "") : "",
  };
}

const CONFIDENCE_TEXT: Record<AiConfidence, string> = {
  high: "High confidence. Check the details before you ask for a quote.",
  medium: "Medium confidence. Check the part number before you order.",
  low: "Low confidence. Check the details, or try a clearer photo.",
};

export function MuhrakAiPage() {
  // The buyer session is in localStorage: render in the browser only (wrapped in <Suspense>).
  use(browser("The session is stored in localStorage."));
  const router = useRouter();
  const params = useSearchParams();
  const buyer = useSession("buyer");
  const signedIn = buyer?.user.role === "buyer";
  const aiAvailable = useAiAvailable("buyer", signedIn);
  const photoOff = signedIn && aiAvailable.data === false;

  const id = params.get("id");
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(50, Number(params.get("page")) || 1));
  const quoteFor = params.get("quote");

  const [local, setLocal] = useState<LocalRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(q);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  // The local preview of the photo being checked; freed when replaced or on leaving,
  // unless it is kept as the preview of a started photo search (see `previews`).
  useEffect(
    () => () => {
      if (local && !local.id) URL.revokeObjectURL(local.previewUrl);
    },
    [local],
  );

  // Back / Forward (developer report, 19 Nov 2026): a photo that was being sent belongs to the
  // page it was sent from. Forget it, so going Back never shows "Identifying the part" again;
  // the result itself lives in the URL (?id=) and is shown from cache.
  useEffect(() => {
    const onHistory = () => {
      setLocal(null);
      setEditing(false);
    };
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);

  // A photo search in the URL belongs to a buyer: anyone else signs in first, then comes back.
  useEffect(() => {
    if (id && !signedIn) {
      router.replace(`${LOGIN_PATH.buyer}?next=${encodeURIComponent(`${PAGE}?id=${id}`)}`);
    }
  }, [id, signedIn, router]);

  const identification = useBuyerIdentification(id ?? "", Boolean(id) && signedIn);
  const localPreview = id ? previews.get(id) : undefined;
  const photo = useBuyerIdentificationPhoto(id ?? "", Boolean(id) && signedIn && !local && !localPreview);
  const data = id ? identification.data : undefined;
  const suggestion = data?.status === "done" && data.suggestion?.isPart ? data.suggestion : null;
  const base = suggestion ? fromSuggestion(suggestion) : null;
  const edited = Object.values(KEYS).some((key) => params.has(key));
  const details: Details | null = base
    ? {
        name: (params.get(KEYS.name) ?? base.name).slice(0, 120),
        partNumber: (params.get(KEYS.partNumber) ?? base.partNumber).slice(0, 40),
        machine: (params.get(KEYS.machine) ?? base.machine).slice(0, 80),
        category: params.get(KEYS.category) ?? base.category,
      }
    : null;

  const categories = useCategories();
  const category = details?.category ? categories.data?.find((item) => item.id === details.category) : undefined;
  const photoSearch = usePartSearch(
    // An unknown category id (tampered URL) is dropped rather than sent.
    { q: details?.name ?? "", partNumber: details?.partNumber, machine: details?.machine, category: category?.id, page },
    details !== null && (!details.category || categories.isSuccess),
  );
  const textSearch = usePartSearch({ q, page }, !id && q.length >= 2);
  const search = id ? photoSearch : textSearch;
  const results = (id ? details !== null : q.length >= 2) ? search.data : undefined;
  const open = quoteFor ? (results?.items.find((item) => item.productId === quoteFor) ?? null) : null;

  function href(next: { details?: Details; page?: number; quote?: string | null }) {
    const query = new URLSearchParams();
    if (id) query.set("id", id);
    else if (q) query.set("q", q);
    const values = next.details ?? (edited ? details : null);
    if (id && values) {
      query.set(KEYS.name, values.name);
      query.set(KEYS.partNumber, values.partNumber);
      query.set(KEYS.machine, values.machine);
      query.set(KEYS.category, values.category);
    }
    const nextPage = next.page ?? (next.details ? 1 : page);
    if (nextPage > 1) query.set("page", String(nextPage));
    if (next.quote) query.set("quote", next.quote);
    return query.size ? `${PAGE}?${query}` : PAGE;
  }

  function toLogin() {
    router.push(`${LOGIN_PATH.buyer}?next=${encodeURIComponent(PAGE)}`);
  }

  function choosePhoto(camera: boolean) {
    if (!signedIn) return toLogin();
    (camera ? cameraRef : pickerRef).current?.click();
  }

  async function startPhoto(file: File | undefined) {
    if (!file || local) return;
    if (!signedIn) return toLogin();
    const problem = checkFile("part_photo", file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setEditing(false);
    setDraft("");
    router.replace(PAGE, { scroll: false });
    const previewUrl = URL.createObjectURL(file);
    setLocal({ previewUrl, stage: "uploading" });
    try {
      const uploadId = await uploadFile("buyer", "part_photo", file);
      setLocal({ previewUrl, stage: "identifying" });
      const started = await startIdentification("buyer", uploadId);
      // Keep the local preview for this search (also after Back / Forward); once the URL has the id,
      // the identification query shows the progress.
      previews.set(started.id, previewUrl);
      setLocal({ previewUrl, stage: "identifying", id: started.id });
      router.replace(`${PAGE}?id=${started.id}`, { scroll: false });
    } catch (caught) {
      URL.revokeObjectURL(previewUrl);
      setLocal(null);
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    }
  }

  // Once the URL carries the new identification, the local run has done its job (its preview stays shown).
  const previewUrl = local?.previewUrl ?? localPreview ?? photo.data ?? null;
  // Before the id is known the run is in progress; once the URL carries its id the query takes over.
  const localStage = local && !local.id ? local.stage : local && local.id && !id ? "identifying" : null;

  function onText(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (text.length < 2) {
      setError("Type at least 2 characters, or add a photo.");
      return;
    }
    setError(null);
    setLocal(null);
    setEditing(false);
    router.push(`${PAGE}?${new URLSearchParams({ q: text })}`, { scroll: false });
  }

  function startOver() {
    setLocal(null);
    setError(null);
    setEditing(false);
    setDraft("");
    router.push(PAGE, { scroll: false });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void startPhoto(event.dataTransfer.files?.[0]);
  }

  // ------------------------------------------------------------ what the page shows
  // Like a chat: the buyer's photo (or text) on the right, Muhrak AI's answer on the
  // left under it. While something runs, ONE status line with the turning Muhrak
  // mark says what is happening now, and its text changes as the work moves on.
  const reading = Boolean(localStage) || data?.status === "pending" || data?.status === "running";
  // Only for a result not in this tab's memory (opened from a link): a short fetch, no AI call.
  const loadingId = Boolean(id) && (identification.isPending || !signedIn) && !local;
  const failed =
    data?.status === "failed"
      ? "Muhrak AI could not read this photo. Try a clear photo of the whole part, or type the part number below."
      : data?.suggestion && !data.suggestion.isPart
        ? "This photo does not look like a vehicle or machine part. Try another photo, or type what you need below."
        : null;
  const working: string | null =
    localStage === "uploading"
      ? "Uploading your photo"
      : reading
        ? "Identifying the part"
        : loadingId
          ? "Loading your result"
          : details && search.isPending
          ? "Finding matching sellers"
          : null;
  const openQuote = (item: PartSearchResult) => router.replace(href({ quote: item.productId }), { scroll: false });
  const goPage = (next: number) => router.push(href({ page: next }), { scroll: false });

  let body: ReactNode;
  if (id && identification.isError) {
    body = <Message text="This photo search was not found. It may belong to another account." actions={<StartOver onClick={startOver} />} />;
  } else if (id || local) {
    let answer: ReactNode = null;
    if (working) {
      answer = <Status text={working} />;
    } else if (failed) {
      answer = (
        <>
          <Status text="Could not identify the part" done />
          <div className="mt-3 pl-[38px]">
            <Message text={failed} actions={<StartOver onClick={startOver} label="Try another photo" />} />
          </div>
        </>
      );
    } else if (suggestion && details) {
      const nothing = !details.name && !details.partNumber && !details.machine;
      answer = (
        <>
          <Status
            done
            text={
              nothing || !results
                ? "Identified the part"
                : results.total === 0
                  ? "Identified the part. No matching parts yet"
                  : `Identified the part and found ${results.total.toLocaleString("en-US")} matching ${results.total === 1 ? "part" : "parts"}`
            }
          />
          <div className="mt-4 sm:pl-[38px]">
            <div className="rounded-[24px] bg-white/80 p-5 shadow-[inset_0_0_0_1px_rgba(10,11,18,0.06)] sm:p-6">
              <p className="text-[12px] font-medium tracking-[0.06em] text-ink-tertiary">IDENTIFIED PART</p>
              <h2 className="mt-1.5 font-ai-serif text-[30px] leading-[1.1] tracking-[-0.01em] break-words text-ink sm:text-[36px]">
                {details.name || "Part from your photo"}
              </h2>
              <p className="mt-2 text-[15px] leading-normal text-ink-tertiary">
                {edited ? "You edited the details; the matches follow your changes." : CONFIDENCE_TEXT[suggestion.name.confidence]}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Fact label="Part no." value={details.partNumber} />
                <Fact label="Fits" value={details.machine} />
                <Fact label="Category" value={category?.name} />
                <button type="button" onClick={() => setEditing(true)} className={cn(chip, "h-9 px-3.5 text-sm sm:h-9 sm:px-3.5 sm:text-sm")}>
                  <Pencil aria-hidden className="size-3.5" />
                  Edit details
                </button>
              </div>
            </div>
            <div className="mt-6">
              {nothing ? (
                <Message text="Muhrak AI could not read a name or part number. Add one with Edit details." />
              ) : (
                <Results
                  results={results}
                  isError={search.isError}
                  onOpen={openQuote}
                  onPage={goPage}
                  empty="No live part from a verified seller matches these details yet. Edit the details, or type a part number below."
                />
              )}
            </div>
            <div className="mt-5">
              <StartOver onClick={startOver} label="Try another photo" />
            </div>
          </div>
        </>
      );
    }
    body = (
      <div className="flex flex-col">
        <PhotoBubble previewUrl={previewUrl} />
        <div className="mt-6">{answer}</div>
      </div>
    );
  } else if (q.length >= 2) {
    body = (
      <div className="flex flex-col">
        <p className="max-w-[80%] self-end rounded-[22px] rounded-br-[8px] bg-black/[0.055] px-5 py-3 text-base break-words text-ink">{q}</p>
        <div className="mt-6">
          {search.isPending ? (
            <Status text="Finding matching sellers" />
          ) : (
            <>
              <Status
                done
                text={results && results.total > 0 ? `Found ${results.total.toLocaleString("en-US")} matching ${results.total === 1 ? "part" : "parts"}` : "Searched the live parts"}
              />
              <div className="mt-4 sm:pl-[38px]">
                <Results
                  results={results}
                  isError={search.isError}
                  onOpen={openQuote}
                  onPage={goPage}
                  empty="No live part matches this yet. Check the part number, or try a photo."
                />
                <div className="mt-5">
                  <StartOver onClick={startOver} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <div>
        <h1 className="font-ai-serif text-[38px] leading-[1.08] tracking-[-0.02em] text-[#8b8d96] sm:text-[56px]">Which part do you need?</h1>
        <p className="mt-3 max-w-[520px] text-base leading-normal text-ink-tertiary sm:text-[17px]">
          Upload a photo of the part, or type its number. Muhrak AI finds verified sellers who can supply it.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          {photoOff ? (
            <p className="w-full text-[15px] leading-normal text-ink-tertiary">Photo search is not available right now. Type the part number or name below.</p>
          ) : (
            <>
              <button type="button" onClick={() => choosePhoto(true)} className={cn(chip, "hidden pointer-coarse:inline-flex")}>
                Take a photo
              </button>
              <button type="button" onClick={() => choosePhoto(false)} className={chip}>
                Upload a photo
              </button>
            </>
          )}
          <button type="button" onClick={() => textRef.current?.focus()} className={chip}>
            Type a part number
          </button>
          <Link href="/sellers" className={chip}>
            Browse sellers
          </Link>
        </div>
      </div>
    );
  }

  const busy = Boolean(localStage);
  const idle = !id && q.length < 2 && !local;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy && !photoOff) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={onDrop}
      className="relative isolate flex min-h-svh flex-col bg-white font-ai text-ink"
    >
      <Glow />
      <AiHeader />

      <main className="mx-auto flex w-full max-w-[840px] flex-1 flex-col px-4 sm:px-8">
        {idle ? null : <h1 className="sr-only">Muhrak AI</h1>}
        <div className={cn("flex flex-1 flex-col pb-6", idle ? "justify-center pt-10" : "pt-8 sm:pt-14")} aria-live="polite">
          {body}
          {error ? (
            <p role="alert" className="mt-4 text-sm leading-normal text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        {/* The composer stays at the bottom of the screen: type a part number / name, or the round button for a photo. */}
        <div className="sticky bottom-0 z-10 pt-3 pb-5 sm:pb-8">
          <form role="search" onSubmit={onText} className="flex items-center gap-2.5 sm:gap-3.5">
            <label htmlFor="ai-text" className="sr-only">
              Part number, part name or machine
            </label>
            <div className="flex h-16 min-w-0 flex-1 items-center rounded-full bg-white pr-2 pl-6 shadow-[0_10px_30px_-12px_rgba(10,11,18,0.18),inset_0_0_0_1px_rgba(10,11,18,0.06)] focus-within:ring-3 focus-within:ring-ring/40 sm:h-[72px] sm:pl-8">
              <input
                ref={textRef}
                id="ai-text"
                type="search"
                value={draft}
                maxLength={80}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Part number or name…"
                className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-[#8b8d96] sm:text-lg"
              />
              {draft.trim().length >= 2 ? (
                <button type="submit" aria-label="Search" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:opacity-90 sm:size-12">
                  <ArrowUp aria-hidden className="size-5" />
                </button>
              ) : (
                <Search aria-hidden className="mr-3 size-5 shrink-0 text-ink-placeholder" />
              )}
            </div>
            <button
              type="button"
              onClick={() => choosePhoto(false)}
              disabled={busy || photoOff}
              aria-label="Search with a photo"
              title="Search with a photo"
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white text-sky-periwinkle shadow-[0_10px_30px_-12px_rgba(10,11,18,0.18),inset_0_0_0_1px_rgba(10,11,18,0.06)] transition-colors outline-none hover:text-sky-blue focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:size-[72px]"
            >
              {busy ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <Camera aria-hidden className="size-6 sm:size-7" />}
            </button>
            <PhotoInput inputRef={pickerRef} onFile={(file) => void startPhoto(file)} />
            {/* Opens the rear camera on phones. */}
            <PhotoInput inputRef={cameraRef} camera onFile={(file) => void startPhoto(file)} />
          </form>
          {!signedIn ? (
            <p className="pt-3 text-center text-[13px] leading-normal text-ink-tertiary">
              Photo search needs a free buyer account.{" "}
              <button type="button" onClick={toLogin} className="rounded-sm text-ink underline-offset-2 hover:underline">
                Log in
              </button>
            </p>
          ) : null}
        </div>
      </main>

      {dragging ? <div aria-hidden className="pointer-events-none fixed inset-3 z-30 rounded-[32px] border-2 border-dashed border-sky-azure/70 bg-sky-light/10" /> : null}
      {editing && details ? (
        <EditDetailsDialog
          details={details}
          categories={categories.data ?? []}
          onClose={() => setEditing(false)}
          onSave={(next) => {
            setEditing(false);
            router.replace(href({ details: next }), { scroll: false });
          }}
        />
      ) : null}
      {open ? (
        <QuoteRequestDialog
          key={open.productId}
          result={open}
          // From a photo result: offer the buyer's own photo to this seller (they can untick it).
          photo={id && suggestion ? { identificationId: id, previewUrl } : undefined}
          onClose={() => router.replace(href({ quote: null }), { scroll: false })}
        />
      ) : null}
    </div>
  );
}

/**
 * The page's own slim bar (no site nav or footer: Muhrak AI is a standalone
 * screen). Logo back to the home page; the other buyer pages as icons with
 * labels on desktop; account button (and the full menu on phones).
 */
const AI_NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/sellers", label: "Sellers", icon: Store },
  { href: "/buyer/requests", label: "My requests", icon: ClipboardList },
] as const;

function AiHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-white/75 px-4 backdrop-blur-md sm:h-[72px] sm:px-8">
      <Link href="/" aria-label="Muhrak home" className="flex shrink-0 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={128} height={24.44} priority />
      </Link>
      <span aria-hidden className="h-5 w-px bg-black/12" />
      <span className="text-[15px] font-medium whitespace-nowrap text-ink-secondary">Muhrak AI</span>
      <div className="flex-1" />
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {AI_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex h-10 items-center gap-2 rounded-full px-3.5 text-sm text-ink-secondary transition-colors outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Icon aria-hidden className="size-[18px]" />
            {label}
          </Link>
        ))}
      </nav>
      <Suspense fallback={<SignedOutActions side="buyer" />}>
        <NavActions side="buyer" />
      </Suspense>
    </header>
  );
}

// ---------------------------------------------------------------- pieces

function PhotoInput({ inputRef, camera = false, onFile }: { inputRef: React.Ref<HTMLInputElement>; camera?: boolean; onFile: (file: File | undefined) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={acceptFor("part_photo")}
      capture={camera ? "environment" : undefined}
      tabIndex={-1}
      aria-hidden
      className="sr-only"
      onChange={(event) => {
        onFile(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
  );
}

/** The soft glow of the reference, in the buyer blues only: low on the screen, behind the composer. */
function Glow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[75vh]">
      <div className="absolute inset-0 bg-[radial-gradient(45%_60%_at_8%_95%,rgba(132,201,232,0.34),transparent_70%),radial-gradient(45%_60%_at_92%_90%,rgba(87,127,186,0.26),transparent_70%),radial-gradient(60%_45%_at_50%_105%,rgba(99,182,226,0.30),transparent_75%)]" />
      {/* Fades into white at the top, as in the reference. */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white to-transparent" />
    </div>
  );
}

/**
 * Muhrak AI's status line, like a chat assistant's: the Muhrak mark turns and
 * the text shimmers while the step runs; both rest when it is done.
 */
function Status({ text, done = false }: { text: string; done?: boolean }) {
  return (
    <p role="status" className="flex items-center gap-3 text-base leading-snug">
      <span aria-hidden className={cn("ai-mark block h-[22px] w-[26px] shrink-0", !done && "ai-mark-working")} />
      <span className={done ? "text-ink-secondary" : "ai-shimmer"}>{done ? text : `${text}…`}</span>
    </p>
  );
}

/** The buyer's photo, on the right like a sent chat message. */
function PhotoBubble({ previewUrl }: { previewUrl: string | null }) {
  // A link that failed (expired, or the file is gone) shows the placeholder, not a broken image.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div className="size-[150px] self-end overflow-hidden rounded-[24px] rounded-br-[8px] bg-black/5 shadow-sm sm:size-[180px]">
      {previewUrl && previewUrl !== failedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview or short-lived signed link to the buyer's private photo
        <img
          src={previewUrl}
          alt="Your photo of the part"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(previewUrl)}
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <ImageIcon aria-hidden className="size-6 text-ink-placeholder" />
        </span>
      )}
    </div>
  );
}

function Message({ text, actions }: { text: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-base leading-normal text-ink-secondary">{text}</p>
      {actions}
    </div>
  );
}

function StartOver({ onClick, label = "New search" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(chip, "h-10 px-4 text-[15px] sm:h-10 sm:px-4 sm:text-[15px]")}>
      <RotateCcw aria-hidden className="size-4" />
      {label}
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <span className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-white/80 px-3.5 text-sm shadow-[inset_0_0_0_1px_rgba(10,11,18,0.06)]">
      <span className="text-ink-tertiary">{label}</span>
      <span className={cn("truncate", value ? "text-ink" : "text-ink-placeholder")}>{value || "Not read"}</span>
    </span>
  );
}

/** Matching parts: compact rows; one opens the quote request modal. */
function Results({
  results,
  isError,
  empty,
  onOpen,
  onPage,
}: {
  results: PartSearchResponse | undefined;
  isError: boolean;
  empty: string;
  onOpen: (item: PartSearchResult) => void;
  onPage: (page: number) => void;
}) {
  if (isError) return <Message text="Could not search right now. Please try again." />;
  if (!results || results.items.length === 0) return <Message text={empty} />;
  const pages = Math.ceil(results.total / results.pageSize);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-tertiary">From verified sellers. Open a part to ask for a quote.</p>
      <ul className="flex flex-col gap-2">
        {results.items.map((item) => (
          <li key={item.productId}>
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="flex w-full items-center gap-3.5 rounded-[22px] bg-white/85 p-2.5 pr-4 text-left shadow-[inset_0_0_0_1px_rgba(10,11,18,0.05)] transition-colors outline-none hover:bg-white focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ProductPhoto src={item.photoUrl} className="size-14 rounded-[16px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                <span className="truncate text-[15px] text-ink">{item.name}</span>
                <span className="truncate text-[13px] text-ink-tertiary">
                  {item.seller.companyName} · {item.seller.city}, {item.seller.countryName}
                </span>
                <span className="truncate text-[12px] text-ink-tertiary">
                  {PART_MATCH_LABELS[item.match]} · {availability(item)}
                </span>
              </span>
              <span className="hidden shrink-0 text-[15px] whitespace-nowrap text-ink sm:block">{priceLabel(item.price)}</span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-placeholder" />
            </button>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <div className="flex items-center gap-2 pt-1">
          <button type="button" disabled={results.page <= 1} onClick={() => onPage(results.page - 1)} className={cn(chip, "h-9 px-3.5 text-sm sm:h-9 sm:text-sm")}>
            Previous
          </button>
          <span className="text-sm text-ink-tertiary">
            Page {results.page} of {pages}
          </span>
          <button type="button" disabled={results.page >= pages} onClick={() => onPage(results.page + 1)} className={cn(chip, "h-9 px-3.5 text-sm sm:h-9 sm:text-sm")}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- edit

const editSchema = z
  .object({
    name: z.string().trim().max(120, "Up to 120 characters"),
    partNumber: z.string().trim().max(40, "Up to 40 characters"),
    machine: z.string().trim().max(80, "Up to 80 characters"),
    category: z.string(),
  })
  .refine((value) => [value.name, value.partNumber, value.machine].some((text) => text.length >= 2), {
    message: "Fill in a part name, part number or machine (2 characters or more).",
    path: ["name"],
  });
type EditValues = z.infer<typeof editSchema>;

const inputClass =
  "h-12 w-full min-w-0 rounded-[14px] bg-white px-4 text-[15px] text-ink shadow-[inset_0_0_0_1px_rgba(10,11,18,0.1)] outline-none placeholder:text-ink-placeholder focus-visible:ring-3 focus-visible:ring-ring/40";

/** What the AI read, editable in a modal: the buyer corrects it and the matches follow. */
function EditDetailsDialog({
  details,
  categories,
  onSave,
  onClose,
}: {
  details: Details;
  categories: { id: string; name: string }[];
  onSave: (next: Details) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const form = useForm<EditValues>({ resolver: zodResolver(editSchema), defaultValues: details });
  const errors = form.formState.errors;
  const fields: { key: "name" | "partNumber" | "machine"; label: string; placeholder: string; max: number }[] = [
    { key: "name", label: "Part name", placeholder: "e.g. Hydraulic oil filter", max: 120 },
    { key: "partNumber", label: "Part number", placeholder: "e.g. 6020/F4", max: 40 },
    { key: "machine", label: "Fits (machine)", placeholder: "e.g. Kobelco SK380", max: 80 },
  ];

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // A click on the scrim (outside the card) closes, like Escape.
        if (event.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="edit-details-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[520px] overflow-y-auto rounded-[28px] bg-white p-0 font-ai text-ink shadow-[0_30px_80px_rgba(10,11,18,0.18)] backdrop:bg-[rgba(10,11,18,0.4)] backdrop:backdrop-blur-[2px]"
    >
      <form noValidate onSubmit={form.handleSubmit((values) => onSave(values))} className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="edit-details-title" className="font-ai-serif text-[28px] leading-[1.1] text-ink">
              Edit details
            </h2>
            <p className="mt-1.5 text-sm leading-normal text-ink-tertiary">Correct what Muhrak AI read; the matching parts follow your changes.</p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-secondary outline-none hover:bg-black/5 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {fields.map((field) => (
            <label key={field.key} className="flex min-w-0 flex-col gap-1.5 text-[13px] text-ink-tertiary">
              {field.label}
              <input {...form.register(field.key)} maxLength={field.max} placeholder={field.placeholder} aria-invalid={Boolean(errors[field.key])} className={inputClass} />
              {errors[field.key] ? <span className="text-[13px] text-destructive">{errors[field.key]?.message}</span> : null}
            </label>
          ))}
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] text-ink-tertiary">
            Category
            <select {...form.register("category")} className={inputClass}>
              <option value="">Any category</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} className={cn(chip, "h-11 px-5 text-[15px] sm:h-11 sm:text-[15px]")}>
            Cancel
          </button>
          <button type="submit" className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[15px] font-medium text-white outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50">
            Find matching parts
          </button>
        </div>
      </form>
    </dialog>
  );
}
