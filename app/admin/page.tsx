import type { Metadata } from "next";
import { GroupAdminDashboard } from "@/components/admin/GroupAdminDashboard";

export const metadata: Metadata = { title: "Group admin" };

export default function AdminPage() {
  return <GroupAdminDashboard />;
}
