// Server-only. Call windows for the global pool that testers join.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "./constants";
import { WEEKDAY_NAMES, nextOccurrenceUtc, type WeeklyWindow } from "./schedule";

export { WEEKDAY_NAMES };
import { waitlistDb } from "./server";
import { SCHEDULE_ZONE } from "./timezone";

// ─── Global pool schedules ───────────────────────────────────────────────────
//
// The global pool is not a group — it is everyone eligible for calls with
// people they do not know. So its windows live on their own rather than hanging
// off a group document.
//
// Community groups get an automatic Sunday window at activation; global windows
// are set by an admin, because there is no threshold event to trigger one and
// no sensible default for a pool that exists from day one.
//
// This defines *when* the pool runs and tells testers about it. It does not
// place calls — the app's own matching handles that.

export const GLOBAL_SCHEDULES_COLLECTION = "globalSchedules";

export interface GlobalScheduleRow {
  id: string;
  weekday: number;
  localTime: string;
  zone: string;
  label: string;
  active: boolean;
  /** Next occurrence as an ISO instant, resolved from the local definition. */
  nextRun: string | null;
  createdAt: string | null;
  createdBy: string | null;
  notifiedAt: string | null;
}

function toIso(value: unknown): string | null {
  const date =
    (value as { toDate?: () => Date } | null)?.toDate?.() ??
    (value instanceof Date ? value : null);
  return date ? date.toISOString() : null;
}

export function windowOf(data: FirebaseFirestore.DocumentData): WeeklyWindow {
  return {
    weekday: typeof data.weekday === "number" ? data.weekday : 0,
    localTime: (data.localTime as string) || "19:00",
    zone: (data.zone as string) || SCHEDULE_ZONE,
  };
}

export async function listGlobalSchedules(
  db: Firestore = waitlistDb()
): Promise<GlobalScheduleRow[]> {
  const snap = await db.collection(GLOBAL_SCHEDULES_COLLECTION).get();

  const rows = snap.docs.map((doc) => {
    const data = doc.data();
    const window = windowOf(data);
    const active = data.active !== false;
    return {
      id: doc.id,
      weekday: window.weekday,
      localTime: window.localTime,
      zone: window.zone,
      label: (data.label as string) ?? "",
      active,
      // Resolved live rather than stored, so it stays correct across a DST
      // change without anything needing to rewrite it.
      nextRun: active ? nextOccurrenceUtc(window).toISOString() : null,
      createdAt: toIso(data.createdAt),
      createdBy: (data.createdBy as string) ?? null,
      notifiedAt: toIso(data.notifiedAt),
    };
  });

  rows.sort((a, b) => (a.nextRun ?? "").localeCompare(b.nextRun ?? ""));
  return rows;
}

/** Soonest upcoming global window, for showing a tester what to expect. */
export async function nextGlobalCall(
  db: Firestore = waitlistDb()
): Promise<{ instant: Date; window: WeeklyWindow } | null> {
  const snap = await db
    .collection(GLOBAL_SCHEDULES_COLLECTION)
    .where("active", "==", true)
    .get();
  if (snap.empty) return null;

  let best: { instant: Date; window: WeeklyWindow } | null = null;
  for (const doc of snap.docs) {
    const window = windowOf(doc.data());
    const instant = nextOccurrenceUtc(window);
    if (!best || instant.getTime() < best.instant.getTime()) {
      best = { instant, window };
    }
  }
  return best;
}

export async function createGlobalSchedule(
  db: Firestore,
  window: WeeklyWindow,
  label: string,
  createdBy: string
): Promise<string> {
  const ref = await db.collection(GLOBAL_SCHEDULES_COLLECTION).add({
    weekday: window.weekday,
    localTime: window.localTime,
    zone: window.zone,
    label,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy,
    notifiedAt: null,
  });
  return ref.id;
}

/** Active testers, who are the people a global window concerns. */
export async function listActiveTesters(
  db: Firestore = waitlistDb()
): Promise<
  Array<{ ref: FirebaseFirestore.DocumentReference; email: string; timezone: string; manageToken: string }>
> {
  const snap = await db
    .collection(COLLECTIONS.waitlistEntries)
    .where("testerStatus", "==", "active")
    .get();

  const out: Array<{
    ref: FirebaseFirestore.DocumentReference;
    email: string;
    timezone: string;
    manageToken: string;
  }> = [];

  // One person can hold several registrations, one per community they came
  // from — but they are one tester, so only mail them once.
  const seen = new Set<string>();

  for (const doc of snap.docs) {
    const data = doc.data();
    const email = (data.email as string) ?? "";
    const token = (data.manageToken as string) ?? "";
    if (!email || !token) continue;

    const key = (data.canonicalEmail as string) ?? email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ref: doc.ref,
      email,
      timezone: (data.timezone as string) || SCHEDULE_ZONE,
      manageToken: token,
    });
  }

  return out;
}
