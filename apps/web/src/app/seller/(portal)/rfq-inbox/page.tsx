import type { Metadata } from "next";
import { Suspense } from "react";
import { SellerInboxPage } from "@/features/rfq/seller-inbox-page";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "RFQ Inbox · Muhrak Seller Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SellerInboxPage />
    </Suspense>
  );
}
