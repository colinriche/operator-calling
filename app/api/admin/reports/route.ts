import { NextRequest, NextResponse } from "next/server";
import { checkModerator } from "@/lib/admin-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { loadAllReports } from "@/lib/moderation-server";
import {
  countReports,
  filterReports,
  isStatusFilter,
  previousReportCounts,
  type StatusFilter,
} from "@/lib/moderation-model";

// GET /api/admin/reports?status=new|reviewing|resolved|all
//
// The moderation queue. Returns the rows for the chosen filter plus the counts
// for every filter, so the tabs and the nav badge ("Reports (4)" = unresolved)
// come from one request. Opening the queue never changes a report's status.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await checkModerator(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const caller = gate.caller;

  const requested = req.nextUrl.searchParams.get("status") ?? "all";
  const filter: StatusFilter = isStatusFilter(requested) ? requested : "all";

  try {
    const all = await loadAllReports(getAdminDb());
    const previous = previousReportCounts(all);
    const rows = filterReports(all, filter).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      reported: r.reported,
      reporter: r.reporter,
      reasonLabel: r.reasonLabel,
      callType: r.callType,
      previousReports: previous.get(r.id) ?? 0,
      status: r.status,
      outcome: r.outcome,
      legacy: r.legacy,
    }));
    return NextResponse.json({ reports: rows, counts: countReports(all) });
  } catch (err) {
    console.error("[admin/reports GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
