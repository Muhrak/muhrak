import type { Metadata } from "next";
import { SellersPage } from "@/features/sellers/sellers-page";

export const metadata: Metadata = { title: "Sellers · Muhrak Admin Console" };

export default function AdminSellersPage() {
  return <SellersPage />;
}
