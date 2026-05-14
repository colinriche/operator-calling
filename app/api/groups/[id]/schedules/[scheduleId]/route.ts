import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string; scheduleId: string }> };
const SCHEDULE_EDIT_LOCK_MS = 2 * 60 * 1000;
type AdminServices = ReturnType<typeof getAdminServices>;
type EmbeddedMember = {
  name?: unknown;
  displayName?: unknown;
  username?: unknown;
  email?: unknown;
};
type GroupData = {
  createdBy?: string;
  type?: string;
  memberIds?: string[];
  members?: Record<string, EmbeddedMember>;
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

function usableString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function usableDisplayName(value: unknown) {
  const text = usableString(value);
  return text && !["unknown", "unknown user"].includes(text.toLowerCase()) ? text : "";
}

function firstValue(...values: string[]) {
  return values.find((value) => value.length > 0) ?? "";
}

async function resolveMemberName(
  db: AdminServices["db"],
  adminAuth: AdminServices["adminAuth"],
  memberId: string,
  embedded: EmbeddedMember = {}
) {
  let profile: Record<string, unknown> = {};
  let authDisplayName = "";
  let authEmail = "";

  try {
    const profileSnap = await db.collection("user").doc(memberId).get();
    profile = profileSnap.data() ?? {};
  } catch {}

  try {
    const authUser = await adminAuth.getUser(memberId);
    authDisplayName = authUser.displayName ?? "";
    authEmail = authUser.email ?? "";
  } catch {}

  return firstValue(
    usableDisplayName(embedded.name),
    usableDisplayName(embedded.displayName),
    usableDisplayName(profile.name),
    usableDisplayName(profile.displayName),
    usableDisplayName(embedded.username),
    usableDisplayName(profile.username),
    usableDisplayName(embedded.email),
    usableDisplayName(profile.email),
    usableDisplayName(authDisplayName),
    usableDisplayName(authEmail),
    "Unknown"
  );
}

async function resolveParticipants(
  db: AdminServices["db"],
  adminAuth: AdminServices["adminAuth"],
  groupData: GroupData,
  requestedIds: unknown
) {
  const allMemberIds = groupData.memberIds ?? [];
  const requested = Array.isArray(requestedIds)
    ? requestedIds.filter((p): p is string => typeof p === "string")
    : allMemberIds;
  const participantIds = requested.filter((p) => allMemberIds.includes(p));
  const membersMap = groupData.members ?? {};
  const participantNames: Record<string, string> = {};
  await Promise.all(participantIds.map(async (pid) => {
    participantNames[pid] = await resolveMemberName(db, adminAuth, pid, membersMap[pid]);
  }));
  return { participantIds, participantNames };
}

function isWithinEditLock(scheduledAt: Date) {
  return scheduledAt.getTime() - Date.now() <= SCHEDULE_EDIT_LOCK_MS;
}

// DELETE /api/groups/[id]/schedules/[scheduleId] — cancel a scheduled call (creator only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id, scheduleId } = await params;
  const { db } = getAdminServices();

  const groupSnap = await db.collection("groups").doc(id).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const groupData = groupSnap.data()! as GroupData;
  if (!canManageSchedules(groupData, uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schedSnap = await db.collection("scheduledGroupCalls").doc(scheduleId).get();
  if (!schedSnap.exists || schedSnap.data()!.groupId !== id) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  await db.collection("scheduledGroupCalls").doc(scheduleId).delete();
  return NextResponse.json({ success: true });
}

// PATCH /api/groups/[id]/schedules/[scheduleId] — edit a scheduled call
export async function PATCH(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id, scheduleId } = await params;
  const { db, adminAuth } = getAdminServices();

  const groupSnap = await db.collection("groups").doc(id).get();
  if (!groupSnap.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const groupData = groupSnap.data()! as GroupData;
  if (!canManageSchedules(groupData, uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schedRef = db.collection("scheduledGroupCalls").doc(scheduleId);
  const schedSnap = await schedRef.get();
  if (!schedSnap.exists || schedSnap.data()!.groupId !== id) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const existingScheduledAt = schedSnap.data()!.scheduledAt?.toDate?.();
  if (!existingScheduledAt || existingScheduledAt <= new Date()) {
    return NextResponse.json({ error: "Only upcoming scheduled calls can be edited" }, { status: 400 });
  }
  if (isWithinEditLock(existingScheduledAt)) {
    return NextResponse.json({ error: "This call is too close to edit" }, { status: 400 });
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

  const { participantIds, participantNames } = await resolveParticipants(
    db,
    adminAuth,
    groupData,
    body.participantIds
  );
  if (participantIds.length === 0) {
    return NextResponse.json({ error: "At least one participant is required" }, { status: 400 });
  }

  const callType = body.callType === "video" ? "video" : "audio";
  const update: Record<string, unknown> = {
    scheduledAt,
    callType,
    participantIds,
    participantNames,
    note: body.note?.trim() ?? "",
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof body.durationMinutes === "number" && body.durationMinutes > 0) {
    update.durationMinutes = body.durationMinutes;
  }

  await schedRef.update(update);
  const updatedSnap = await schedRef.get();
  return NextResponse.json({
    success: true,
    schedule: mapSchedule(scheduleId, updatedSnap.data()!),
  });
}
