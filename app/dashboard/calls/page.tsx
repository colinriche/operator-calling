import type { Metadata } from "next";
import { Suspense } from "react";
import { CallsPageContent } from "@/components/dashboard/CallsPageContent";

export const metadata: Metadata = { title: "Calls" };
export const dynamic = "force-dynamic";

export default function CallsPage() {
  return (
    <Suspense fallback={null}>
      <CallsPageContent />
    </Suspense>
  );
}
