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
import { NAV_LINKS } from "./nav-links";

/**
 * Right side of the landing page nav.
 * - Desktop (lg+), signed out: Figma "Buyer – Landing v2 (Light)" › Nav › Actions.
 * - Desktop, signed in: Figma "Buyer – Landing v2 (Signed in)" › Nav › Actions
 *   in light colours; the profile button opens the user's dashboard.
 * - Below lg: one hamburger button opening a panel (same glass style as the
 *   page's cards) with every link and action, including the profile.
 */

const FIND_A_PART = "/buyer/find-part";
const focus = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const avatarClass = (user: PublicUser) =>
  user.role === "seller" ? "bg-seller-orange" : "bg-[linear-gradient(135deg,#f4a27c_0%,#e0457f_28.571%,#7b2fd3_71.429%)]";

function Avatar({ user, size }: { user: PublicUser; size: number }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full text-xs leading-[1.3] font-semibold text-white", avatarClass(user))}
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

function FindAPart({ className }: { className?: string }) {
  return (
    <Link
      href={FIND_A_PART}
      className={cn("rounded-full bg-ink px-6 py-3 text-center text-sm leading-[1.3] font-medium whitespace-nowrap text-white hover:opacity-90", focus, className)}
    >
      Find a part
    </Link>
  );
}

function ThemeToggle({ className }: { className?: string }) {
  // Dark theme is not built yet (light first); the toggle is shown as designed.
  return (
    <button
      type="button"
      aria-label="Dark theme (coming soon)"
      title="Dark theme coming soon"
      className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border border-black/22 hover:bg-black/4", focus, className)}
    >
      <Image src="/landing/moon.svg" alt="" width={18} height={18} />
    </button>
  );
}

/** Desktop actions + mobile menu for a visitor (server render and signed-out state). */
export function SignedOutActions() {
  return <Actions user={null} />;
}

/** Reads the stored session, so it renders in the browser only; wrap in <Suspense fallback={<SignedOutActions />}>. */
export function NavActions() {
  use(browser("The session is stored in localStorage."));
  const session = useSession();
  return <Actions user={session?.user ?? null} />;
}

function Actions({ user }: { user: PublicUser | null }) {
  return (
    <>
      <div className="hidden items-center gap-2.5 lg:flex">
        {user ? (
          <>
            <FindAPart />
            <Link
              href={HOME_PATH[user.role]}
              aria-label={`${user.fullName}: open your dashboard`}
              className={cn("flex items-center gap-2 rounded-full border border-black/22 py-1 pr-3.5 pl-1 hover:bg-black/4", focus)}
            >
              <Avatar user={user} size={34} />
              <span className="max-w-[140px] truncate text-sm leading-[1.3] text-ink">{shortName(user.fullName)}</span>
              <Chevron />
            </Link>
          </>
        ) : (
          <>
            <ThemeToggle />
            <Link href={LOGIN_PATH.buyer} className={cn("rounded-full border border-black/22 px-[22px] py-3 text-sm leading-[1.3] whitespace-nowrap text-ink hover:bg-black/4", focus)}>
              Sign in
            </Link>
            <FindAPart />
          </>
        )}
      </div>
      <MobileMenu user={user} />
    </>
  );
}

function MobileMenu({ user }: { user: PublicUser | null }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const signOut = useSignOut();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="landing-menu"
        onClick={() => setOpen((value) => !value)}
        className={cn("relative flex size-11 items-center justify-center rounded-full border border-black/22 bg-white/40 text-ink backdrop-blur-[15px] hover:bg-white/70", focus)}
      >
        {open ? <X aria-hidden className="size-5" strokeWidth={1.6} /> : <Menu aria-hidden className="size-5" strokeWidth={1.6} />}
        {user && !open ? (
          <span className="absolute -top-1 -right-1 rounded-full ring-2 ring-canvas">
            <Avatar user={user} size={18} />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="landing-menu"
          ref={panelRef}
          className="absolute inset-x-4 top-[76px] z-30 flex flex-col gap-4 rounded-[18px] border border-black/10 bg-linear-to-b from-white/92 to-white/80 p-4 shadow-[0_24px_60px_-20px_rgba(10,11,18,0.35)] backdrop-blur-[15px] sm:left-auto sm:w-[360px]"
        >
          {user ? (
            <Link
              href={HOME_PATH[user.role]}
              onClick={close}
              className={cn("flex items-center gap-3 rounded-[14px] border border-black/9 bg-black/4 p-3 hover:bg-black/6", focus)}
            >
              <Avatar user={user} size={40} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.3]">
                <span className="truncate text-[15px] text-ink">{user.fullName}</span>
                <span className="text-[13px] text-ink-tertiary">Go to your dashboard</span>
              </span>
              <Chevron className="-rotate-90" />
            </Link>
          ) : null}

          <nav aria-label="Main" className="flex flex-col">
            {NAV_LINKS.map((link) =>
              link.href ? (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={close}
                  className={cn("rounded-[10px] px-3 py-3 text-[15px] leading-[1.3] text-[rgba(10,11,18,0.78)] hover:bg-black/4 hover:text-ink", focus)}
                >
                  {link.label}
                </a>
              ) : (
                <span key={link.label} className="px-3 py-3 text-[15px] leading-[1.3] text-[rgba(10,11,18,0.78)]">
                  {link.label}
                </span>
              ),
            )}
          </nav>

          <div className="h-px bg-black/8" />

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            {user ? (
              <button
                type="button"
                onClick={() => {
                  close();
                  void signOut(user.role);
                }}
                className={cn("flex-1 rounded-full border border-black/22 px-[22px] py-3 text-sm leading-[1.3] text-ink hover:bg-black/4", focus)}
              >
                Log out
              </button>
            ) : (
              <Link
                href={LOGIN_PATH.buyer}
                onClick={close}
                className={cn("flex-1 rounded-full border border-black/22 px-[22px] py-3 text-center text-sm leading-[1.3] text-ink hover:bg-black/4", focus)}
              >
                Sign in
              </Link>
            )}
          </div>
          <FindAPart className="w-full py-3.5" />
        </div>
      ) : null}
    </div>
  );
}
