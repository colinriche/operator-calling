import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string }> };
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
  name?: string;
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
    showUser: data.showUser !== false,
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
  let snap;
  try {
    snap = await db
      .collection("scheduledGroupCalls")
      .where("groupId", "==", id)
      .where("scheduledAt", ">=", now)
      .orderBy("scheduledAt", "asc")
      .limit(50)
      .get();
  } catch (error) {
    console.warn("[group schedules GET] Falling back to unindexed query:", error);
    snap = await db
      .collection("scheduledGroupCalls")
      .where("groupId", "==", id)
      .get();
  }

  const schedules = snap.docs
    .map((d) => mapSchedule(d.id, d.data()))
    .filter((s) =>
      s.status === "scheduled" &&
      s.scheduledAt !== null &&
      new Date(s.scheduledAt) >= now
    )
    .sort((a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime())
    .slice(0, 50);

  return NextResponse.json({ schedules });
}

// POST /api/groups/[id]/schedules — create a scheduled call (creator only)
export async function POST(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const { db, adminAuth } = getAdminServices();

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
    showUser?: boolean;
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
  const showUser = body.showUser !== false; // default true
  const callLabel = groupData.type === "family" ? "Family" : null;
  const durationMinutes = typeof body.durationMinutes === "number" && body.durationMinutes > 0
    ? body.durationMinutes
    : undefined;
  const { participantIds, participantNames } = await resolveParticipants(
    db,
    adminAuth,
    groupData,
    body.participantIds
  );
  if (participantIds.length === 0) {
    return NextResponse.json({ error: "At least one participant is required" }, { status: 400 });
  }

  const creatorName = await resolveMemberName(db, adminAuth, uid, groupData.members?.[uid]);

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
    showUser,
    ...(callLabel ? { callLabel } : {}),
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
