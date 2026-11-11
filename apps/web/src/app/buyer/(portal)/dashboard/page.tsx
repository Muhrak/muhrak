import type { Metadata } from "next";
import { BuyerDashboard } from "@/components/dashboard/buyer-dashboard";

export const metadata: Metadata = { title: "Dashboard · Muhrak Buyer Centre" };

export default function BuyerDashboardPage() {
  return <BuyerDashboard />;
}
