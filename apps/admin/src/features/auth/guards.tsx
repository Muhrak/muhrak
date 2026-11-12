"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "./session";

const noop = () => () => {};
/** False during the server render and hydration, true after: the session lives in the browser only. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Only pages the console really has can be a `next` target (no open redirects). */
export function safeNext(next: string | null): string {
  return next && /^\/sellers(\/[0-9a-f-]{36})?$/i.test(next) ? next : "/sellers";
}

function Loading() {
  return (
    <div role="status" className="flex min-h-dvh flex-1 items-center justify-center text-sm text-text-muted">
      Loading…
    </div>
  );
}

/** Console pages: a signed-in admin only. Everyone else goes to the login page. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (mounted && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [mounted, session, router, pathname]);
  if (!mounted || !session) return <Loading />;
  return children;
}

/** The login page: a signed-in admin is sent on instead of seeing the form. */
export function SignedOutOnly({ next, children }: { next: string; children: ReactNode }) {
  const mounted = useMounted();
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (mounted && session) router.replace(next);
  }, [mounted, session, router, next]);
  if (!mounted || session) return <Loading />;
  return children;
}
