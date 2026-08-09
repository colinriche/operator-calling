import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { verifyIdTokenAnyProject } from "@/lib/firebase-admin";
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
    const identity = await verifyIdTokenAnyProject(idToken);
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
    const identity = await verifyIdTokenAnyProject(idToken);
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

      // Resume from the next valid occurrence. Anything that fell due while
      // paused is not replayed.
      return NextResponse.json({
        callsEnabled: true,
        nextCall: nextCallIso(group),
      });
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

    // Schedules are deliberately left exactly as they are.
    return NextResponse.json({ callsEnabled: false });
  } catch (err) {
    console.error("[groups/calls PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
