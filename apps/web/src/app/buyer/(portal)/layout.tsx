import { Suspense } from "react";
import { PortalLoading, PortalShell } from "@/components/layout/portal-shell";
import { RequireRole } from "@/features/auth/guards";

/** Buyer Centre: only signed-in buyers get past the guard; others are redirected. */
export default function BuyerPortalLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<PortalLoading />}>
      <RequireRole role="buyer" fallback={<PortalLoading />}>
        <PortalShell side="buyer">{children}</PortalShell>
      </RequireRole>
    </Suspense>
  );
}
