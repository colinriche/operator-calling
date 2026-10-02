// Pure moderation logic: no Firestore, no Admin SDK. Safe to import from a
// Client Component and unit-testable on its own. The server half is
// lib/moderation-server.ts; the data layout is docs/MODERATION_CONTRACT.md in
// the app repo (reports, blocks, moderation_actions, and the moderation fields
// on the `user` document).
//
// Everything is keyed on the FIREBASE UID. A reported person need never have
// signed into this website.

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/** The reasons offered in the app. The id is the wire value the app sends. */
export const REPORT_REASONS = {
  abusive_harassing: "Abusive or harassing behavior",
  sexual_inappropriate: "Sexual or inappropriate behavior",
  hate_discrimination: "Hate or discrimination",
  threats_safety: "Threats or safety concerns",
  spam_scam_suspicious: "Spam, scam or suspicious behavior",
  impersonation_misleading: "Impersonation or misleading identity",
  other: "Something else",
} as const;

export type ReportReasonId = keyof typeof REPORT_REASONS;

export function reasonLabel(id: string): string {
  return (REPORT_REASONS as Record<string, string>)[id] ?? id;
}

/** New → Reviewing → Resolved. */
export type ReportStatus = "new" | "reviewing" | "resolved";
export const REPORT_STATUSES: readonly ReportStatus[] = ["new", "reviewing", "resolved"];

export type ReportOutcome =
  | "dismissed"
  | "warned"
  | "suspended"
  | "banned"
  | "auto_calls_disabled";

export type AccountStatus = "active" | "suspended" | "banned";

/** Where the two people met. `unknown` only for old reports that never said. */
export type ReportCallType = "random" | "direct" | "unknown";

export const CALL_TYPE_LABELS: Record<ReportCallType, string> = {
  random: "Random call",
  direct: "Direct call",
  unknown: "Unknown",
};

// ─── Normalising a report document ───────────────────────────────────────────

/** Name → username → system name → UID: the four identifiers, in that order. */
export interface Party {
  uid: string;
  name: string;
  username: string;
  systemName: string;
}

export interface ActionEntry {
  action: string;
  adminUid: string;
  adminEmail: string;
  adminName: string;
  reason: string;
  at: string | null;
}

export interface NoteEntry {
  adminUid: string;
  adminEmail: string;
  adminName: string;
  text: string;
  at: string | null;
}

export interface ReportView {
  id: string;
  reporter: Party;
  reported: Party;
  reason: string;
  reasonLabel: string;
  details: string;
  createdAt: string | null;
  callId: string | null;
  callType: ReportCallType;
  source: string;
  status: ReportStatus;
  outcome: ReportOutcome | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  notes: NoteEntry[];
  actions: ActionEntry[];
  /** True for reports written by the old in-call flag, before this schema. */
  legacy: boolean;
}

type Loose = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const maybe = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof maybe.toDate === "function") return maybe.toDate().toISOString();
    const seconds = maybe._seconds ?? maybe.seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000).toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

function party(value: unknown, fallbackUid: string, fallbackName: string): Party {
  const v = (value && typeof value === "object" ? value : {}) as Loose;
  return {
    uid: asString(v.uid) || fallbackUid,
    name: asString(v.name) || fallbackName,
    username: asString(v.username),
    systemName: asString(v.systemName),
  };
}

function normaliseStatus(raw: unknown): ReportStatus {
  switch (raw) {
    case "new":
    case "reviewing":
    case "resolved":
      return raw;
    // Old pipeline: pending → reviewed | dismissed. Anything not finished is new.
    case "reviewed":
    case "dismissed":
    case "resolved_legacy":
      return "resolved";
    default:
      return "new";
  }
}

function normaliseOutcome(raw: unknown, legacyStatus: unknown, legacyAction: unknown): ReportOutcome | null {
  const valid: ReportOutcome[] = ["dismissed", "warned", "suspended", "banned", "auto_calls_disabled"];
  if (valid.includes(raw as ReportOutcome)) return raw as ReportOutcome;
  if (legacyStatus === "dismissed") return "dismissed";
  if (legacyAction === "banned") return "banned";
  return null;
}

