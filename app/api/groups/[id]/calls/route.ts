import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { verifyIdToken } from "@/lib/firebase-admin";
import { groupsDb } from "@/lib/waitlist/group-linking";
import { nextOccurrenceUtc, type WeeklyWindow } from "@/lib/waitlist/schedule";
import { SCHEDULE_ZONE } from "@/lib/waitlist/timezone";

// Calls on/off for a single group.
//
// A group's schedule and whether it is currently calling are separate concerns.
// Turning calls off leaves the schedule, the members and the group itself
// untouched — it only stops calls running. Turning them back on resumes from
// the next valid occurrence; nothing missed while paused is replayed, because
// a call nobody attended is not owed to anyone.
//
// This gives site admins an operational kill switch for one group without
// deleting anything or editing a schedule someone else set.

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PAUSE_REASONS = {
  awaiting_group_admin: "Calls paused — awaiting group admin",
  admin_paused: "Calls paused by an administrator",
  group_admin_paused: "Calls paused by the group admin",
} as const;

// ─── GET — current state ─────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const identity = await verifyIdToken(idToken);
    if (!identity) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const snap = await groupsDb().collection("groups").doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = snap.data() ?? {};

    const callsEnabled = group.callsEnabled === true;
    return NextResponse.json({
      callsEnabled,
      callsPausedReason: callsEnabled ? null : (group.callsPausedReason ?? null),
      groupAdminId: group.groupAdminId ?? null,
      nextCall: callsEnabled ? nextCallIso(group) : null,
    });
  } catch (err) {
    console.error("[groups/calls GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── Keeping the dispatcher honest ───────────────────────────────────────────
//
// group.callsEnabled is the authoritative control, but the code that actually
// places calls lives in another codebase and does not check it yet. Existing
// dispatch queries filter on status == "scheduled", so flipping a group's
// schedules to "paused" makes them invisible to a dispatcher that knows nothing
// about callsEnabled.
//
// This is belt and braces, not a substitute: the guard still belongs in the
// dispatch path. The schedule's day, time and zone are untouched either way —
// only its dispatch status moves.

/** Mark a group's schedules as not for dispatch. Definitions are preserved. */
async function pauseSchedules(groupId: string): Promise<void> {
  try {
    const db = groupsDb();
    const snap = await db
      .collection("scheduledGroupCalls")
      .where("groupId", "==", groupId)
      .where("status", "==", "scheduled")
      .get();

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.set(
        doc.ref,
        { status: "paused", pausedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    await batch.commit();
  } catch (err) {
    console.error("[groups/calls] pausing schedules failed:", err);
  }
}

/**
 * Return a group's schedules to dispatch, moved forward to the next occurrence.
 *
 * Recomputing scheduledAt is what makes "do not replay missed calls" true: a
 * paused schedule whose time passed would otherwise be instantly overdue and
 * fire the moment it became visible again.
 */
async function resumeSchedules(
  groupId: string,
  group: FirebaseFirestore.DocumentData
): Promise<string | null> {
  const next = nextCallIso(group);
  try {
    const db = groupsDb();
    const snap = await db
      .collection("scheduledGroupCalls")
      .where("groupId", "==", groupId)
      .where("status", "==", "paused")
      .get();

    const batch = db.batch();
    for (const doc of snap.docs) {
      const data = doc.data();
      // Prefer each schedule's own definition; fall back to the group's.
      const window: WeeklyWindow = data.scheduleLocalTime
        ? {
            weekday: data.scheduleWeekday ?? 0,
            localTime: data.scheduleLocalTime,
            zone: data.scheduleZone ?? SCHEDULE_ZONE,
          }
        : {
            weekday: group.scheduleWeekday ?? 0,
            localTime: group.scheduleLocalTime ?? "19:00",
            zone: group.scheduleZone ?? SCHEDULE_ZONE,
          };

      batch.set(
        doc.ref,
        {
          status: "scheduled",
          scheduledAt: nextOccurrenceUtc(window),
          resumedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  } catch (err) {
    console.error("[groups/calls] resuming schedules failed:", err);
  }
  return next;
}

function nextCallIso(group: FirebaseFirestore.DocumentData): string | null {
  if (!group.scheduleLocalTime) return null;
  const window: WeeklyWindow = {
    weekday: group.scheduleWeekday ?? 0,
    localTime: group.scheduleLocalTime,
    zone: group.scheduleZone ?? SCHEDULE_ZONE,
  };
  return nextOccurrenceUtc(window).toISOString();
}

// ─── PATCH — turn calls on or off ────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const idToken = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (typeof body.callsEnabled !== "boolean") {
    return NextResponse.json({ error: "callsEnabled is required" }, { status: 400 });
  }

  try {
    const identity = await verifyIdToken(idToken);
    if (!identity) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const db = groupsDb();
    const ref = db.collection("groups").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = snap.data() ?? {};

    // Group admins control their own group; site and super admins can control
    // any, as an operational kill switch.
    const isGroupAdmin =
      group.groupAdminId === identity.uid || group.createdBy === identity.uid;
    const siteAdmin = isGroupAdmin ? null : await requireAdmin(req);

    if (!isGroupAdmin && !siteAdmin) {
      return NextResponse.json(
        { error: "You don't have permission to change this group's calls." },
        { status: 403 }
      );
    }

    if (body.callsEnabled) {
      // Enabling requires a schedule to enable. Without one there is nothing to
      // turn on, and silently doing nothing would look like a broken button.
      if (!group.scheduleLocalTime) {
        return NextResponse.json(
          { error: "This group has no schedule to turn on." },
          { status: 400 }
        );
      }

      await ref.set(
        {
          callsEnabled: true,
          callsPausedReason: null,
          callsEnabledAt: FieldValue.serverTimestamp(),
          callsUpdatedBy: identity.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Resume from the next valid occurrence, and only that one. Rewriting
      // scheduledAt forward is what stops anything that fell due while paused
      // from firing the moment calls come back on.
      const nextRun = await resumeSchedules(id, group);

      return NextResponse.json({ callsEnabled: true, nextCall: nextRun });
    }

    await ref.set(
      {
        callsEnabled: false,
        callsPausedReason: isGroupAdmin ? "group_admin_paused" : "admin_paused",
        callsPausedAt: FieldValue.serverTimestamp(),
        callsUpdatedBy: identity.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await pauseSchedules(id);

    return NextResponse.json({ callsEnabled: false });
  } catch (err) {
    console.error("[groups/calls PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
