import type { Metadata } from "next";
import { Suspense } from "react";
import { SellersDirectory } from "@/features/storefront/sellers-directory";

export const metadata: Metadata = {
  title: "Sellers · Muhrak",
  description: "Verified spare parts sellers across the GCC: manufacturers, distributors and parts suppliers.",
};

export default function SellersPage() {
  return (
    <Suspense fallback={null}>
      <SellersDirectory />
    </Suspense>
  );
}
