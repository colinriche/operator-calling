import { NextRequest, NextResponse } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminDb } from "@/lib/firebase-admin";

// ─── /api/admin/overview ─────────────────────────────────────────────────────
//
// Everything the super-admin dashboard used to read straight from the browser.
//
// It could not stay there. The client SDK is bound by Firestore rules, and that
// ruleset is the mobile app's — shared, changed through the main project's
// Development branch, and not ours to edit. Three of the five reads were denied
// outright:
//
//   • `schedules`            — no match block, so default deny
//   • `admin_controls`       — same, for both the read and the write
//   • `groups`               — the rule is `uid in memberIds || isAdmin()`, and
//                              Firestore rejects an unconstrained collection
//                              query it cannot prove is satisfiable. `isAdmin()`
//                              also tests `role == 'admin'` exactly, so a
//                              super_admin failed it even when signed in
//                              through the custom-token flow.
//
// They ran in one Promise.all, so a single denial took the whole page down with
// "Missing or insufficient permissions". The Admin SDK bypasses rules, which
// makes this route both the fix and the more honest boundary: the dashboard's
// data is admin-only, so it should be gated by the admin check rather than by
// whatever the app's ruleset happens to permit today.
//
// Reads the primary ("dev") project — the one the browser's client SDK talks to,
// so this route and the rest of the site keep seeing the same data. After the
// move to a single project (docs/single-project-migration.md) that is
// operator-calling and nothing here changes.

export const runtime = "nodejs";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalStr(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    const db = getAdminDb();
    const [usersSnap, groupsSnap, reportsSnap, schedulesSnap, controlsSnap] = await Promise.all([
      db.collection("user").get(),
      db.collection("groups").get(),
      db.collection("reports").get(),
      db.collection("schedules").get(),
      db.collection("admin_controls").doc("platform").get(),
    ]);

    const users = usersSnap.docs
      .map((snap) => {
        const data = snap.data() as DocumentData;
        return {
          id: snap.id,
          name: str(data.displayName, "Unnamed user"),
          email: str(data.email, `${snap.id}@unknown`),
          role: str(data.role, "user"),
          status: data.banned === true ? "banned" : "active",
          joinedAt: toDate(data.createdAt)?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""));

    const reports = reportsSnap.docs
      .map((snap) => {
        const data = snap.data() as DocumentData;
        const status = str(data.status, "open");
        if (status === "resolved" || status === "dismissed") return null;
        return {
          id: snap.id,
          reporter: str(data.reporterName, str(data.reporterId, "Unknown reporter")),
          reported: str(data.reportedName, str(data.reportedId, "Unknown user")),
          reason: str(data.reason, "No reason provided"),
          createdAt: toDate(data.createdAt)?.toISOString() ?? null,
          targetUserId: optionalStr(data.reportedId),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    // Call activity is derived from `schedules` rather than sent as raw
    // documents — the dashboard only ever showed the counts.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);

    let callsToday = 0;
    let completedCalls30d = 0;
    let failedCalls30d = 0;
    for (const snap of schedulesSnap.docs) {
      const data = snap.data() as DocumentData;
      const scheduledAt = toDate(data.scheduledAt);
      if (!scheduledAt) continue;
      if (scheduledAt >= startOfToday) callsToday += 1;
      if (scheduledAt < thirtyDaysAgo) continue;
      const status = str(data.status, "pending");
      if (status === "completed" || status === "confirmed") completedCalls30d += 1;
      if (status === "missed" || status === "cancelled") failedCalls30d += 1;
    }

    const controls = (controlsSnap.exists ? controlsSnap.data() : {}) as DocumentData;

    return NextResponse.json({
      users,
      reports,
      groupsCount: groupsSnap.size,
      callsToday,
      completedCalls30d,
      failedCalls30d,
      controls: {
        allowNewUserSignups: controls.allowNewUserSignups !== false,
        enableStrangerCalls: controls.enableStrangerCalls !== false,
        maintenanceMode: controls.maintenanceMode === true,
      },
    });
  } catch (err) {
    console.error("[admin/overview GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Platform-wide switches — maintenance mode, new signups, stranger calls.
 *
 * super_admin only. These change the behaviour of the whole product for every
 * user, which is a different order of thing from the day-to-day admin work in
 * the capability table.
 */
export async function PUT(req: NextRequest) {
  const caller = await requireAdmin(req, { superAdminOnly: true });
  if (!caller) {
    return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const key of ["allowNewUserSignups", "enableStrangerCalls", "maintenanceMode"] as const) {
    if (typeof body[key] === "boolean") update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No recognised control in body" }, { status: 400 });
  }

  try {
    await getAdminDb()
      .collection("admin_controls")
      .doc("platform")
      .set(
        { ...update, updatedBy: caller.email, updatedAt: new Date() },
        { merge: true }
      );
    console.log(`[admin/overview] ${caller.email} set ${JSON.stringify(update)}`);
    return NextResponse.json({ success: true, controls: update });
  } catch (err) {
    console.error("[admin/overview PUT]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
