import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string; uid: string }> };

// PATCH /api/groups/[id]/members/[uid] — update member role (creator only)
// Body: { role: "member" | "moderator" }
export async function PATCH(req: NextRequest, { params }: Params) {
  const callerId = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!callerId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id, uid } = await params;
  const { db } = getAdminServices();

  const groupSnap = await db.collection("groups").doc(id).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (groupSnap.data()!.createdBy !== callerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!["member", "moderator"].includes(body.role ?? "")) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await db.collection("groups").doc(id).update({
    [`members.${uid}.role`]: body.role,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/groups/[id]/members/[uid] — remove a member (creator only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const callerId = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!callerId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id, uid } = await params;
  const { db } = getAdminServices();

  const groupSnap = await db.collection("groups").doc(id).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = groupSnap.data()!;
  if (data.createdBy !== callerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (uid === data.createdBy) {
    return NextResponse.json({ error: "Cannot remove the group creator" }, { status: 400 });
  }

  await db.collection("groups").doc(id).update({
    memberIds: FieldValue.arrayRemove(uid),
    [`members.${uid}`]: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
