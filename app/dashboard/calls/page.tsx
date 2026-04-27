import type { Metadata } from "next";
import { CallsPageContent } from "@/components/dashboard/CallsPageContent";

export const metadata: Metadata = { title: "Calls" };

export default function CallsPage() {
  return <CallsPageContent />;
}
