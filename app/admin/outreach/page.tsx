import type { Metadata } from "next";
import { OutreachSourcesPanel } from "@/components/admin/OutreachSourcesPanel";

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
      <div className="mb-8">
        <h1 className="font-heading font-bold text-3xl text-foreground mb-1">
          Outreach
        </h1>
        <p className="text-muted-foreground">
          Track where waitlist links are posted and how much demand each one
          produces. Adding a source here does not create a group.
        </p>
      </div>

      <OutreachSourcesPanel />
    </div>
  );
}
