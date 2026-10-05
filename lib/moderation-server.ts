// Server-only: moderation reads and writes through the Admin SDK. Never import
// from a Client Component. The rules live in lib/moderation-model.ts (pure and
// tested); this file only loads, applies and records them.
//
// Data layout: docs/MODERATION_CONTRACT.md in the app repo.
//   reports/{id}              the queue (new schema and the old in-call flag)
//   blocks/{a}_{b}            written by the app's functions when a report is filed
//   moderation_actions/{id}   append-only audit trail, one row per admin action
//   user/{uid}                accountStatus, suspension, warnings, autoCallsDisabled…
//
// Everything is keyed on the Firebase UID, so it works for people who have never
// signed into this website.
//
// Nothing here deletes a report, a block or an audit row, and none of it is
// touched when an account is archived or deleted: the moderation record outlives
// the contact link and the account (subject to the privacy/retention policy).

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  normaliseReport,
  planAction,
  sortNewestFirst,
  standingFromUser,
  summariseHistory,
  validateActionInput,
  type Admin,
  type ReportView,
  type Standing,
} from "@/lib/moderation-model";

export const REPORTS_COLLECTION = "reports";
export const BLOCKS_COLLECTION = "blocks";
export const ACTIONS_COLLECTION = "moderation_actions";
export const USER_COLLECTION = "user";

/** A refusal that is safe to show the admin, with the HTTP status to send. */
export class ModerationRefusal extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/**
 * Every report, newest first.
 *
 * One read path on purpose. The collection holds two document shapes with
 * different field names for the same thing (`reportedUid` / `reportedUserId` /
 * `reportedId`), so "all reports against X" cannot be a single Firestore query.
 * Normalising in memory and filtering is exact, and at the volume a moderation
 * queue sees it is cheap. If it ever isn't, the answer is to migrate the old
 * documents, not to add a query per field name.
 */
export async function loadAllReports(db: Firestore, limit = 2000): Promise<ReportView[]> {
  const snap = await db.collection(REPORTS_COLLECTION).limit(limit).get();
  return sortNewestFirst(snap.docs.map((d) => normaliseReport(d.id, d.data())));
}

export const reportsAgainst = (all: ReportView[], uid: string) =>
  all.filter((r) => r.reported.uid === uid);

export const reportsBy = (all: ReportView[], uid: string) =>
  all.filter((r) => r.reporter.uid === uid);

export interface PairBlock {
  blocked: boolean;
  /** Who made the block, when blocked: the reporter, the reported person, or both. */
  by: ("reporter" | "reported")[];
  /** `report` blocks only an admin can lift; `block` is the user's own. */
  kind: string | null;
}

/** Whether the two accounts are already blocked from each other, either way. */
export async function pairBlockBetween(
  db: Firestore,
  reporterUid: string,
  reportedUid: string
): Promise<PairBlock> {
  if (!reporterUid || !reportedUid) return { blocked: false, by: [], kind: null };
  const [fromReporter, fromReported] = await Promise.all([
    db.collection(BLOCKS_COLLECTION).doc(`${reporterUid}_${reportedUid}`).get(),
    db.collection(BLOCKS_COLLECTION).doc(`${reportedUid}_${reporterUid}`).get(),
  ]);
  const by: PairBlock["by"] = [];
  if (fromReporter.exists) by.push("reporter");
  if (fromReported.exists) by.push("reported");
  const kind = (fromReporter.exists ? fromReporter : fromReported).data()?.kind;
  return { blocked: by.length > 0, by, kind: typeof kind === "string" ? kind : null };
}

async function readUser(db: Firestore, uid: string) {
  if (!uid) return { exists: false, data: null as Record<string, unknown> | null };
  const snap = await db.collection(USER_COLLECTION).doc(uid).get();
  return { exists: snap.exists, data: snap.exists ? (snap.data() ?? {}) : null };
}

export interface Identity {
  uid: string;
  name: string;
  username: string;
  systemName: string;
  email: string;
  /** The account is gone (deleted or archived); the record remains. */
  deleted: boolean;
}

function identityOf(uid: string, data: Record<string, unknown> | null, fallback?: Partial<Identity>): Identity {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    uid,
    name: s(data?.name) || s(data?.displayName) || fallback?.name || "",
    username: s(data?.username) || fallback?.username || "",
    systemName: s(data?.systemName) || fallback?.systemName || "",
    email: s(data?.email),
    deleted: data === null || data.archived === true,
  };
}

