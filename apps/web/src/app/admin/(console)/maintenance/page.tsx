import type { Metadata } from "next";
import { MaintenancePage } from "@/features/admin/maintenance/maintenance-page";

export const metadata: Metadata = { title: "Maintenance Mode · Muhrak Admin Console" };

export default function AdminMaintenancePage() {
  return <MaintenancePage />;
}
