import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  getReportDetail,
  getUserModeration,
  loadAllReports,
  ModerationRefusal,
  pairBlockBetween,
  performReportAction,
  performUserAction,
} from "@/lib/moderation-server";

// Against the Firestore emulator (see vitest.emulator.config.mts).

const NOW = new Date("2026-10-02T12:00:00.000Z");
const ADMIN = { uid: "adm1", email: "colin@example.com", name: "Colin" };

let db: Firestore;

beforeAll(() => {
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-moderation" });
  db = getFirestore(app);
});

async function wipe() {
  for (const col of ["reports", "user", "blocks", "moderation_actions"]) {
    const snap = await db.collection(col).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

function report(id: string, over: Record<string, unknown> = {}) {
  return db.collection("reports").doc(id).set({
    reporter: { uid: "sarah", name: "Sarah", username: "sarah", systemName: "calm_owl_1" },
    reported: { uid: "john", name: "John", username: "john", systemName: "noble_fox_2" },
    reporterUid: "sarah",
    reportedUid: "john",
    reason: "abusive_harassing",
    details: "shouted",
    callId: "c1",
    callType: "random",
    source: "post_call",
    status: "new",
    outcome: null,
    createdAt: Timestamp.fromDate(new Date("2026-10-02T09:00:00Z")),
    notes: [],
    actions: [],
    ...over,
  });
}

beforeEach(async () => {
  await wipe();
  await db.collection("user").doc("john").set({ name: "John", username: "john", systemName: "noble_fox_2", email: "j@x.com" });
  await db.collection("user").doc("sarah").set({ name: "Sarah", username: "sarah", systemName: "calm_owl_1" });
  await report("r1");
});

const act = (id: string, body: Record<string, unknown>) => performReportAction(db, id, ADMIN, body, NOW);

describe("performReportAction", () => {
  it("opening/reading a report changes nothing; Start review moves New to Reviewing", async () => {
    const before = await getReportDetail(db, "r1");
    expect(before?.report.status).toBe("new");
    const after = await getReportDetail(db, "r1");
    expect(after?.report.status).toBe("new");

    const started = await act("r1", { action: "start_review" });
    expect(started.status).toBe("reviewing");
    const doc = (await db.collection("reports").doc("r1").get()).data()!;
    expect(doc.reviewStartedBy).toBe("colin@example.com");
  });

  it("dismiss resolves the report, touches no account, and is audited", async () => {
    const r = await act("r1", { action: "dismiss", reason: "no evidence" });
    expect(r.status).toBe("resolved");
    expect(r.outcome).toBe("dismissed");
    expect(r.resolvedBy).toBe("colin@example.com");
    const john = (await db.collection("user").doc("john").get()).data()!;
    expect(john.accountStatus).toBeUndefined();
    expect(john.warnings).toBeUndefined();
    const audit = await db.collection("moderation_actions").get();
    expect(audit.size).toBe(1);
    expect(audit.docs[0].data()).toMatchObject({
      reportId: "r1", targetUid: "john", action: "dismiss", adminEmail: "colin@example.com", reason: "no evidence",
    });
  });

  it("warn adds to the account's warning count each time", async () => {
    await act("r1", { action: "warn", reason: "first" });
    await report("r2");
    await act("r2", { action: "warn", reason: "second" });
    const john = (await db.collection("user").doc("john").get()).data()!;
    expect(john.warnings).toBe(2);
  });

  it("suspend stores the end date as a Timestamp, the user message and the internal note apart", async () => {
    await act("r1", {
      action: "suspend", reason: "internal: pattern", userMessage: "Repeated complaints", duration: { preset: "7d" },
    });
    const john = (await db.collection("user").doc("john").get()).data()!;
    expect(john.accountStatus).toBe("suspended");
    expect(john.suspension.reason).toBe("Repeated complaints");
    expect(john.suspension.internalNote).toBe("internal: pattern");
    expect(john.suspension.by).toBe("colin@example.com");
    expect(john.suspension.expiresAt).toBeInstanceOf(Timestamp);
    expect(john.suspension.expiresAt.toDate().getTime()).toBe(NOW.getTime() + 7 * 24 * 3600 * 1000);
    expect((await getUserModeration(db, "john")).standing.status).toBe("suspended");
  });

  it("ban sets accountStatus and the legacy banned flag", async () => {
    await act("r1", { action: "ban", reason: "threats", confirm: true });
    const john = (await db.collection("user").doc("john").get()).data()!;
    expect(john).toMatchObject({ accountStatus: "banned", banned: true });
  });

  it("a ban without the confirmation step is refused and nothing is written", async () => {
    await expect(act("r1", { action: "ban", reason: "threats" })).rejects.toBeInstanceOf(ModerationRefusal);
    expect((await db.collection("user").doc("john").get()).data()!.banned).toBeUndefined();
    expect((await db.collection("moderation_actions").get()).size).toBe(0);
    expect((await getReportDetail(db, "r1"))?.report.status).toBe("new");
  });

  it("disable auto calls leaves the account usable", async () => {
    const r = await act("r1", { action: "disable_auto_calls", reason: "harassment on random", userMessage: "Paused" });
    expect(r.outcome).toBe("auto_calls_disabled");
    const john = (await db.collection("user").doc("john").get()).data()!;
    expect(john.autoCallsDisabled).toBe(true);
    expect(john.autoCallsDisabledMessage).toBe("Paused");
    expect(john.accountStatus).toBeUndefined();
  });

  it("a note is kept on the report without changing its status", async () => {
    const r = await act("r1", { action: "note", note: "spoke to Sarah" });
    expect(r.status).toBe("new");
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatchObject({ text: "spoke to Sarah", adminEmail: "colin@example.com" });
  });

  it("a resolved report takes notes but no further action", async () => {
    await act("r1", { action: "dismiss" });
    await expect(act("r1", { action: "ban", reason: "x", confirm: true })).rejects.toThrow(/resolved/);
    const r = await act("r1", { action: "note", note: "later context" });
    expect(r.status).toBe("resolved");
    expect(r.notes).toHaveLength(1);
  });

  it("the action trail on the report accumulates, in order", async () => {
    await act("r1", { action: "start_review" });
    await act("r1", { action: "note", note: "n" });
    await act("r1", { action: "warn", reason: "w" });
    const r = (await getReportDetail(db, "r1"))!.report;
    expect(r.actions.map((a) => a.action)).toEqual(["start_review", "note", "warn"]);
  });

  it("cannot warn or ban an account that no longer exists, but can still dismiss it", async () => {
    await db.collection("user").doc("john").delete();
    await expect(act("r1", { action: "warn", reason: "x" })).rejects.toThrow(/no longer exists/);
    const r = await act("r1", { action: "dismiss", reason: "account gone" });
    expect(r.status).toBe("resolved");
  });

  it("an admin cannot take action against their own account via a report", async () => {
    await report("self", { reported: { uid: "adm1", name: "Colin" }, reportedUid: "adm1" });
    await db.collection("user").doc("adm1").set({ name: "Colin" });
    await expect(act("self", { action: "warn", reason: "x" })).rejects.toThrow(/own account/);
  });

  it("reports that don't exist, or name nobody, are refused cleanly", async () => {
    await expect(act("nope", { action: "dismiss" })).rejects.toMatchObject({ status: 404 });
    await db.collection("reports").doc("blank").set({ status: "new" });
    await expect(act("blank", { action: "dismiss" })).rejects.toThrow(/doesn't name/);
  });

  it("works on an old in-call-flag report in the same queue", async () => {
    await db.collection("reports").doc("old").set({
      reporterId: "sarah", reporterName: "Sarah", reportedUserId: "john", reportedUserName: "John",
      roomId: "room1", status: "pending", timestamp: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
    });
    const r = await act("old", { action: "warn", reason: "legacy report" });
    expect(r.status).toBe("resolved");
    expect(r.outcome).toBe("warned");
    expect(r.legacy).toBe(true);
  });
});

describe("history and the queue", () => {
  it("History reads '3 reports, 2 abusive, 1 sexual, from 3 different users'", async () => {
    await report("r2", { reporter: { uid: "u2", name: "U2" }, reporterUid: "u2" });
    await report("r3", { reporter: { uid: "u3", name: "U3" }, reporterUid: "u3", reason: "sexual_inappropriate" });
    const d = (await getReportDetail(db, "r1"))!;
    expect(d.summary.total).toBe(3);
    expect(d.summary.byReason.map((b) => [b.reason, b.count])).toEqual([
      ["abusive_harassing", 2], ["sexual_inappropriate", 1],
    ]);
    expect(d.summary.distinctReporters).toBe(3);
    expect(d.history.map((h) => h.id).sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("history counts reports of BOTH shapes against the same uid", async () => {
    await db.collection("reports").doc("old").set({ reporterId: "x", reportedUserId: "john", status: "pending" });
    expect((await getReportDetail(db, "r1"))!.summary.total).toBe(2);
  });

  it("the queue sorts newest first and undated last", async () => {
    await report("newer", { createdAt: Timestamp.fromDate(new Date("2026-10-03T00:00:00Z")) });
    await db.collection("reports").doc("undated").set({ reportedUserId: "john", status: "pending" });
    const ids = (await loadAllReports(db)).map((r) => r.id);
    expect(ids[0]).toBe("newer");
    expect(ids[ids.length - 1]).toBe("undated");
  });

  it("shows whether the pair is already blocked, from either side", async () => {
    expect((await getReportDetail(db, "r1"))!.pairBlock.blocked).toBe(false);
    await db.collection("blocks").doc("sarah_john").set({ blockerUid: "sarah", blockedUid: "john", kind: "report" });
    const p = await pairBlockBetween(db, "sarah", "john");
    expect(p).toEqual({ blocked: true, by: ["reporter"], kind: "report" });
    await db.collection("blocks").doc("john_sarah").set({ blockerUid: "john", blockedUid: "sarah", kind: "block" });
    expect((await pairBlockBetween(db, "sarah", "john")).by).toEqual(["reporter", "reported"]);
  });

  it("a report still resolves after the reported account is deleted, and the record remains", async () => {
    await db.collection("user").doc("john").delete();
    const d = (await getReportDetail(db, "r1"))!;
    expect(d.reported.identity.deleted).toBe(true);
    expect(d.reported.identity.name).toBe("John"); // from the snapshot taken at report time
    expect((await loadAllReports(db)).map((r) => r.id)).toContain("r1");
  });
});

describe("performUserAction (outside any report)", () => {
  beforeEach(async () => {
    await db.collection("user").doc("john").set({ name: "John", accountStatus: "banned", banned: true });
  });
  const userAct = (body: Record<string, unknown>) => performUserAction(db, "john", ADMIN, body, NOW);

  it("unban restores the account and is audited with no report", async () => {
    const m = await userAct({ action: "unban", reason: "appeal upheld" });
    expect(m.standing.status).toBe("active");
    const john = (await db.collection("user").doc("john").get()).data()!;
    expect(john.banned).toBe(false);
    expect(john.suspension).toBeNull();
    const audit = (await db.collection("moderation_actions").get()).docs[0].data();
    expect(audit).toMatchObject({ reportId: null, action: "unban", targetUid: "john" });
  });

  it("never unbans a deleted/archived account", async () => {
    await db.collection("user").doc("john").set({ name: "John", banned: true, archived: true });
    await expect(userAct({ action: "unban", reason: "x" })).rejects.toThrow(/Archive/);
    expect((await db.collection("user").doc("john").get()).data()!.banned).toBe(true);
  });

  it("report-only actions are refused here", async () => {
    await expect(userAct({ action: "dismiss" })).rejects.toThrow(/applies to a report/);
    await expect(userAct({ action: "note", note: "x" })).rejects.toThrow(/applies to a report/);
  });

  it("unsuspend then enable auto calls round-trip", async () => {
    await db.collection("user").doc("john").set({ name: "John", accountStatus: "suspended", suspension: {}, autoCallsDisabled: true, autoCallsDisabledMessage: "x" });
    await userAct({ action: "unsuspend", reason: "served" });
    await userAct({ action: "enable_auto_calls", reason: "ok" });
    const john = (await db.collection("user").doc("john").get()).data()!;
    expect(john.accountStatus).toBe("active");
    expect(john.autoCallsDisabled).toBe(false);
    expect(john.autoCallsDisabledMessage).toBeNull();
  });

  it("the user's moderation summary lists reports received and made, warnings and the audit trail", async () => {
    await db.collection("user").doc("john").set({ name: "John", warnings: 1, reportsReceived: 1, reportsMade: 0 });
    await report("r5", { reporter: { uid: "john", name: "John" }, reporterUid: "john", reported: { uid: "sarah", name: "Sarah" }, reportedUid: "sarah" });
    await userAct({ action: "warn", reason: "w" });
    const m = await getUserModeration(db, "john");
    expect(m.received.map((r) => r.id)).toEqual(["r1"]);
    expect(m.made.map((r) => r.id)).toEqual(["r5"]);
    expect(m.audit).toHaveLength(1);
    expect(m.audit[0].action).toBe("warn");
    expect(m.standing.warnings).toBe(2);
  });

  it("a user with no account doc is refused", async () => {
    await expect(performUserAction(db, "ghost", ADMIN, { action: "warn", reason: "x" }, NOW)).rejects.toMatchObject({ status: 404 });
  });
});
