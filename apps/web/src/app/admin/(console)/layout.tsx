import { Suspense } from "react";
import { PortalLoading } from "@/components/layout/portal-shell";
import { ConsoleShell } from "@/features/admin/shell";
import { RequireRole } from "@/features/auth/guards";

// The console renders in the browser only (the session is read there).
export const instant = false;

/**
 * Every console page needs a user signed in on the admin side; a buyer or
 * seller session in the same browser counts for nothing. The API checks
 * the admin role again on every call.
 */
export default function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<PortalLoading />}>
      <RequireRole role="admin" fallback={<PortalLoading />}>
        <ConsoleShell>{children}</ConsoleShell>
      </RequireRole>
    </Suspense>
  );
}
