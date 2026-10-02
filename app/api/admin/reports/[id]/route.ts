import { NextRequest, NextResponse } from "next/server";
import { requireModerator } from "@/lib/admin-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { getReportDetail, ModerationRefusal, performReportAction } from "@/lib/moderation-server";

// GET  /api/admin/reports/[id]  - the report, the reported account's history,
//                                 both parties' identifiers and whether the pair
//                                 is already blocked. Read-only: viewing a report
//                                 does not start a review.
// POST /api/admin/reports/[id]  - an action: start_review | dismiss | warn |
//                                 suspend | ban | disable_auto_calls | note.
//                                 Every one is recorded with who, when and why.

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const caller = await requireModerator(req);
  if (!caller) {
    return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const detail = await getReportDetail(getAdminDb(), id);
    if (!detail) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    console.error("[admin/reports/[id] GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const caller = await requireModerator(req);
  if (!caller) {
    return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const report = await performReportAction(
      getAdminDb(),
      id,
      { uid: caller.uid, email: caller.email, name: caller.name },
      body
    );
    console.log(
      `[admin/reports] ${caller.email} ${(body as { action?: string })?.action} on report ${id} -> ${report.status}`
    );
    return NextResponse.json({ success: true, report });
  } catch (err) {
    if (err instanceof ModerationRefusal) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/reports/[id] POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
