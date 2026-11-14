"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, use, useId, useState, type FormEvent } from "react";
import { browser } from "react-dom";
import { HOME_PATH, SIGNUP_PATH } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { initials, shortName } from "@/features/auth/user-display";
import { cn } from "@/lib/utils";

/** The frosted pill shared by both states, so the hero never changes height. */
const pillClass =
  "flex w-full max-w-[475px] items-center rounded-full border border-black/12 bg-white/60 py-[5px] pr-[5px] backdrop-blur-[15px]";
const buttonClass =
  "flex h-[46px] shrink-0 items-center justify-center rounded-full bg-ink px-[26px] text-sm leading-[1.3] font-medium whitespace-nowrap text-white outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Seller hero action. A signed-in SELLER gets "Go to Seller Centre" instead
 * of the email box (developer decision, 14 Nov 2026): signing up again makes
 * no sense for them. Everyone else, including a signed-in buyer (a visitor
 * on the seller side, strict isolation rule), gets the email box. The
 * server render and first paint show the email box; the session is read in
 * the browser.
 */
export function SellerHeroAction({ className }: { className?: string }) {
  return (
    <Suspense fallback={<SellerEmailCapture className={className} />}>
      <SellerHeroActionForSession className={className} />
    </Suspense>
  );
}

function SellerHeroActionForSession({ className }: { className?: string }) {
  use(browser("The session is stored in localStorage."));
  const session = useSession("seller");
  if (!session) return <SellerEmailCapture className={className} />;
  const name = session.user.fullName;
  return (
    <div className={cn(pillClass, "gap-3 pl-[5px]", className)}>
      <span aria-hidden className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-seller-orange text-sm leading-[1.3] font-semibold text-white">
        {initials(name)}
      </span>
      <p className="min-w-0 flex-1 truncate text-left text-[15px] leading-[1.3] text-ink-secondary">
        {/* Phone: just the name next to the initials, so it is not cut off. */}
        <span className="hidden sm:inline">Signed in as </span>
        <span className="text-ink">{shortName(name)}</span>
      </p>
      <Link href={HOME_PATH.seller} className={buttonClass}>
        Go to Seller Centre
      </Link>
    </div>
  );
}

/**
 * Figma "Seller – Landing" › Hero › Email capture (light): a frosted pill
 * with the email field and "Start selling now". Submitting opens seller
 * sign-up with the email filled in.
 */
export function SellerEmailCapture({ className }: { className?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const id = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    router.push(value ? `${SIGNUP_PATH.seller}?email=${encodeURIComponent(value)}` : SIGNUP_PATH.seller);
  }

  return (
    <form
      onSubmit={submit}
      className={cn(pillClass, "pl-[23px] focus-within:ring-3 focus-within:ring-ring/40", className)}
    >
      <label htmlFor={id} className="sr-only">
        Business email
      </label>
      <input
        id={id}
        type="email"
        autoComplete="email"
        placeholder="Enter your business email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="h-[46px] min-w-0 flex-1 bg-transparent text-[15px] leading-[1.3] text-ink outline-none placeholder:text-ink-placeholder"
      />
      <button type="submit" className={buttonClass}>
        Start selling now
      </button>
    </form>
  );
}
