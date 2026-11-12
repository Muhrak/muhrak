"use client";

import { useRouter } from "next/navigation";
import { Suspense, use, useEffect, type ReactNode } from "react";
import { browser } from "react-dom";
import { afterLoginPath, LOGIN_PATH, type PortalSide } from "./paths";
import { useSession } from "./session";

/**
 * Route guards. Both read the session from localStorage, so they render only
 * in the browser (`use(browser())`); wrap them in <Suspense> with a loading
 * fallback. The API still checks every request; these only decide which
 * page the user sees.
 *
 * STRICT RULE: buyer and seller are fully separate. Each guard looks only at
 * its own side's session; being signed in on the other side counts for
 * nothing here.
 */

/**
 * Show `children` only to a user signed in on `role`'s side. Otherwise go to
 * this side's login page, then come back here.
 */
export function RequireRole({ role, children, fallback }: { role: PortalSide; children: ReactNode; fallback: ReactNode }) {
  use(browser("The session is stored in localStorage."));
  const session = useSession(role);
  const router = useRouter();
  const allowed = session?.user.role === role;

  useEffect(() => {
    if (!allowed) {
      const here = window.location.pathname + window.location.search;
      router.replace(`${LOGIN_PATH[role]}?next=${encodeURIComponent(here)}`);
    }
  }, [allowed, role, router]);

  return allowed ? children : fallback;
}

/**
 * Login and sign-up forms of `side`: shown only to users not signed in on
 * that side (the other side's session does not matter). A signed-in user
 * (typed the URL, followed a link, pressed Back) never sees the form; they
 * get a short "taking you to your account" line and go where they belong.
 *
 * The form is prerendered but invisible (keeping its height, so nothing
 * jumps) until the browser has read the session.
 */
export function SignedOutOnly({ side, children }: { side: PortalSide; children: ReactNode }) {
  return (
    <Suspense fallback={<HiddenForm>{children}</HiddenForm>}>
      <SignedOutGate side={side}>{children}</SignedOutGate>
    </Suspense>
  );
}

function SignedOutGate({ side, children }: { side: PortalSide; children: ReactNode }) {
  use(browser("The session is stored in localStorage."));
  const session = useSession(side);
  const router = useRouter();

  useEffect(() => {
    if (session) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(afterLoginPath(side, next));
    }
  }, [session, side, router]);

  if (!session) return children;
  const status = (
    <p role="status" className="absolute inset-0 flex items-center justify-center text-center text-sm text-ink-tertiary">
      You’re signed in. Taking you to your account…
    </p>
  );
  return <HiddenForm overlay={status}>{children}</HiddenForm>;
}

function HiddenForm({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className="relative">
      {/* Inline style, not a class: hidden even before the stylesheet loads. */}
      <div style={{ visibility: "hidden" }} inert aria-hidden>
        {children}
      </div>
      {overlay}
    </div>
  );
}
