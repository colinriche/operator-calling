import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminServices } from "@/lib/firebase-admin";
import { DELETION_REQUESTS, toAdminDeletionRequestView } from "@/lib/account-deletion";

// GET /api/admin/deletion-requests - super admin only. Read-only. Reviewing a
// request (delete the account / decline) is POST /api/admin/deletion-requests/[id].

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
      requests: snap.docs.map((d) => toAdminDeletionRequestView(d.id, d.data())),
    });
  } catch (err) {
    console.error("[admin/deletion-requests]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
