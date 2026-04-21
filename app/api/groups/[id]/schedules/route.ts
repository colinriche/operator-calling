import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string }> };

// GET /api/groups/[id]/schedules — list upcoming scheduled calls for this group
export async function GET(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const { db } = getAdminServices();

  const groupSnap = await db.collection("groups").doc(id).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!groupSnap.data()!.memberIds?.includes(uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const snap = await db
    .collection("scheduledGroupCalls")
    .where("groupId", "==", id)
    .where("scheduledAt", ">=", now)
    .orderBy("scheduledAt", "asc")
    .limit(50)
    .get();

  const schedules = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      groupId: data.groupId,
      creatorId: data.creatorId,
      creatorName: data.creatorName,
      participantIds: data.participantIds ?? [],
      participantNames: data.participantNames ?? {},
      scheduledAt: data.scheduledAt?.toDate?.()?.toISOString() ?? null,
      callType: data.callType ?? "audio",
      status: data.status ?? "scheduled",
      note: data.note ?? "",
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ schedules });
}

// POST /api/groups/[id]/schedules — create a scheduled call (creator only)
export async function POST(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const { db } = getAdminServices();

  const groupSnap = await db.collection("groups").doc(id).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (groupSnap.data()!.createdBy !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    scheduledAt?: string;
    callType?: string;
    participantIds?: string[];
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!scheduledAt || isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    return NextResponse.json({ error: "scheduledAt must be a future date" }, { status: 400 });
  }

  const callType = body.callType === "video" ? "video" : "audio";
  const groupData = groupSnap.data()!;
  const allMemberIds: string[] = groupData.memberIds ?? [];
  const participantIds = body.participantIds?.filter((p: string) => allMemberIds.includes(p)) ?? allMemberIds;

  // Resolve participant names from group members map
  const membersMap: Record<string, { name?: string }> = groupData.members ?? {};
  const participantNames: Record<string, string> = {};
  for (const pid of participantIds) {
    participantNames[pid] = membersMap[pid]?.name ?? pid;
  }

  // Creator name
  const creatorName = membersMap[uid]?.name ?? "Admin";

  const ref = db.collection("scheduledGroupCalls").doc();
  await ref.set({
    callId: ref.id,
    groupId: id,
    groupName: groupData.name,
    creatorId: uid,
    creatorName,
    participantIds,
    participantNames,
    participantFcmTokens: {},
    participantVoipTokens: {},
    scheduledAt,
    callType,
    note: body.note?.trim() ?? "",
    status: "scheduled",
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, scheduleId: ref.id });
}
