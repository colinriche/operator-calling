import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email/send";
import { testerCallsScheduled } from "@/lib/email/templates";
import {
  GLOBAL_SCHEDULES_COLLECTION,
  WEEKDAY_NAMES,
  createGlobalSchedule,
  listActiveTesters,
  listGlobalSchedules,
} from "@/lib/waitlist/global-schedule";
import { nextOccurrenceUtc, type WeeklyWindow } from "@/lib/waitlist/schedule";
import { waitlistDb } from "@/lib/waitlist/server";
import { SCHEDULE_ZONE, formatInZone, isValidTimezone } from "@/lib/waitlist/timezone";

// Call windows for the global pool that early access testers join.
//
// Community groups get a window automatically when they activate. The global
// pool has no such trigger, so its windows are set here — without one, someone
// who joined early access is waiting for a call that has no time.

export const runtime = "nodejs";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    const [schedules, testers] = await Promise.all([
      listGlobalSchedules(),
      listActiveTesters(),
    ]);
    return NextResponse.json({
      schedules,
      activeTesterCount: testers.length,
      defaultZone: SCHEDULE_ZONE,
    });
  } catch (err) {
    console.error("[admin/global-schedule GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const weekday = Number(body.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: "Pick a day of the week" }, { status: 400 });
  }

  const localTime = typeof body.localTime === "string" ? body.localTime.trim() : "";
  if (!TIME_RE.test(localTime)) {
    return NextResponse.json(
      { error: "Time must be in 24-hour HH:MM format" },
      { status: 400 }
    );
  }

  const zone = isValidTimezone(body.zone) ? body.zone : SCHEDULE_ZONE;
  const window: WeeklyWindow = { weekday, localTime, zone };

  try {
    const db = waitlistDb();
    const id = await createGlobalSchedule(
      db,
      window,
      typeof body.label === "string" ? body.label.trim().slice(0, 120) : "",
      caller.uid
    );

    // Telling testers is the entire point of setting a window, so it happens
    // here rather than as a separate step someone has to remember.
    let notified = { sent: 0, failed: 0 };
    if (body.notify !== false) {
      notified = await notifyTesters(id, window);
    }

    return NextResponse.json({ id, notified });
  } catch (err) {
    console.error("[admin/global-schedule POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const db = waitlistDb();
    const ref = db.collection(GLOBAL_SCHEDULES_COLLECTION).doc(id);

    if (body.delete === true) {
      await ref.delete();
      return NextResponse.json({ success: true });
    }

    const update: Record<string, unknown> = {};
    if (typeof body.active === "boolean") update.active = body.active;
    if (typeof body.label === "string") update.label = body.label.trim().slice(0, 120);

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await ref.set(update, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/global-schedule PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Tell active testers their calls now have a time, each in their own zone.
 *
 * Paced and sequential like the activation notification, for the same reason —
 * Workspace SMTP refuses bursts.
 */
async function notifyTesters(
  scheduleId: string,
  window: WeeklyWindow
): Promise<{ sent: number; failed: number }> {
  const db = waitlistDb();
  const testers = await listActiveTesters(db);
  const instant = nextOccurrenceUtc(window);
  const recurrence = `Every ${WEEKDAY_NAMES[window.weekday]} at ${window.localTime} ${window.zone.replace(/_/g, " ")}`;

  let sent = 0;
  let failed = 0;

  for (const tester of testers) {
    const result = await sendEmail(
      testerCallsScheduled({
        to: tester.email,
        manageToken: tester.manageToken,
        firstCallLocal: formatInZone(instant, tester.timezone),
        timezone: tester.timezone.replace(/_/g, " "),
        recurrence,
      })
    );
    if (result.sent) sent++;
    else failed++;
    await new Promise((r) => setTimeout(r, 250));
  }

  await db
    .collection(GLOBAL_SCHEDULES_COLLECTION)
    .doc(scheduleId)
    .set(
      { notifiedAt: FieldValue.serverTimestamp(), notifiedCount: sent },
      { merge: true }
    );

  return { sent, failed };
}