export interface ReportDetail {
  report: ReportView;
  /** Every report against the reported account, including this one. */
  history: ReportView[];
  summary: ReturnType<typeof summariseHistory>;
  reported: { identity: Identity; standing: Standing };
  reporter: { identity: Identity; standing: Standing; reportsMade: number };
  pairBlock: PairBlock;
}

export async function getReportDetail(db: Firestore, reportId: string): Promise<ReportDetail | null> {
  const snap = await db.collection(REPORTS_COLLECTION).doc(reportId).get();
  if (!snap.exists) return null;
  const report = normaliseReport(snap.id, snap.data() ?? {});

  const [all, reportedUser, reporterUser, pairBlock] = await Promise.all([
    loadAllReports(db),
    readUser(db, report.reported.uid),
    readUser(db, report.reporter.uid),
    pairBlockBetween(db, report.reporter.uid, report.reported.uid),
  ]);

  const history = reportsAgainst(all, report.reported.uid);
  return {
    report,
    history,
    summary: summariseHistory(history),
    reported: {
      identity: identityOf(report.reported.uid, reportedUser.data, report.reported),
      standing: standingFromUser(reportedUser.data),
    },
    reporter: {
      identity: identityOf(report.reporter.uid, reporterUser.data, report.reporter),
      standing: standingFromUser(reporterUser.data),
      reportsMade: reportsBy(all, report.reporter.uid).length,
    },
    pairBlock,
  };
}

export interface AuditRow {
  id: string;
  reportId: string | null;
  action: string;
  reason: string;
  userMessage: string;
  adminEmail: string;
  adminName: string;
  at: string | null;
  expiresAt: string | null;
  outcome: string | null;
}

export interface UserModeration {
  identity: Identity;
  standing: Standing;
  received: ReportView[];
  made: ReportView[];
  summary: ReturnType<typeof summariseHistory>;
  audit: AuditRow[];
}

function iso(value: unknown): string | null {
  const d = (value as { toDate?: () => Date } | null)?.toDate?.();
  return d ? d.toISOString() : null;
}

export async function getUserModeration(db: Firestore, uid: string): Promise<UserModeration> {
  const [all, user, auditSnap] = await Promise.all([
    loadAllReports(db),
    readUser(db, uid),
    db.collection(ACTIONS_COLLECTION).where("targetUid", "==", uid).limit(100).get(),
  ]);

  const received = reportsAgainst(all, uid);
  const audit: AuditRow[] = auditSnap.docs
    .map((d) => {
      const a = d.data();
      return {
        id: d.id,
        reportId: typeof a.reportId === "string" ? a.reportId : null,
        action: String(a.action ?? ""),
        reason: String(a.reason ?? ""),
        userMessage: String(a.userMessage ?? ""),
        adminEmail: String(a.adminEmail ?? ""),
        adminName: String(a.adminName ?? ""),
        at: iso(a.at),
        expiresAt: iso(a.expiresAt),
        outcome: typeof a.outcome === "string" ? a.outcome : null,
      };
    })
    .sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));

  return {
    identity: identityOf(uid, user.data),
    standing: standingFromUser(user.data),
    received,
    made: reportsBy(all, uid),
    summary: summariseHistory(received),
    audit,
  };
}

// ─── Acting ──────────────────────────────────────────────────────────────────

function auditDoc(
  admin: Admin,
  targetUid: string,
  reportId: string | null,
  audit: { action: string; reason: string; userMessage: string; expiresAt: Date | null; outcome: string | null },
  now: Date
) {
  return {
    reportId,
    targetUid,
    action: audit.action,
    reason: audit.reason,
    userMessage: audit.userMessage,
    outcome: audit.outcome,
    expiresAt: audit.expiresAt ? Timestamp.fromDate(audit.expiresAt) : null,
    adminUid: admin.uid,
    adminEmail: admin.email,
    adminName: admin.name,
    at: Timestamp.fromDate(now),
  };
}

function userWrite(patch: { fields: Record<string, unknown>; incrementWarnings: boolean }) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch.fields)) {
    // Dates become Timestamps; a nested suspension object carries Dates too.
    out[key] = toFirestore(value);
  }
  if (patch.incrementWarnings) out.warnings = FieldValue.increment(1);
  return out;
}

function toFirestore(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFirestore(v)]));
  }
  return value;
}

/**
 * Perform an action on a REPORT: start review, dismiss, warn, suspend, ban,
 * disable auto calls, or add a note. In one transaction, so the report, the
 * account and the audit row never disagree about what happened.
 *
 * `now` is injected for tests.
 */
