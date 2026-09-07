import type { Metadata } from "next";
import { DemandSourceSpreadsheet } from "@/components/admin/DemandSourceSpreadsheet";

// A second view of the demand sources the outreach page manages — the same
// records, the same API routes, the same validation. Built for editing forty of
// them rather than one, which the card layout on /admin/outreach is not.
//
// Full width on purpose: the grid is wider than the 5xl the outreach page uses,
// and constraining it would put a scrollbar inside a scrollbar.

export const metadata: Metadata = { title: "Outreach spreadsheet" };

export default function AdminOutreachSpreadsheetPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading font-bold text-3xl text-foreground mb-1">
          Outreach sources
        </h1>
        <p className="text-muted-foreground">
          Every demand source in one grid. Edits save to the record as you make
          them — this is the same data as the outreach page, not a copy of it.
          Removing a source means archiving it, which keeps its registrations,
          tracked links and history.
        </p>
      </div>

      <DemandSourceSpreadsheet />
    </div>
  );
}
