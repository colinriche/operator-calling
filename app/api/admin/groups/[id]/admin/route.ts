import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminServices } from "@/lib/firebase-admin";
import { groupsDb } from "@/lib/waitlist/group-linking";

// Appoint (or remove) the group admin for a community group.
//
// ─── The canonical model ─────────────────────────────────────────────────────
//
// Three things looked like "group admin" before this:
//
//   groups.createdBy    — who created it. For an auto-created group that is the
//                         Operator staff member who set up the demand source,
//                         which is provenance, not authority.
//   groups.groupAdminId — written as null and never set.
//   memberships         — what GroupAdminDashboard actually queries.
//
// `groups.groupAdminId` is now the single source of truth for authority, and a
// `memberships` document with role "admin" is written alongside it so the group
// appears in GroupAdminDashboard, which queries memberships by userId.
//
// Both are written together, here, and nowhere else. Writing only one is what
// produced a group that had an admin by one definition and not by another.

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  // Appointing an administrator is a site-level act, not something a group can
  // do for itself.
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const remove = body.remove === true;
  const identifier =
    typeof body.identifier === "string" ? body.identifier.trim() : "";

  if (!remove && !identifier) {
    return NextResponse.json(
      { error: "Give a username, email or uid to appoint." },
      { status: 400 }
    );
  }

  try {
    const gDb = groupsDb();
    const groupRef = gDb.collection("groups").doc(id);
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = groupSnap.data() ?? {};

    if (remove) {
      const previous = group.groupAdminId as string | undefined;
      await groupRef.set(
        {
          groupAdminId: null,
          // Removing the admin does not stop calls that are already running —
          // that is a separate, explicit decision.
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (previous) {
        const memberships = await gDb
          .collection("memberships")
          .where("groupId", "==", id)
          .where("userId", "==", previous)
          .get();
        const batch = gDb.batch();
        for (const doc of memberships.docs) {
          // Demote rather than delete — they stay in the group.
          batch.set(doc.ref, { role: "member" }, { merge: true });
        }
        await batch.commit();
      }

      return NextResponse.json({ success: true, groupAdminId: null });
    }

    // Resolve the person. Roles live in the dev project's `user` collection.
    const { db: devDb } = getAdminServices();
    const users = devDb.collection("user");

    let userDoc = (await users.doc(identifier).get()).exists
      ? await users.doc(identifier).get()
      : null;

    if (!userDoc) {
      const byUsername = await users
        .where("username", "==", identifier.toLowerCase())
        .limit(1)
        .get();
      if (!byUsername.empty) userDoc = byUsername.docs[0];
    }
    if (!userDoc) {
      const byEmail = await users
        .where("email", "==", identifier.toLowerCase())
        .limit(1)
        .get();
      if (!byEmail.empty) userDoc = byEmail.docs[0];
    }

    if (!userDoc) {
      return NextResponse.json(
        { error: "No account found for that username, email or uid." },
        { status: 404 }
      );
    }

    const uid = userDoc.id;
    const userData = userDoc.data() ?? {};

    await groupRef.set(
      {
        groupAdminId: uid,
        // An admin must also be a member, or group reads fail for them: the
        // Firestore rules gate on `request.auth.uid in memberIds`.
        memberIds: FieldValue.arrayUnion(uid),
        [`members.${uid}`]: {
          name: userData.displayName ?? userData.name ?? "",
          username: userData.username ?? "",
          joinedAt: FieldValue.serverTimestamp(),
        },
        groupAdminAppointedAt: FieldValue.serverTimestamp(),
        groupAdminAppointedBy: caller.uid,
        updatedAt: FieldValue.serverTimestamp(),
        // Deliberately NOT touching callsEnabled. Appointing an admin does not
        // start calling; they turn it on when they are ready.
      },
      { merge: true }
    );

    // Deterministic id so re-appointing the same person cannot create a second
    // membership document.
    await gDb
      .collection("memberships")
      .doc(`${id}__${uid}`)
      .set(
        {
          groupId: id,
          userId: uid,
          role: "admin",
          status: "active",
          joinedAt: FieldValue.serverTimestamp(),
          appointedBy: caller.uid,
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      groupAdminId: uid,
      displayName: userData.displayName ?? userData.name ?? null,
      // Says plainly that nothing started, since that is the surprising part.
      callsEnabled: group.callsEnabled === true,
      note: "Calls were not changed. The group admin turns calls on when ready.",
    });
  } catch (err) {
    console.error("[admin/groups/admin POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
