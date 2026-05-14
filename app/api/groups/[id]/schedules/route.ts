import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string }> };
type GroupData = {
  createdBy?: string;
  type?: string;
  name?: string;
  memberIds?: string[];
  members?: Record<string, { name?: string }>;
};

function canManageSchedules(groupData: GroupData, uid: string) {
  return groupData.createdBy === uid && groupData.type === "family";
}

function mapSchedule(id: string, data: DocumentData) {
  return {
    id,
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
}

function resolveParticipants(groupData: GroupData, requestedIds: unknown) {
  const allMemberIds = groupData.memberIds ?? [];
  const requested = Array.isArray(requestedIds)
    ? requestedIds.filter((p): p is string => typeof p === "string")
    : allMemberIds;
  const participantIds = requested.filter((p) => allMemberIds.includes(p));
  const membersMap = groupData.members ?? {};
  const participantNames: Record<string, string> = {};
  for (const pid of participantIds) {
    participantNames[pid] = membersMap[pid]?.name ?? pid;
  }
  return { participantIds, participantNames };
}

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

  const schedules = snap.docs.map((d) => mapSchedule(d.id, d.data()));

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
  const groupData = groupSnap.data()! as GroupData;
  if (!canManageSchedules(groupData, uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    scheduledAt?: string;
    callType?: string;
    participantIds?: string[];
    note?: string;
    durationMinutes?: number;
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
  const durationMinutes = typeof body.durationMinutes === "number" && body.durationMinutes > 0
    ? body.durationMinutes
    : undefined;
  const { participantIds, participantNames } = resolveParticipants(groupData, body.participantIds);
  if (participantIds.length === 0) {
    return NextResponse.json({ error: "At least one participant is required" }, { status: 400 });
  }

  // Creator name
  const creatorName = groupData.members?.[uid]?.name ?? "Admin";

  const ref = db.collection("scheduledGroupCalls").doc();
  await ref.set({
    callId: ref.id,
    groupId: id,
    groupName: groupData.name ?? "",
    creatorId: uid,
    creatorName,
    participantIds,
    participantNames,
    participantFcmTokens: {},
    participantVoipTokens: {},
    scheduledAt,
    callType,
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    note: body.note?.trim() ?? "",
    status: "scheduled",
    createdAt: FieldValue.serverTimestamp(),
  });

  const createdSnap = await ref.get();
  return NextResponse.json({
    success: true,
    scheduleId: ref.id,
    schedule: mapSchedule(ref.id, createdSnap.data()!),
  });
}