function entries<T>(value: unknown, map: (item: Loose) => T): T[] {
  return Array.isArray(value)
    ? value.filter((v): v is Loose => !!v && typeof v === "object").map(map)
    : [];
}

/**
 * Turn a `reports` document of EITHER shape into one view.
 *
 * The collection holds the new schema (`reporter`/`reported` objects, `reason`
 * ids) and the old in-call-flag reports (`reporterId`, `reportedUserId`,
 * `reporterName`, no reason at all). Both must be reviewable in one queue.
 */
export function normaliseReport(id: string, data: Loose): ReportView {
  const isNew = typeof data.reporter === "object" && data.reporter !== null;

  const reporterUid = asString(data.reporterUid) || asString(data.reporterId);
  const reportedUid =
    asString(data.reportedUid) || asString(data.reportedUserId) || asString(data.reportedId);

  const reporter = party(data.reporter, reporterUid, asString(data.reporterName));
  const reported = party(
    data.reported,
    reportedUid,
    asString(data.reportedName) || asString(data.reportedUserName)
  );

  const reason = asString(data.reason) || (isNew ? "other" : "flagged_during_call");
  const status = normaliseStatus(data.status);

  return {
    id,
    reporter,
    reported,
    reason,
    reasonLabel: reason === "flagged_during_call" ? "Flagged during a call" : reasonLabel(reason),
    details: asString(data.details),
    createdAt: toIso(data.createdAt) ?? toIso(data.timestamp),
    callId: asString(data.callId) || asString(data.roomId) || null,
    callType:
      data.callType === "random" || data.callType === "direct"
        ? data.callType
        : isNew
          ? "direct"
          : "unknown",
    source: asString(data.source) || (isNew ? "post_call" : "in_call_flag"),
    status,
    outcome: normaliseOutcome(data.outcome, data.status, data.actionTaken),
    resolvedAt: toIso(data.resolvedAt) ?? toIso(data.reviewedAt),
    resolvedBy: asString(data.resolvedBy) || null,
    notes: entries(data.notes, (n) => ({
      adminUid: asString(n.adminUid),
      adminEmail: asString(n.adminEmail),
      adminName: asString(n.adminName),
      text: asString(n.text),
      at: toIso(n.at),
    })),
    actions: entries(data.actions, (a) => ({
      action: asString(a.action),
      adminUid: asString(a.adminUid),
      adminEmail: asString(a.adminEmail),
      adminName: asString(a.adminName),
      reason: asString(a.reason),
      at: toIso(a.at),
    })),
    legacy: !isNew,
  };
}

// ─── Queue ───────────────────────────────────────────────────────────────────

export type StatusFilter = ReportStatus | "all";

export function isStatusFilter(value: unknown): value is StatusFilter {
  return value === "all" || value === "new" || value === "reviewing" || value === "resolved";
}

export function filterReports(reports: ReportView[], filter: StatusFilter): ReportView[] {
  return filter === "all" ? reports : reports.filter((r) => r.status === filter);
}

