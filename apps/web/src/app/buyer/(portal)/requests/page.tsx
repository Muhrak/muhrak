import type { Metadata } from "next";
import { Suspense } from "react";
import { BuyerRequestsPage } from "@/features/rfq/buyer-requests-page";

export const metadata: Metadata = { title: "Inquiries & RFQs · Muhrak Buyer Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BuyerRequestsPage />
    </Suspense>
  );
}
