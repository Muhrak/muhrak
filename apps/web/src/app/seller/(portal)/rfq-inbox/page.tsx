import type { Metadata } from "next";
import { Suspense } from "react";
import { SellerInboxPage } from "@/features/rfq/seller-inbox-page";

export const metadata: Metadata = { title: "RFQ Inbox · Muhrak Seller Centre" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SellerInboxPage />
    </Suspense>
  );
}
