import type { Metadata } from "next";
import { CompanyProfile } from "@/features/seller/company-profile";

export const metadata: Metadata = { title: "Company profile · Muhrak Seller Centre" };

export default function SellerCompanyProfilePage() {
  return <CompanyProfile />;
}
