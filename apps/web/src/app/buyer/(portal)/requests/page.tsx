import type { Metadata } from "next";
import { Suspense } from "react";
import { BuyerRequestsPage } from "@/features/rfq/buyer-requests-page";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Inquiries & RFQs · Muhrak Buyer Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BuyerRequestsPage />
    </Suspense>
  );
}
