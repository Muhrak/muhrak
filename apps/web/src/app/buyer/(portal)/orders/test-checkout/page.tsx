import type { Metadata } from "next";
import { Suspense } from "react";
import { TestCheckoutPage } from "@/features/order/test-checkout-page";

export const metadata: Metadata = { title: "Test checkout · Muhrak" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TestCheckoutPage />
    </Suspense>
  );
}
