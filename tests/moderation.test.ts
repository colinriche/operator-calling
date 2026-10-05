import { describe, expect, it } from "vitest";
import {
  canModerate,
  countReports,
  filterReports,
  normaliseReport,
  planAction,
  previousReportCounts,
  REPORT_REASONS,
  sortNewestFirst,
  standingFromUser,
  summariseHistory,
  suspensionEnd,
  validateActionInput,
  type ModerationAction,
  type ReportView,
  type Standing,
} from "@/lib/moderation-model";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const ADMIN = { uid: "adm1", email: "colin@example.com", name: "Colin" };

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

function newDoc(over: Record<string, unknown> = {}) {
  return {
    reporter: { uid: "sarah", name: "Sarah", username: "sarah", systemName: "calm_owl_1" },
    reported: { uid: "john", name: "John", username: "john", systemName: "noble_fox_2" },
    reporterUid: "sarah",
    reportedUid: "john",
    reason: "abusive_harassing",
    details: "shouted at me",
    createdAt: ts("2026-10-02T09:00:00.000Z"),
    callId: "call-1",
    callType: "random",
    source: "post_call",
    status: "new",
    outcome: null,
    notes: [],
    actions: [],
    ...over,
  };
}

const view = (id: string, over: Record<string, unknown> = {}): ReportView =>
  normaliseReport(id, newDoc(over));

const active: Standing = standingFromUser({}, NOW);
const validated = (raw: Record<string, unknown>) => {
  const v = validateActionInput(raw, NOW);
  if (!v.ok) throw new Error(v.error);
  return v.value;
};

// ── normalising ──────────────────────────────────────────────────────────────
describe("normaliseReport", () => {
  it("reads a new-schema report with all four identifiers on each side", () => {
    const r = normaliseReport("r1", newDoc());
    expect(r.reporter).toEqual({ uid: "sarah", name: "Sarah", username: "sarah", systemName: "calm_owl_1" });
    expect(r.reported).toEqual({ uid: "john", name: "John", username: "john", systemName: "noble_fox_2" });
    expect(r.reasonLabel).toBe("Abusive or harassing behavior");
    expect(r.callType).toBe("random");
    expect(r.status).toBe("new");
    expect(r.legacy).toBe(false);
    expect(r.createdAt).toBe("2026-10-02T09:00:00.000Z");
  });

  it("reads an old in-call-flag report so it can sit in the same queue", () => {
    const r = normaliseReport("old", {
      reporterId: "a",
      reporterName: "Alice",
      reportedUserId: "b",
      reportedUserName: "Bob",
      roomId: "room-7",
      timestamp: ts("2026-09-01T10:00:00.000Z"),
      status: "pending",
    });
    expect(r.legacy).toBe(true);
    expect(r.reporter.uid).toBe("a");
    expect(r.reported.uid).toBe("b");
    expect(r.reported.name).toBe("Bob");
    expect(r.reasonLabel).toBe("Flagged during a call");
    expect(r.callId).toBe("room-7");
    expect(r.callType).toBe("unknown");
    expect(r.status).toBe("new");
    expect(r.createdAt).toBe("2026-09-01T10:00:00.000Z");
  });

  it("maps the old statuses onto the new pipeline", () => {
    expect(normaliseReport("a", { status: "pending", reportedUserId: "x" }).status).toBe("new");
    expect(normaliseReport("b", { status: "reviewed", reportedUserId: "x" }).status).toBe("resolved");
    const dismissed = normaliseReport("c", { status: "dismissed", reportedUserId: "x" });
    expect(dismissed.status).toBe("resolved");
    expect(dismissed.outcome).toBe("dismissed");
    expect(normaliseReport("d", { status: "reviewed", actionTaken: "banned", reportedUserId: "x" }).outcome).toBe("banned");
  });

  it("an unknown reason id shows as itself rather than disappearing", () => {
    expect(normaliseReport("e", newDoc({ reason: "weird_new_reason" })).reasonLabel).toBe("weird_new_reason");
  });

  it("every app reason has a label", () => {
    expect(Object.keys(REPORT_REASONS)).toHaveLength(7);
    for (const id of Object.keys(REPORT_REASONS)) {
      expect(normaliseReport("x", newDoc({ reason: id })).reasonLabel).not.toBe(id);
    }
  });

  it("survives a document with almost nothing in it", () => {
    const r = normaliseReport("empty", {});
    expect(r.reported.uid).toBe("");
    expect(r.notes).toEqual([]);
    expect(r.status).toBe("new");
  });

  it("reads notes and the action trail", () => {
    const r = normaliseReport("n", newDoc({
      notes: [{ adminUid: "a", adminEmail: "a@x.com", adminName: "A", text: "called them", at: ts("2026-10-02T10:00:00.000Z") }],
      actions: [{ action: "warn", adminUid: "a", adminEmail: "a@x.com", adminName: "A", reason: "first offence", at: ts("2026-10-02T11:00:00.000Z") }],
    }));
    expect(r.notes[0].text).toBe("called them");
    expect(r.actions[0]).toMatchObject({ action: "warn", reason: "first offence" });
  });
});

