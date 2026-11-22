import type { Metadata } from "next";
import { Verification } from "@/features/seller/verification";

export const metadata: Metadata = { title: "Verification · Muhrak Seller Centre" };

export default function SellerVerificationPage() {
  return <Verification />;
}
