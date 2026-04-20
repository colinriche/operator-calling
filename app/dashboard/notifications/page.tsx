import type { Metadata } from "next";
import { NotificationsPageContent } from "@/components/dashboard/NotificationsPageContent";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <NotificationsPageContent />;
}
