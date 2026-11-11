import type { Metadata } from "next";
import { BuyerDashboard } from "@/components/dashboard/buyer-dashboard";

// Browser-only page inside the signed-in centre (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Dashboard · Muhrak Buyer Centre" };

export default function BuyerDashboardPage() {
  return <BuyerDashboard />;
}