// ── queue ────────────────────────────────────────────────────────────────────
describe("the queue", () => {
  const reports = [
    view("a", { status: "new" }),
    view("b", { status: "reviewing" }),
    view("c", { status: "resolved", outcome: "dismissed" }),
    view("d", { status: "new", reported: { uid: "mary", name: "Mary" }, reportedUid: "mary" }),
  ];

  it("counts by status, and the badge is new + reviewing", () => {
    expect(countReports(reports)).toEqual({ new: 2, reviewing: 1, resolved: 1, all: 4, unresolved: 3 });
  });

  it("filters New / Reviewing / Resolved / All", () => {
    expect(filterReports(reports, "new").map((r) => r.id)).toEqual(["a", "d"]);
    expect(filterReports(reports, "reviewing").map((r) => r.id)).toEqual(["b"]);
    expect(filterReports(reports, "resolved").map((r) => r.id)).toEqual(["c"]);
    expect(filterReports(reports, "all")).toHaveLength(4);
  });

  it("shows how many OTHER reports there are against the same account", () => {
    const prev = previousReportCounts(reports);
    expect(prev.get("a")).toBe(2); // john has a, b, c
    expect(prev.get("d")).toBe(0); // mary has only d
  });

  it("sorts newest first, undated last", () => {
    const rows = sortNewestFirst([
      { id: "old", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "none", createdAt: null },
      { id: "new", createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["new", "old", "none"]);
  });
});

// ── history ──────────────────────────────────────────────────────────────────
describe("summariseHistory", () => {
  it("reads like Colin's example: 3 reports, 2 abusive, 1 sexual, from 3 users", () => {
    const h = summariseHistory([
      view("1", { reason: "abusive_harassing", reporter: { uid: "u1" } }),
      view("2", { reason: "abusive_harassing", reporter: { uid: "u2" } }),
      view("3", { reason: "sexual_inappropriate", reporter: { uid: "u3" } }),
    ]);
    expect(h.total).toBe(3);
    expect(h.byReason).toEqual([
      { reason: "abusive_harassing", label: "Abusive or harassing behavior", count: 2 },
      { reason: "sexual_inappropriate", label: "Sexual or inappropriate behavior", count: 1 },
    ]);
    expect(h.distinctReporters).toBe(3);
  });

  it("one person reporting three times is one reporter", () => {
    const h = summariseHistory([view("1"), view("2"), view("3")]);
    expect(h.total).toBe(3);
    expect(h.distinctReporters).toBe(1);
  });

  it("no reports is an empty summary, not an error", () => {
    expect(summariseHistory([])).toEqual({ total: 0, byReason: [], distinctReporters: 0 });
  });
});

// ── standing ─────────────────────────────────────────────────────────────────
describe("standingFromUser", () => {
  it("is active for an ordinary or missing user", () => {
    expect(standingFromUser(null, NOW).status).toBe("active");
    expect(standingFromUser({ name: "x" }, NOW).status).toBe("active");
  });

  it("banned by either field", () => {
    expect(standingFromUser({ banned: true }, NOW).status).toBe("banned");
    expect(standingFromUser({ accountStatus: "banned" }, NOW).status).toBe("banned");
  });

  it("a live suspension carries its dates, the user message and the internal note", () => {
    const s = standingFromUser({
      accountStatus: "suspended",
      suspension: {
        reason: "Repeated complaints",
        internalNote: "3 reports in a week",
        by: "colin@example.com",
        at: ts("2026-10-01T00:00:00.000Z"),
        expiresAt: ts("2026-10-09T00:00:00.000Z"),
      },
    }, NOW);
    expect(s.status).toBe("suspended");
    expect(s.suspendedUntil).toBe("2026-10-09T00:00:00.000Z");
    expect(s.userMessage).toBe("Repeated complaints");
    expect(s.internalNote).toBe("3 reports in a week");
    expect(s.suspendedBy).toBe("colin@example.com");
  });

  it("an expired suspension reads as active, as the app does", () => {
    const s = standingFromUser({
      accountStatus: "suspended",
      suspension: { expiresAt: ts("2026-10-01T00:00:00.000Z") },
    }, NOW);
    expect(s.status).toBe("active");
  });

  it("an open-ended suspension stays suspended", () => {
    expect(standingFromUser({ accountStatus: "suspended", suspension: {} }, NOW).status).toBe("suspended");
  });

  it("carries warnings, auto-calls and the report counters", () => {
    const s = standingFromUser({
      warnings: 2, autoCallsDisabled: true, autoCallsDisabledMessage: "paused",
      reportsReceived: 3, reportsMade: 1,
    }, NOW);
    expect(s).toMatchObject({ warnings: 2, autoCallsDisabled: true, autoCallsMessage: "paused", reportsReceived: 3, reportsMade: 1 });
  });
});

// ── validating input ─────────────────────────────────────────────────────────
describe("validateActionInput", () => {
  it("rejects nonsense and unknown actions", () => {
    expect(validateActionInput(null, NOW).ok).toBe(false);
    expect(validateActionInput({ action: "nuke" }, NOW).ok).toBe(false);
  });

  it("every action that touches an account needs a reason for the audit trail", () => {
    const needsReason: ModerationAction[] = ["warn", "suspend", "ban", "unban", "unsuspend", "disable_auto_calls", "enable_auto_calls"];
    for (const action of needsReason) {
      const r = validateActionInput({ action, duration: { preset: "7d" }, confirm: true }, NOW);
      expect(r.ok, action).toBe(false);
    }
  });

  it("dismiss and start review do not need a reason", () => {
    expect(validateActionInput({ action: "dismiss" }, NOW).ok).toBe(true);
    expect(validateActionInput({ action: "start_review" }, NOW).ok).toBe(true);
  });

  it("a note must have text", () => {
    expect(validateActionInput({ action: "note", note: "  " }, NOW).ok).toBe(false);
    expect(validateActionInput({ action: "note", note: "spoke to them" }, NOW).ok).toBe(true);
  });

  it("a ban needs the confirmation step", () => {
    expect(validateActionInput({ action: "ban", reason: "threats" }, NOW).ok).toBe(false);
    expect(validateActionInput({ action: "ban", reason: "threats", confirm: true }, NOW).ok).toBe(true);
  });

  it("a suspension needs a duration", () => {
    expect(validateActionInput({ action: "suspend", reason: "r" }, NOW).ok).toBe(false);
  });

  it("trims text and caps its length", () => {
    const v = validated({ action: "warn", reason: `  ${"x".repeat(5000)}  ` });
    expect(v.reason).toHaveLength(2000);
  });
});

describe("suspensionEnd", () => {
  const hours = (e: { ok: true; expiresAt: Date }) => (e.expiresAt.getTime() - NOW.getTime()) / 3600000;

  it("offers 24 hours, 7 days and 30 days", () => {
    for (const [preset, h] of [["24h", 24], ["7d", 168], ["30d", 720]] as const) {
      const e = suspensionEnd({ preset }, NOW);
      expect(e.ok).toBe(true);
      if (e.ok) expect(hours(e)).toBe(h);
    }
  });

  it("accepts a custom end date in the future", () => {
    const e = suspensionEnd({ preset: "custom", until: "2026-10-20T00:00:00.000Z" }, NOW);
    expect(e.ok).toBe(true);
  });

  it("refuses a custom date in the past, missing, or garbage", () => {
    expect(suspensionEnd({ preset: "custom", until: "2026-09-01T00:00:00.000Z" }, NOW).ok).toBe(false);
    expect(suspensionEnd({ preset: "custom" }, NOW).ok).toBe(false);
    expect(suspensionEnd({ preset: "custom", until: "tomorrow-ish" }, NOW).ok).toBe(false);
    expect(suspensionEnd(undefined, NOW).ok).toBe(false);
  });

  it("refuses a 'suspension' longer than a year: that is a ban", () => {
    const e = suspensionEnd({ preset: "custom", until: "2028-01-01T00:00:00.000Z" }, NOW);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.error).toMatch(/Ban/);
  });
});

// ── planning ─────────────────────────────────────────────────────────────────
describe("planAction", () => {
  const ctx = (over: Partial<Parameters<typeof planAction>[1]> = {}) => ({
    reportStatus: "new" as const, standing: active, now: NOW, admin: ADMIN, ...over,
  });
  const plan = (raw: Record<string, unknown>, c = ctx()) => {
    const p = planAction(validated(raw), c);
    if (!p.ok) throw new Error(p.error);
    return p;
  };

  it("opening a report changes nothing; Start review is a deliberate step", () => {
    const p = plan({ action: "start_review" });
    expect(p.report).toEqual({ status: "reviewing", outcome: null });
    expect(p.user.fields).toEqual({});
  });

  it("start review only moves New to Reviewing", () => {
    const again = planAction(validated({ action: "start_review" }), ctx({ reportStatus: "reviewing" }));
    expect(again.ok).toBe(false);
  });

  it("dismiss resolves the report and does nothing to the account", () => {
    const p = plan({ action: "dismiss", reason: "no evidence" });
    expect(p.report).toEqual({ status: "resolved", outcome: "dismissed" });
    expect(p.user.fields).toEqual({});
    expect(p.user.incrementWarnings).toBe(false);
  });

  it("warn records a warning and resolves the report", () => {
    const p = plan({ action: "warn", reason: "first offence" });
    expect(p.report).toEqual({ status: "resolved", outcome: "warned" });
    expect(p.user.incrementWarnings).toBe(true);
  });

  it("suspend stores the user-facing reason apart from the internal one, with who and when", () => {
    const p = plan({
      action: "suspend", reason: "internal: 3 reports from 3 users",
      userMessage: "Repeated complaints about your behaviour", duration: { preset: "7d" },
    });
    expect(p.report).toEqual({ status: "resolved", outcome: "suspended" });
    expect(p.user.fields.accountStatus).toBe("suspended");
    const s = p.user.fields.suspension as Record<string, unknown>;
    expect(s.reason).toBe("Repeated complaints about your behaviour");
    expect(s.internalNote).toBe("internal: 3 reports from 3 users");
    expect(s.by).toBe("colin@example.com");
    expect(s.at).toEqual(NOW);
    expect((s.expiresAt as Date).getTime()).toBe(NOW.getTime() + 7 * 24 * 3600 * 1000);
  });

  it("the internal note never lands in the field the app shows", () => {
    const p = plan({ action: "suspend", reason: "secret admin view", duration: { preset: "24h" } });
    const s = p.user.fields.suspension as Record<string, unknown>;
    expect(s.reason).toBe("");
    expect(s.internalNote).toBe("secret admin view");
  });

  it("ban sets accountStatus AND the legacy banned flag the app still reads", () => {
    const p = plan({ action: "ban", reason: "credible threats", confirm: true });
    expect(p.user.fields).toMatchObject({ accountStatus: "banned", banned: true });
    expect(p.report).toEqual({ status: "resolved", outcome: "banned" });
  });

  it("cannot suspend an account that is already banned", () => {
    const banned = standingFromUser({ banned: true }, NOW);
    const p = planAction(validated({ action: "suspend", reason: "r", duration: { preset: "7d" } }), ctx({ standing: banned }));
    expect(p.ok).toBe(false);
  });

  it("disable auto calls leaves the account usable and resolves the report", () => {
    const p = plan({ action: "disable_auto_calls", reason: "harassment on random calls", userMessage: "Paused" });
    expect(p.user.fields).toEqual({ autoCallsDisabled: true, autoCallsDisabledMessage: "Paused" });
    expect(p.user.fields.accountStatus).toBeUndefined();
    expect(p.report?.outcome).toBe("auto_calls_disabled");
  });

  it("enable auto calls clears the flag and the message", () => {
    const p = plan({ action: "enable_auto_calls", reason: "reviewed" }, ctx({ reportStatus: null }));
    expect(p.user.fields).toEqual({ autoCallsDisabled: false, autoCallsDisabledMessage: null });
  });

  it("unban from a profile restores the account", () => {
    const banned = standingFromUser({ banned: true }, NOW);
    const p = plan({ action: "unban", reason: "appeal upheld" }, ctx({ reportStatus: null, standing: banned }));
    expect(p.user.fields).toEqual({ accountStatus: "active", banned: false, suspension: null });
  });

  it("never unbans a DELETED account: banned is also how deletion is marked", () => {
    const banned = standingFromUser({ banned: true }, NOW);
    const p = planAction(validated({ action: "unban", reason: "x" }), ctx({ reportStatus: null, standing: banned, archived: true }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toMatch(/Archive/);
  });

  it("unsuspend only applies to a suspended account", () => {
    expect(planAction(validated({ action: "unsuspend", reason: "x" }), ctx({ reportStatus: null })).ok).toBe(false);
    const sus = standingFromUser({ accountStatus: "suspended", suspension: {} }, NOW);
    const p = plan({ action: "unsuspend", reason: "served" }, ctx({ reportStatus: null, standing: sus }));
    expect(p.user.fields).toEqual({ accountStatus: "active", suspension: null });
  });

  it("a resolved report accepts notes and nothing else", () => {
    const resolved = ctx({ reportStatus: "resolved" });
    expect(planAction(validated({ action: "warn", reason: "x" }), resolved).ok).toBe(false);
    expect(planAction(validated({ action: "dismiss" }), resolved).ok).toBe(false);
    expect(planAction(validated({ action: "note", note: "later context" }), resolved).ok).toBe(true);
  });

  it("an action on a user, outside any report, does not touch a report", () => {
    const p = plan({ action: "warn", reason: "x" }, ctx({ reportStatus: null }));
    expect(p.report).toBeNull();
  });

  it("every plan records the action, the reason and the outcome for the audit trail", () => {
    const p = plan({ action: "ban", reason: "threats", confirm: true });
    expect(p.audit).toMatchObject({ action: "ban", reason: "threats", outcome: "banned" });
  });
});

describe("canModerate", () => {
  it("is for super admins only, as it lives inside Super Admin", () => {
    expect(canModerate("super_admin")).toBe(true);
    expect(canModerate("admin")).toBe(false);
    expect(canModerate(null)).toBe(false);
    expect(canModerate(undefined)).toBe(false);
  });
});
