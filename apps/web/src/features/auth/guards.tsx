"use client";

import type { Role } from "@muhrak/schemas";
import { useRouter } from "next/navigation";
import { use, useEffect, type ReactNode } from "react";
import { browser } from "react-dom";
import { afterLoginPath, HOME_PATH, LOGIN_PATH, type PortalSide } from "./paths";
import { useSession } from "./session";

/**
 * Route guards. Both read the session from localStorage, so they render only
 * in the browser (`use(browser())`); wrap them in <Suspense> with a loading
 * fallback. The API still checks every request; these only decide which
 * page the user sees.
 */

/**
 * Show `children` only to a signed-in user with `role`.
 * - Not signed in: go to this side's login page, then come back here.
 * - Signed in with another role: go to that role's own dashboard.
 */
export function RequireRole({ role, children, fallback }: { role: PortalSide; children: ReactNode; fallback: ReactNode }) {
  use(browser("The session is stored in localStorage."));
  const session = useSession();
  const router = useRouter();
  const allowed = session?.user.role === role;

  useEffect(() => {
    if (!session) {
      const here = window.location.pathname + window.location.search;
      router.replace(`${LOGIN_PATH[role]}?next=${encodeURIComponent(here)}`);
    } else if (session.user.role !== role) {
      router.replace(HOME_PATH[session.user.role]);
    }
  }, [session, role, router]);

  return allowed ? children : fallback;
}

/**
 * On login and sign-up pages: a user who is already signed in goes straight
 * to where they belong. Renders nothing; place it next to the form inside
 * `<Suspense fallback={null}>` so the form itself still prerenders.
 */
export function RedirectIfSignedIn() {
  use(browser("The session is stored in localStorage."));
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(afterLoginPath(session.user.role as Role, next));
    }
  }, [session, router]);

  return null;
}
