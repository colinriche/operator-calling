import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminServices } from "@/lib/firebase-admin";
import { DELETION_REQUESTS, toDeletionRequestView } from "@/lib/account-deletion";

// GET /api/admin/deletion-requests - super admin only. Read-only: processing a
// request is done by hand, and nothing is ever deleted from here.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireAdmin(req, { superAdminOnly: true });
    if (!caller) {
      return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
    }

    const snap = await getAdminServices()
      .db.collection(DELETION_REQUESTS)
      .orderBy("requestedAt", "desc")
      .limit(200)
      .get();

    return NextResponse.json({
      requests: snap.docs.map((d) => toDeletionRequestView(d.id, d.data())),
    });
  } catch (err) {
    console.error("[admin/deletion-requests]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
