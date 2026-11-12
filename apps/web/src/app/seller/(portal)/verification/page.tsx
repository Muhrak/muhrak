import type { Metadata } from "next";
import { Verification } from "@/features/seller/verification";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Verification · Muhrak Seller Centre" };

export default function SellerVerificationPage() {
  return <Verification />;
}
