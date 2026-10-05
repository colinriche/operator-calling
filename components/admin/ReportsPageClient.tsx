"use client";

import { useState } from "react";
import { ReportsQueue } from "@/components/admin/ReportsQueue";
import type { QueueCounts } from "@/lib/moderation-model";

export function ReportsPageClient() {
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading font-bold text-3xl text-foreground mb-1">
          Reports{counts ? ` (${counts.unresolved})` : ""}
        </h1>
        <p className="text-muted-foreground">
          Reports from the app. New → Reviewing → Resolved. Opening a report does not change its status.
        </p>
      </div>
      <ReportsQueue onCounts={setCounts} />
    </div>
  );
}
