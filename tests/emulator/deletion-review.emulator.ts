import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { reviewDeletionRequest, ReviewRefusal } from "@/lib/deletion-review-server";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const ADMIN = { uid: "adm1", email: "colin@example.com", name: "Colin" };
let db: Firestore;

beforeAll(() => {
  db = getFirestore(getApps()[0] ?? initializeApp({ projectId: "demo-moderation" }));
});

beforeEach(async () => {
  const snap = await db.collection("deletionRequests").get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  await db.collection("deletionRequests").doc("u1").set({
    userId: "u1", userIds: ["u1"], authUid: "u1", email: "u@x.com", displayName: "Una", username: "una",
    requestType: "account_deletion", status: "pending", reason: "leaving", source: "app",
    requestedAt: Timestamp.fromDate(new Date("2026-08-01T00:00:00Z")),
    restoreUntil: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
  });
});

const deleted: string[] = [];
const okDelete = async (id: string) => { deleted.push(id); return { archiveId: `arch_${id}` }; };
const failDelete = async () => { throw new ReviewRefusal("Admin role required", 403); };
const review = (body: Record<string, unknown>, del = okDelete, id = "u1") =>
  reviewDeletionRequest(db, id, ADMIN, body, del, NOW);

describe("reviewDeletionRequest", () => {
  beforeEach(() => { deleted.length = 0; });

  it("delete: removes the account via the function, then marks the request completed with the archive id", async () => {
    const r = await review({ action: "delete", confirm: true, reason: "approved" });
    expect(deleted).toEqual(["u1"]);
    expect(r.status).toBe("completed");
    const doc = (await db.collection("deletionRequests").doc("u1").get()).data()!;
    expect(doc).toMatchObject({ status: "completed", archiveId: "arch_u1", completedBy: "colin@example.com", reviewedBy: "colin@example.com" });
    expect(doc.completedAt).toBeInstanceOf(Timestamp);
    expect(doc.reviewLog).toHaveLength(1);
    expect(doc.reviewLog[0]).toMatchObject({ action: "delete", adminEmail: "colin@example.com", reason: "approved" });
  });

  it("if the deletion fails the request stays pending and nothing claims it happened", async () => {
    await expect(review({ action: "delete", confirm: true }, failDelete)).rejects.toThrow(/Admin role required/);
    const doc = (await db.collection("deletionRequests").doc("u1").get()).data()!;
    expect(doc.status).toBe("pending");
    expect(doc.completedAt).toBeUndefined();
    expect(doc.reviewLog).toBeUndefined();
  });

  it("decline: nothing is deleted, the reason is internal, the message is for the person", async () => {
    const r = await review({ action: "decline", reason: "open safety review", userMessage: "We need to finish a review first" });
    expect(deleted).toEqual([]);
    expect(r.status).toBe("declined");
    const doc = (await db.collection("deletionRequests").doc("u1").get()).data()!;
    expect(doc).toMatchObject({ status: "declined", adminNote: "open safety review", userMessage: "We need to finish a review first" });
  });

  it("a request already reviewed cannot be reviewed again, and nothing is deleted twice", async () => {
    await review({ action: "delete", confirm: true });
    await expect(review({ action: "delete", confirm: true })).rejects.toThrow(/already been deleted/);
    await expect(review({ action: "decline", reason: "x" })).rejects.toThrow(/already been deleted/);
    expect(deleted).toEqual(["u1"]);
  });

  it("deleting before the person's window ends needs the extra confirmation", async () => {
    await db.collection("deletionRequests").doc("u1").set(
      { restoreUntil: Timestamp.fromDate(new Date("2026-10-20T00:00:00Z")) }, { merge: true });
    await expect(review({ action: "delete", confirm: true })).rejects.toThrow(/still withdraw/);
    expect(deleted).toEqual([]);
    const r = await review({ action: "delete", confirm: true, confirmEarly: true });
    expect(r.status).toBe("completed");
  });

  it("a withdrawn request cannot be actioned", async () => {
    await db.collection("deletionRequests").doc("u1").set({ status: "restored" }, { merge: true });
    await expect(review({ action: "delete", confirm: true })).rejects.toThrow(/withdrew/);
    expect(deleted).toEqual([]);
  });

  it("an admin cannot delete their own account", async () => {
    await db.collection("deletionRequests").doc("adm1").set({
      userId: "adm1", userIds: ["adm1"], email: "colin@example.com", status: "pending",
      restoreUntil: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
    });
    await expect(review({ action: "delete", confirm: true }, okDelete, "adm1")).rejects.toThrow(/own account/);
    expect(deleted).toEqual([]);
  });

  it("a request that doesn't exist is a 404", async () => {
    await expect(review({ action: "decline", reason: "x" }, okDelete, "nope")).rejects.toMatchObject({ status: 404 });
  });
});
