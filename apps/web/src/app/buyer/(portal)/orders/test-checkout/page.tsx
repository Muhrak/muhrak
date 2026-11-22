import type { Metadata } from "next";
import { Suspense } from "react";
import { TestCheckoutPage } from "@/features/order/test-checkout-page";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Test checkout · Muhrak" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TestCheckoutPage />
    </Suspense>
  );
}
