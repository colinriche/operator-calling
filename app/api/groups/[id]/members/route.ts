import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string }> };

// POST /api/groups/[id]/members — invite a user by username (creator only)
export async function POST(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const { db } = getAdminServices();

  const groupSnap = await db.collection("groups").doc(id).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (groupSnap.data()!.createdBy !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const username = body.username?.trim().toLowerCase();
  if (!username) return NextResponse.json({ error: "Username required" }, { status: 400 });

  // Look up user by username
  const userQuery = await db.collection("user").where("username", "==", username).limit(1).get();
  if (userQuery.empty) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const inviteeDoc = userQuery.docs[0];
  const inviteeId = inviteeDoc.id;
  const inviteeData = inviteeDoc.data();
  const inviteeName = inviteeData.displayName ?? inviteeData.name ?? username;

  // Check not already a member
  const memberIds: string[] = groupSnap.data()!.memberIds ?? [];
  if (memberIds.includes(inviteeId)) {
    return NextResponse.json({ error: "Already a member" }, { status: 409 });
  }

  // Check no pending invite already exists
  const existing = await db
    .collection("group_invites")
    .where("groupId", "==", id)
    .where("inviteeId", "==", inviteeId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!existing.empty) {
    return NextResponse.json({ error: "Invite already pending" }, { status: 409 });
  }

  await db.collection("group_invites").add({
    groupId: id,
    groupName: groupSnap.data()!.name,
    inviterId: uid,
    inviteeId,
    inviteeName,
    inviteeUsername: username,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, inviteeName });
}
