import { Suspense } from "react";
import { PortalLoading, PortalShell } from "@/components/layout/portal-shell";
import { RequireRole } from "@/features/auth/guards";

/** Seller Centre: only signed-in sellers get past the guard; others are redirected. */
export default function SellerPortalLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<PortalLoading />}>
      <RequireRole role="seller" fallback={<PortalLoading />}>
        <PortalShell side="seller">{children}</PortalShell>
      </RequireRole>
    </Suspense>
  );
}
