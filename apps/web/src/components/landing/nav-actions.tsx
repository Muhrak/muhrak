"use client";

import type { PublicUser } from "@muhrak/schemas";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useRef, useState, type CSSProperties } from "react";
import { browser } from "react-dom";
import { useSignOut } from "@/features/auth/hooks";
import { HOME_PATH, LOGIN_PATH } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { initials, shortName } from "@/features/auth/user-display";
import { cn } from "@/lib/utils";
import { MobileGlow } from "./mobile-glow";
import { NAV_LINKS, SELLER_NAV_LINKS } from "./nav-links";

export type LandingSide = "buyer" | "seller";

/**
 * Right side of the landing page nav.
 * - Desktop (lg+), signed out: "Sign in". No theme toggle: the site is
 *   light only (developer decision, 13 Nov 2026).
 * - Desktop, signed in: the profile button from Figma
 *   "Buyer – Landing v2 (Signed in)" in light colours; it opens the dashboard.
 * - Below lg: a hamburger button opening a full-screen menu.
 * "Find a part" is not in the nav: the hero has the dedicated button
 * (developer decision, 11 Nov 2026).
 */

const focus = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const avatarClass = (user: PublicUser) =>
  user.role === "seller" ? "bg-seller-orange" : "bg-[linear-gradient(135deg,#63b6e2_0%,#4a88c1_50%,#577fba_100%)]";

function Avatar({ user, size, textClass = "text-xs" }: { user: PublicUser; size: number; textClass?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full leading-[1.3] font-semibold text-white", textClass, avatarClass(user))}
      style={{ width: size, height: size }}
    >
      {initials(user.fullName)}
    </span>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("icon-mask inline-block size-3.5 text-ink", className)}
      style={{ "--icon": "url(/landing/profile-chevron.svg)" } as CSSProperties}
    />
  );
}

/** Desktop actions + mobile menu for a visitor (server render and signed-out state). */
export function SignedOutActions({ side = "buyer" }: { side?: LandingSide }) {
  return <Actions user={null} side={side} />;
}

/**
 * Reads this side's stored session, so it renders in the browser only; wrap
 * in <Suspense fallback={<SignedOutActions />}>. STRICT RULE: only `side`'s
 * session counts; a buyer signed in elsewhere is a visitor on /sell.
 */
export function NavActions({ side = "buyer" }: { side?: LandingSide }) {
  use(browser("The session is stored in localStorage."));
  const session = useSession(side);
  return <Actions user={session?.user ?? null} side={side} />;
}

function Actions({ user, side }: { user: PublicUser | null; side: LandingSide }) {
  return (
    <>
      <div className="hidden items-center gap-2.5 lg:flex">
        {user ? (
          <Link
            href={HOME_PATH[side]}
            aria-label={`${user.fullName}: open your dashboard`}
            className={cn("flex items-center gap-2 rounded-full border border-black/22 bg-white/60 py-1 pr-3.5 pl-1 backdrop-blur-[15px] hover:bg-white/80", focus)}
          >
            <Avatar user={user} size={34} />
            <span className="max-w-[140px] truncate text-sm leading-[1.3] text-ink">{shortName(user.fullName)}</span>
            <Chevron />
          </Link>
        ) : (
          <Link
            href={LOGIN_PATH[side]}
            className={cn("rounded-full border border-black/22 bg-white/60 px-[22px] py-3 text-sm leading-[1.3] whitespace-nowrap text-ink backdrop-blur-[15px] hover:bg-white/80", focus)}
          >
            Sign in
          </Link>
        )}
      </div>
      <MobileMenu user={user} side={side} />
    </>
  );
}

/**
 * Full-screen menu below lg. The top row repeats the nav (logo left, close
 * button where the hamburger was) so nothing jumps when it opens; links sit
 * under it and the account actions are pinned to the bottom.
 */
function MobileMenu({ user, side }: { user: PublicUser | null; side: LandingSide }) {
  const [open, setOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const signOut = useSignOut(side);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const opener = openButtonRef.current;
    closeButtonRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={openButtonRef}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="landing-menu"
        onClick={() => setOpen(true)}
        className={cn("relative flex size-11 items-center justify-center rounded-full border border-black/22 bg-white/40 text-ink backdrop-blur-[15px] hover:bg-white/70", focus)}
      >
        <Menu aria-hidden className="size-5" strokeWidth={1.6} />
        {user ? (
          <span className="absolute -top-1 -right-1 rounded-full ring-2 ring-canvas">
            <Avatar user={user} size={18} textClass="text-[8px]" />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="landing-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex h-dvh flex-col overflow-y-auto bg-canvas/90 backdrop-blur-[24px]"
        >
          {/* Same colour bands as the mobile hero, so the menu feels like part of the page. */}
          <MobileGlow edge="top" className="h-[40%]" strength={0.8} palette={side} />
          <MobileGlow edge="bottom" className="h-[28%]" strength={0.8} palette={side} />

          <div className="relative flex items-center px-4 py-5 sm:px-12">
            <Link href={side === "seller" ? "/sell" : "/"} onClick={close} aria-label="Muhrak home" className={cn("flex rounded-sm", focus)}>
              <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={156.357} height={29.8588} />
            </Link>
            <div className="flex-1" />
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close menu"
              onClick={close}
              className={cn("flex size-11 items-center justify-center rounded-full border border-black/22 bg-white/60 text-ink hover:bg-white", focus)}
            >
              <X aria-hidden className="size-5" strokeWidth={1.6} />
            </button>
          </div>

          <div className="relative flex flex-1 flex-col px-4 pt-6 pb-8 sm:px-12">
            {user ? (
              <Link
                href={HOME_PATH[side]}
                onClick={close}
                className={cn("mb-8 flex items-center gap-3 rounded-[18px] border border-black/10 bg-linear-to-b from-white/78 to-white/50 p-4 hover:from-white", focus)}
              >
                <Avatar user={user} size={44} textClass="text-sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.3]">
                  <span className="truncate text-base text-ink">{user.fullName}</span>
                  <span className="text-[13px] text-ink-tertiary">Go to your dashboard</span>
                </span>
                <Chevron className="-rotate-90" />
              </Link>
            ) : null}

            <p className="px-1 text-[11px] leading-[1.3] tracking-[0.06em] text-ink-tertiary">MENU</p>
            <nav aria-label="Main" className="mt-2 flex flex-col">
              {(side === "seller" ? SELLER_NAV_LINKS : NAV_LINKS).map((link) => {
                const row = "flex items-center justify-between border-b border-black/8 px-1 py-4 text-[28px] leading-[1.2] tracking-[-0.02em]";
                return link.href ? (
                  <a key={link.label} href={link.href} onClick={close} className={cn(row, "text-ink hover:text-ink-secondary", focus)}>
                    {link.label}
                    <Chevron className="size-5 -rotate-90 opacity-60" />
                  </a>
                ) : (
                  <span key={link.label} className={cn(row, "text-ink-tertiary")}>
                    {link.label}
                    <span className="text-xs tracking-normal">Soon</span>
                  </span>
                );
              })}
            </nav>

            <div className="mt-auto flex items-center gap-2.5 pt-10">
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void signOut();
                  }}
                  className={cn("h-[50px] flex-1 rounded-full border border-black/22 text-[15px] leading-[1.3] text-ink hover:bg-black/4", focus)}
                >
                  Log out
                </button>
              ) : (
                <Link
                  href={LOGIN_PATH[side]}
                  onClick={close}
                  className={cn("flex h-[50px] flex-1 items-center justify-center rounded-full bg-ink text-[15px] leading-[1.3] font-medium text-white hover:opacity-90", focus)}
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
