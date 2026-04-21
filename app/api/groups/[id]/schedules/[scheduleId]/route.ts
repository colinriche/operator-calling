import { NextRequest, NextResponse } from "next/server";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string; scheduleId: string }> };

// DELETE /api/groups/[id]/schedules/[scheduleId] — cancel a scheduled call (creator only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id, scheduleId } = await params;
  const { db } = getAdminServices();

  const groupSnap = await db.collection("groups").doc(id).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (groupSnap.data()!.createdBy !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schedSnap = await db.collection("scheduledGroupCalls").doc(scheduleId).get();
  if (!schedSnap.exists || schedSnap.data()!.groupId !== id) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  await db.collection("scheduledGroupCalls").doc(scheduleId).delete();
  return NextResponse.json({ success: true });
}
