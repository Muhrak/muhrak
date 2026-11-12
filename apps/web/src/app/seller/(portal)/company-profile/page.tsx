import type { Metadata } from "next";
import { CompanyProfile } from "@/features/seller/company-profile";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Company profile · Muhrak Seller Centre" };

export default function SellerCompanyProfilePage() {
  return <CompanyProfile />;
}
