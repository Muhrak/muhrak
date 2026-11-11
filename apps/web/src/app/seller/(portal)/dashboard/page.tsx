import type { Metadata } from "next";
import { SellerDashboard } from "@/components/dashboard/seller-dashboard";

export const metadata: Metadata = { title: "Dashboard · Muhrak Seller Centre" };

export default function SellerDashboardPage() {
  return <SellerDashboard />;
}