export async function performReportAction(
  db: Firestore,
  reportId: string,
  admin: Admin,
  rawInput: unknown,
  now: Date = new Date()
): Promise<ReportView> {
  const validated = validateActionInput(rawInput, now);
  if (!validated.ok) throw new ModerationRefusal(validated.error);

  const reportRef = db.collection(REPORTS_COLLECTION).doc(reportId);

  await db.runTransaction(async (tx) => {
    const reportSnap = await tx.get(reportRef);
    if (!reportSnap.exists) throw new ModerationRefusal("Report not found.", 404);
    const report = normaliseReport(reportSnap.id, reportSnap.data() ?? {});

    const targetUid = report.reported.uid;
    if (!targetUid) throw new ModerationRefusal("This report doesn't name a reported account.");
    const userRef = db.collection(USER_COLLECTION).doc(targetUid);
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? (userSnap.data() ?? {}) : null;

    const plan = planAction(validated.value, {
      reportStatus: report.status,
      standing: standingFromUser(userData, now),
      archived: userData?.archived === true,
      now,
      admin,
    });
    if (!plan.ok) throw new ModerationRefusal(plan.error, 409);

    const touchesAccount =
      Object.keys(plan.user.fields).length > 0 || plan.user.incrementWarnings;
    if (touchesAccount && targetUid === admin.uid) {
      throw new ModerationRefusal("You can't take moderation action on your own account.", 400);
    }
    if (touchesAccount && !userSnap.exists) {
      throw new ModerationRefusal(
        "That account no longer exists, so it can't be warned, suspended or banned. You can still dismiss the report or add a note.",
        409
      );
    }

    const entry = {
      action: plan.audit.action,
      adminUid: admin.uid,
      adminEmail: admin.email,
      adminName: admin.name,
      reason: plan.audit.reason,
      at: Timestamp.fromDate(now),
    };

    const reportUpdate: Record<string, unknown> = {
      actions: FieldValue.arrayUnion(entry),
    };
    if (plan.audit.action === "note") {
      reportUpdate.notes = FieldValue.arrayUnion({
        adminUid: admin.uid,
        adminEmail: admin.email,
        adminName: admin.name,
        text: validated.value.note ?? "",
        at: Timestamp.fromDate(now),
      });
    }
    if (plan.report) {
      reportUpdate.status = plan.report.status;
      if (plan.report.status === "reviewing") {
        reportUpdate.reviewStartedAt = Timestamp.fromDate(now);
        reportUpdate.reviewStartedBy = admin.email;
      }
      if (plan.report.status === "resolved") {
        reportUpdate.outcome = plan.report.outcome;
        reportUpdate.resolvedAt = Timestamp.fromDate(now);
        reportUpdate.resolvedBy = admin.email;
      }
    }
    tx.update(reportRef, reportUpdate);

    if (touchesAccount) tx.set(userRef, userWrite(plan.user), { merge: true });

    tx.set(
      db.collection(ACTIONS_COLLECTION).doc(),
      auditDoc(admin, targetUid, reportId, plan.audit, now)
    );
  });

  const after = await reportRef.get();
  return normaliseReport(after.id, after.data() ?? {});
}

/**
 * Perform an action on a USER, outside any report: unban, unsuspend, enable
 * auto calls, or warn/suspend/ban/disable from their profile. Same plan, same
 * audit row, no report involved.
 */
export async function performUserAction(
  db: Firestore,
  uid: string,
  admin: Admin,
  rawInput: unknown,
  now: Date = new Date()
): Promise<UserModeration> {
  const validated = validateActionInput(rawInput, now);
  if (!validated.ok) throw new ModerationRefusal(validated.error);
  const { action } = validated.value;
  if (action === "start_review" || action === "dismiss" || action === "note") {
    throw new ModerationRefusal("That action applies to a report.");
  }

  const userRef = db.collection(USER_COLLECTION).doc(uid);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new ModerationRefusal("That account no longer exists.", 404);
    const userData = userSnap.data() ?? {};

    const plan = planAction(validated.value, {
      reportStatus: null,
      standing: standingFromUser(userData, now),
      archived: userData.archived === true,
      now,
      admin,
    });
    if (!plan.ok) throw new ModerationRefusal(plan.error, 409);

    tx.set(userRef, userWrite(plan.user), { merge: true });
    tx.set(db.collection(ACTIONS_COLLECTION).doc(), auditDoc(admin, uid, null, plan.audit, now));
  });

  return getUserModeration(db, uid);
}
