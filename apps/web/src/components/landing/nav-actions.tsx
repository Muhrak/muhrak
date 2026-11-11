"use client";

import Image from "next/image";
import Link from "next/link";
import { use, type CSSProperties } from "react";
import { browser } from "react-dom";
import { HOME_PATH, LOGIN_PATH } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { initials, shortName } from "@/features/auth/user-display";
import { cn } from "@/lib/utils";

/**
 * Right side of the landing page nav.
 * - Signed out: Figma "Buyer – Landing v2 (Light)" › Nav › Actions
 *   (theme toggle, outline button, "Find a part").
 * - Signed in: Figma "Buyer – Landing v2 (Signed in)" › Nav › Actions
 *   ("Find a part" + profile button), in the light colours. The profile
 *   button opens the user's dashboard.
 */

const FIND_A_PART = "/buyer/find-part";
const focus = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function FindAPart() {
  return (
    <Link href={FIND_A_PART} className={cn("rounded-full bg-ink px-6 py-3 text-sm leading-[1.3] font-medium whitespace-nowrap text-white hover:opacity-90", focus)}>
      Find a part
    </Link>
  );
}

/** What the server renders, and what a visitor without a session sees. */
export function SignedOutActions() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Dark theme is not built yet (light first); the toggle is shown as designed. */}
      <button
        type="button"
        aria-label="Dark theme (coming soon)"
        title="Dark theme coming soon"
        className={cn("hidden size-11 items-center justify-center rounded-full border border-black/22 hover:bg-black/4 sm:flex", focus)}
      >
        <Image src="/landing/moon.svg" alt="" width={18} height={18} />
      </button>
      <Link
        href={LOGIN_PATH.buyer}
        className={cn("rounded-full border border-black/22 px-[22px] py-3 text-sm leading-[1.3] whitespace-nowrap text-ink hover:bg-black/4", focus)}
      >
        Sign in
      </Link>
      <FindAPart />
    </div>
  );
}

/** Reads the stored session, so it renders in the browser only; wrap in <Suspense fallback={<SignedOutActions />}>. */
export function NavActions() {
  use(browser("The session is stored in localStorage."));
  const session = useSession();
  if (!session) return <SignedOutActions />;

  const { user } = session;
  return (
    <div className="flex items-center gap-2.5">
      <FindAPart />
      <Link
        href={HOME_PATH[user.role]}
        aria-label={`${user.fullName}: open your dashboard`}
        className={cn("flex items-center gap-2 rounded-full border border-black/22 py-1 pr-1 pl-1 hover:bg-black/4 sm:pr-3.5", focus)}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-[34px] shrink-0 items-center justify-center rounded-full text-xs leading-[1.3] font-semibold text-white",
            user.role === "seller" ? "bg-seller-orange" : "bg-[linear-gradient(135deg,#f4a27c_0%,#e0457f_28.571%,#7b2fd3_71.429%)]",
          )}
        >
          {initials(user.fullName)}
        </span>
        <span className="hidden max-w-[140px] truncate text-sm leading-[1.3] text-ink sm:block">{shortName(user.fullName)}</span>
        <span
          aria-hidden
          className="icon-mask hidden size-3.5 text-ink sm:inline-block"
          style={{ "--icon": "url(/landing/profile-chevron.svg)" } as CSSProperties}
        />
      </Link>
    </div>
  );
}
