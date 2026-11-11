import type { Metadata } from "next";
import { SellerDashboard } from "@/components/dashboard/seller-dashboard";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Dashboard · Muhrak Seller Centre" };

export default function SellerDashboardPage() {
  return <SellerDashboard />;
}
