import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase-admin";

// ─── GET /api/groups/[id]/join-requests ──────────────────────────────────────
// Returns pending join requests for a group (creator only).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "").trim();
  if (!idToken) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  try {
    const { db, adminAuth } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const groupSnap = await db.collection("groups").doc(id).get();
    if (!groupSnap.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    if (groupSnap.data()!.createdBy !== decoded.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snap = await db
      .collection("group_join_requests")
      .where("groupId", "==", id)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .get();

    const requests = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        groupId: d.groupId,
        requesterId: d.requesterId,
        requesterName: d.requesterName ?? "Unknown",
        requesterUsername: d.requesterUsername ?? "",
        status: d.status,
        via: d.via ?? "qr",
        createdAt: d.createdAt?.toDate?.().toISOString() ?? null,
      };
    });

    return NextResponse.json({ requests });
  } catch (err) {
    console.error("[groups/join-requests GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
