import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";

// ─── PATCH /api/groups/[id]/join-requests/[requestId] ────────────────────────
// Body: { action: "approve" | "deny" }
// Creator only.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id, requestId } = await params;
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "").trim();
  if (!idToken) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: { action?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action } = body;
  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "action must be approve or deny" }, { status: 400 });
  }

  try {
    const { db, adminAuth } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const [groupSnap, requestSnap] = await Promise.all([
      db.collection("groups").doc(id).get(),
      db.collection("group_join_requests").doc(requestId).get(),
    ]);

    if (!groupSnap.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    if (!requestSnap.exists) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    if (groupSnap.data()!.createdBy !== decoded.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requestData = requestSnap.data()!;
    if (requestData.groupId !== id) {
      return NextResponse.json({ error: "Request does not belong to this group" }, { status: 400 });
    }
    if (requestData.status !== "pending") {
      return NextResponse.json({ error: "Request already resolved" }, { status: 409 });
    }

    const batch = db.batch();

    batch.update(db.collection("group_join_requests").doc(requestId), {
      status: action === "approve" ? "approved" : "denied",
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: decoded.uid,
    });

    if (action === "approve") {
      const requesterId = requestData.requesterId;
      // Look up requester's profile for name/username
      let displayName = requestData.requesterName ?? "Unknown";
      let username = requestData.requesterUsername ?? "";

      batch.update(db.collection("groups").doc(id), {
        memberIds: FieldValue.arrayUnion(requesterId),
        [`members.${requesterId}`]: {
          name: displayName,
          username,
          joinedAt: FieldValue.serverTimestamp(),
          via: "join_request",
        },
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[groups/join-requests PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
