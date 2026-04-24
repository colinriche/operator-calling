import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationsPageContent } from "@/components/dashboard/NotificationsPageContent";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsPageContent />
    </Suspense>
  );
}