/** Newest first; reports with no date sink to the bottom. */
export function sortNewestFirst<T extends { createdAt: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export interface QueueCounts {
  new: number;
  reviewing: number;
  resolved: number;
  all: number;
  /** New + reviewing: the number on the nav badge. */
  unresolved: number;
}

export function countReports(reports: ReportView[]): QueueCounts {
  const c = { new: 0, reviewing: 0, resolved: 0 };
  for (const r of reports) c[r.status] += 1;
  return { ...c, all: reports.length, unresolved: c.new + c.reviewing };
}

/** Number of OTHER reports against the same account, for the queue column. */
export function previousReportCounts(reports: ReportView[]): Map<string, number> {
  const byReported = new Map<string, number>();
  for (const r of reports) {
    if (r.reported.uid) byReported.set(r.reported.uid, (byReported.get(r.reported.uid) ?? 0) + 1);
  }
  const previous = new Map<string, number>();
  for (const r of reports) {
    previous.set(r.id, Math.max(0, (byReported.get(r.reported.uid) ?? 1) - 1));
  }
  return previous;
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistorySummary {
  /** Reports against the account, including the one being looked at. */
  total: number;
  byReason: { reason: string; label: string; count: number }[];
  distinctReporters: number;
}

/**
 * "3 reports against this account · 2 abusive behavior · 1 sexual/inappropriate
 * · from 3 different users". Counts reporters by UID so one person reporting
 * three times reads as one reporter, which is what makes a pile-on from a single
 * user obvious rather than alarming.
 */
export function summariseHistory(reportsAgainst: ReportView[]): HistorySummary {
  const counts = new Map<string, number>();
  const reporters = new Set<string>();
  for (const r of reportsAgainst) {
    counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    if (r.reporter.uid) reporters.add(r.reporter.uid);
  }
  const byReason = [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      label: reason === "flagged_during_call" ? "Flagged during a call" : reasonLabel(reason),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { total: reportsAgainst.length, byReason, distinctReporters: reporters.size };
}

// ─── Account standing (as stored on the user document) ───────────────────────

export interface Standing {
  status: AccountStatus;
  suspendedUntil: string | null;
  /** Shown to the user. */
  userMessage: string;
  /** Admin-only. */
  internalNote: string;
  suspendedBy: string | null;
  suspendedAt: string | null;
  warnings: number;
  autoCallsDisabled: boolean;
  autoCallsMessage: string;
  reportsReceived: number;
  reportsMade: number;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The standing the APP would enforce, mirroring effectiveAccountStatus in the
 * app's functions/moderation.js: a timed suspension that has passed counts as
 * active again without anyone clearing it, and the legacy `banned: true` bans.
 */
export function standingFromUser(data: Loose | null | undefined, now: Date = new Date()): Standing {
  const d = data ?? {};
  const suspension = (d.suspension && typeof d.suspension === "object" ? d.suspension : {}) as Loose;
  const expiresAt = toIso(suspension.expiresAt);

  let status: AccountStatus = "active";
  if (d.banned === true || d.accountStatus === "banned") {
    status = "banned";
  } else if (d.accountStatus === "suspended") {
    status = expiresAt === null || new Date(expiresAt) > now ? "suspended" : "active";
  }

  return {
    status,
    suspendedUntil: status === "suspended" ? expiresAt : null,
    userMessage: asString(suspension.reason),
    internalNote: asString(suspension.internalNote),
    suspendedBy: asString(suspension.by) || null,
    suspendedAt: toIso(suspension.at),
    warnings: toNumber(d.warnings),
    autoCallsDisabled: d.autoCallsDisabled === true,
    autoCallsMessage: asString(d.autoCallsDisabledMessage),
    reportsReceived: toNumber(d.reportsReceived),
    reportsMade: toNumber(d.reportsMade),
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ModerationAction =
  | "start_review"
  | "dismiss"
  | "warn"
  | "suspend"
  | "ban"
  | "unban"
  | "unsuspend"
  | "disable_auto_calls"
  | "enable_auto_calls"
  | "note";

export const MODERATION_ACTIONS: readonly ModerationAction[] = [
  "start_review",
  "dismiss",
  "warn",
  "suspend",
  "ban",
  "unban",
  "unsuspend",
  "disable_auto_calls",
  "enable_auto_calls",
  "note",
];

/** Actions that close a report, and the outcome each records. */
export const RESOLVING_ACTIONS: Partial<Record<ModerationAction, ReportOutcome>> = {
  dismiss: "dismissed",
  warn: "warned",
  suspend: "suspended",
  ban: "banned",
  disable_auto_calls: "auto_calls_disabled",
};

/** Actions that change the account, not just the report. These need a reason. */
const ENFORCEMENT: ModerationAction[] = [
  "warn",
  "suspend",
  "ban",
  "unban",
  "unsuspend",
  "disable_auto_calls",
  "enable_auto_calls",
];

export type DurationPreset = "24h" | "7d" | "30d" | "custom";

const PRESET_HOURS: Record<Exclude<DurationPreset, "custom">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

/** A suspension longer than this is a ban in all but name. */
export const MAX_SUSPENSION_DAYS = 365;
export const MAX_TEXT = 2000;

export interface ActionInput {
  action: ModerationAction;
  /** Why. Recorded in the audit trail and never shown to the user. */
  reason?: string;
  /** What the USER is told (suspension reason, auto-calls message). Optional. */
  userMessage?: string;
  /** Suspend only. */
  duration?: { preset: DurationPreset; until?: string };
  /** Note only. */
  note?: string;
  /** Ban only: the admin has seen the confirmation step. */
  confirm?: boolean;
}

export type Validated =
  | { ok: true; value: Required<Pick<ActionInput, "action">> & ActionInput & { expiresAt: Date | null } }
  | { ok: false; error: string };

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
}

/** Work out when a suspension ends. Null only for "no end"; never returned today. */
export function suspensionEnd(
  duration: ActionInput["duration"],
  now: Date
): { ok: true; expiresAt: Date } | { ok: false; error: string } {
  if (!duration) return { ok: false, error: "Choose how long the suspension lasts." };
  if (duration.preset === "custom") {
    const until = duration.until ? new Date(duration.until) : null;
    if (!until || Number.isNaN(until.getTime())) {
      return { ok: false, error: "Enter an end date for the suspension." };
    }
    if (until <= now) return { ok: false, error: "The end date must be in the future." };
    const maxMs = MAX_SUSPENSION_DAYS * 24 * 3600 * 1000;
    if (until.getTime() - now.getTime() > maxMs) {
      return {
        ok: false,
        error: `A suspension can last at most ${MAX_SUSPENSION_DAYS} days. Use Ban for anything longer.`,
      };
    }
    return { ok: true, expiresAt: until };
  }
  const hours = PRESET_HOURS[duration.preset as Exclude<DurationPreset, "custom">];
  if (!hours) return { ok: false, error: "Unknown suspension length." };
  return { ok: true, expiresAt: new Date(now.getTime() + hours * 3600 * 1000) };
}

export function validateActionInput(raw: unknown, now: Date = new Date()): Validated {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request." };
  const input = raw as Loose;
  const action = input.action as ModerationAction;
  if (!MODERATION_ACTIONS.includes(action)) return { ok: false, error: "Unknown action." };

  const reason = trimmed(input.reason);
  const userMessage = trimmed(input.userMessage);
  const note = trimmed(input.note);

  if (ENFORCEMENT.includes(action) && !reason) {
    return { ok: false, error: "Give a reason. It goes in the audit trail." };
  }
  if (action === "note" && !note) return { ok: false, error: "Write the note first." };
  if (action === "ban" && input.confirm !== true) {
    return { ok: false, error: "Confirm the ban. It disables the account." };
  }

  let expiresAt: Date | null = null;
  if (action === "suspend") {
    const end = suspensionEnd(input.duration as ActionInput["duration"], now);
    if (!end.ok) return end;
    expiresAt = end.expiresAt;
  }

  return {
    ok: true,
    value: {
      action,
      reason,
      userMessage,
      note,
      confirm: input.confirm === true,
      duration: input.duration as ActionInput["duration"],
      expiresAt,
    },
  };
}

export interface Admin {
  uid: string;
  email: string;
  name: string;
}

/** What an action does to the `user` document. `null` clears a field. */
export interface UserPatch {
  fields: Record<string, unknown>;
  /** Add one to `warnings` (the server uses FieldValue.increment). */
  incrementWarnings: boolean;
}

export type PlanError = { ok: false; error: string };

export interface ActionPlan {
  ok: true;
  /** Set when the action closes or advances the report; null for user-level actions. */
  report: { status: ReportStatus; outcome: ReportOutcome | null } | null;
  user: UserPatch;
  /** The `moderation_actions` row, minus the server timestamp. */
  audit: {
    action: ModerationAction;
    reason: string;
    userMessage: string;
    expiresAt: Date | null;
    outcome: ReportOutcome | null;
  };
}

/**
 * What performing [action] changes. Pure: it is told the report's current
 * status and the account's current standing and returns the patch, so the rules
 * live here and are testable without a database.
 *
 * `reportStatus` is null for an action taken on a user outside any report (an
 * unban from the user's profile, say).
 */
export function planAction(
  value: Extract<Validated, { ok: true }>["value"],
  ctx: { reportStatus: ReportStatus | null; standing: Standing; archived?: boolean; now: Date; admin: Admin }
): ActionPlan | PlanError {
  const { action } = value;
  const { reportStatus, standing, archived, now, admin } = ctx;
  const onReport = reportStatus !== null;

  // A finished report is a record. Only notes may be added to it; to act on the
  // account again, use the user's profile.
  if (reportStatus === "resolved" && action !== "note") {
    return { ok: false, error: "This report is resolved. Add a note, or act on the account from the user's profile." };
  }
  if (action === "start_review") {
    if (!onReport) return { ok: false, error: "Start review applies to a report." };
    if (reportStatus !== "new") return { ok: false, error: "This report is already being reviewed." };
  }
  if ((action === "dismiss") && !onReport) {
    return { ok: false, error: "Dismiss applies to a report." };
  }

  const audit = {
    action,
    reason: value.reason ?? "",
    userMessage: value.userMessage ?? "",
    expiresAt: value.expiresAt,
    outcome: RESOLVING_ACTIONS[action] ?? null,
  };
  const noUserChange: UserPatch = { fields: {}, incrementWarnings: false };

  switch (action) {
    case "start_review":
      return { ok: true, report: { status: "reviewing", outcome: null }, user: noUserChange, audit };

    case "note":
      return { ok: true, report: null, user: noUserChange, audit };

    case "dismiss":
      return { ok: true, report: { status: "resolved", outcome: "dismissed" }, user: noUserChange, audit };

    case "warn":
      return {
        ok: true,
        report: onReport ? { status: "resolved", outcome: "warned" } : null,
        user: { fields: {}, incrementWarnings: true },
        audit,
      };

    case "suspend":
      if (standing.status === "banned") {
        return { ok: false, error: "This account is banned. Unban it first." };
      }
      return {
        ok: true,
        report: onReport ? { status: "resolved", outcome: "suspended" } : null,
        user: {
          fields: {
            accountStatus: "suspended",
            suspension: {
              // What the user reads, kept apart from the admin's internal reason.
              reason: value.userMessage ?? "",
              internalNote: value.reason ?? "",
              at: now,
              by: admin.email,
              expiresAt: value.expiresAt,
            },
          },
          incrementWarnings: false,
        },
        audit,
      };

    case "ban":
      return {
        ok: true,
        report: onReport ? { status: "resolved", outcome: "banned" } : null,
        user: {
          fields: {
            accountStatus: "banned",
            // The app's older checks still read `banned`.
            banned: true,
            suspension: {
              reason: value.userMessage ?? "",
              internalNote: value.reason ?? "",
              at: now,
              by: admin.email,
              expiresAt: null,
            },
          },
          incrementWarnings: false,
        },
        audit,
      };

    case "unban":
      if (archived) {
        // `banned` is also how a deleted account is marked. Clearing it here
        // would let a deleted account back in half-restored.
        return { ok: false, error: "This account was deleted. Restore it from the Archive instead." };
      }
      if (standing.status !== "banned") return { ok: false, error: "This account isn't banned." };
      return {
        ok: true,
        report: null,
        user: { fields: { accountStatus: "active", banned: false, suspension: null }, incrementWarnings: false },
        audit,
      };

    case "unsuspend":
      if (standing.status !== "suspended") return { ok: false, error: "This account isn't suspended." };
      return {
        ok: true,
        report: null,
        user: { fields: { accountStatus: "active", suspension: null }, incrementWarnings: false },
        audit,
      };

    case "disable_auto_calls":
      return {
        ok: true,
        report: onReport ? { status: "resolved", outcome: "auto_calls_disabled" } : null,
        user: {
          fields: {
            autoCallsDisabled: true,
            autoCallsDisabledMessage: value.userMessage ?? "",
          },
          incrementWarnings: false,
        },
        audit,
      };

    case "enable_auto_calls":
      return {
        ok: true,
        report: null,
        user: {
          fields: { autoCallsDisabled: false, autoCallsDisabledMessage: null },
          incrementWarnings: false,
        },
        audit,
      };
  }
}

// ─── Who may do it ───────────────────────────────────────────────────────────

/**
 * Moderation lives inside Super Admin, so for now only a super_admin may act.
 * One function, so widening it later (letting `admin` dismiss or add notes, say)
 * is a change here and not a hunt through the routes.
 */
export function canModerate(role: string | null | undefined): boolean {
  return role === "super_admin";
}
