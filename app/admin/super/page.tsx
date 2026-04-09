import type { Metadata } from "next";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";

export const metadata: Metadata = { title: "Super admin" };

export default function SuperAdminPage() {
  return <SuperAdminDashboard />;
}
