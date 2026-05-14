import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string }> };
type AdminServices = ReturnType<typeof getAdminServices>;
type EmbeddedMember = {
  name?: unknown;
  displayName?: unknown;
  username?: unknown;
  email?: unknown;
  joinedAt?: unknown;
};

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

async function resolveMemberSummary(
  db: AdminServices["db"],
  adminAuth: AdminServices["adminAuth"],
  memberId: string,
  embedded: EmbeddedMember
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

  const username = firstValue(
    usableString(embedded.username),
    usableString(profile.username)
  );
  const email = firstValue(
    usableString(embedded.email),
    usableString(profile.email),
    authEmail
  );
  const name = firstValue(
    usableDisplayName(embedded.name),
    usableDisplayName(embedded.displayName),
    usableDisplayName(profile.name),
    usableDisplayName(profile.displayName),
    usableDisplayName(username),
    usableDisplayName(email),
    usableDisplayName(authDisplayName),
    usableDisplayName(authEmail),
    "Unknown"
  );

  return { name, username, email };
}

// GET /api/groups/[id] — group detail + members
export async function GET(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const { db, adminAuth } = getAdminServices();

  const snap = await db.collection("groups").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = snap.data()!;
  if (!data.memberIds?.includes(uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Enrich members with email from user profiles
  const memberIds: string[] = data.memberIds ?? [];
  const membersMap: Record<string, EmbeddedMember> = data.members ?? {};

  const enriched = await Promise.all(
    memberIds.map(async (memberId) => {
      const m = membersMap[memberId] ?? {};
      const summary = await resolveMemberSummary(db, adminAuth, memberId, m);
      return {
        uid: memberId,
        name: summary.name,
        username: summary.username,
        email: summary.email,
        joinedAt:
          (m.joinedAt as { toDate?: () => Date } | null)?.toDate?.()?.toISOString() ?? null,
        isCreator: memberId === data.createdBy,
      };
    })
  );

  // Pending invites
  const inviteSnap = await db
    .collection("group_invites")
    .where("groupId", "==", id)
    .where("status", "==", "pending")
    .get();

  const pendingInvites = inviteSnap.docs.map((d) => ({
    id: d.id,
    inviteeId: d.data().inviteeId,
    inviteeName: d.data().inviteeName,
    inviteeUsername: d.data().inviteeUsername,
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
  }));

  return NextResponse.json({
    group: {
      id: snap.id,
      name: data.name,
      description: data.description ?? "",
      createdBy: data.createdBy,
      memberCount: memberIds.length,
      isPrivate: data.isPrivate ?? true,
      type: data.type ?? "general",
      allowMemberCalls: data.allowMemberCalls ?? false,
      tags: data.tags ?? [],
      scheduleSettings: data.scheduleSettings ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    },
    members: enriched,
    pendingInvites,
  });
}

// PATCH /api/groups/[id] — update group settings (creator only)
export async function PATCH(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const { db } = getAdminServices();

  const snap = await db.collection("groups").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (snap.data()!.createdBy !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const allowed = ["name", "description", "isPrivate", "allowMemberCalls", "scheduleSettings", "tags"];
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (update.name && typeof update.name === "string") {
    update.name = (update.name as string).trim();
    if (!update.name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  await db.collection("groups").doc(id).update(update);
  return NextResponse.json({ success: true });
}

// DELETE /api/groups/[id] — delete group (creator only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const { db } = getAdminServices();

  const snap = await db.collection("groups").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (snap.data()!.createdBy !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Clean up invites
  const inviteSnap = await db.collection("group_invites").where("groupId", "==", id).get();
  const batch = db.batch();
  for (const d of inviteSnap.docs) batch.delete(d.ref);
  batch.delete(db.collection("groups").doc(id));
  await batch.commit();

  return NextResponse.json({ success: true });
}
