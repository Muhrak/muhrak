import type { Metadata } from "next";
import { SellersPage } from "@/features/admin/sellers/sellers-page";

export const instant = false;
export const metadata: Metadata = { title: "Sellers · Muhrak Admin Console" };

export default function AdminSellersPage() {
  return <SellersPage />;
}
