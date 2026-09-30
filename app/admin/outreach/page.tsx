import type { Metadata } from "next";
import { OutreachSections } from "@/components/admin/OutreachSections";

// Standalone route for the outreach panel.
//
// The same panel also appears as a tab inside SuperAdminDashboard, but that
// dashboard does its own client-SDK Firestore reads on mount and fails for some
// admins. This page renders the panel on its own so outreach work does not
// depend on that being fixed first.

export const metadata: Metadata = { title: "Outreach" };

export default function AdminOutreachPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <OutreachSections />
    </div>
  );
}
