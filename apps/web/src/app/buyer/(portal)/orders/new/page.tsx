import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmOrderPage } from "@/features/order/confirm-order-page";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Confirm order · Muhrak Buyer Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConfirmOrderPage />
    </Suspense>
  );
}
