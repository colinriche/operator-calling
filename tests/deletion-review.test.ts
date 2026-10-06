import { describe, expect, it } from "vitest";
import { planReview, validateReview, type ReviewContext } from "@/lib/deletion-review";
import {
  normaliseDeletionStatus,
  toAdminDeletionRequestView,
  toDeletionRequestView,
} from "@/lib/account-deletion";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  status: "pending",
  restoreUntil: "2026-09-20T00:00:00.000Z", // window already ended
  userIds: ["u1"],
  email: "una@example.com",
  caller: { uid: "adm1", email: "colin@example.com" },
  now: NOW,
  ...over,
});

const valid = (raw: Record<string, unknown>) => {
  const v = validateReview(raw);
  if (!v.ok) throw new Error(v.error);
  return v.value;
};

describe("validateReview", () => {
  it("rejects nonsense and unknown actions", () => {
    expect(validateReview(null).ok).toBe(false);
    expect(validateReview({ action: "approve" }).ok).toBe(false);
  });

  it("deleting needs the confirmation step", () => {
    expect(validateReview({ action: "delete" }).ok).toBe(false);
    expect(validateReview({ action: "delete", confirm: true }).ok).toBe(true);
  });

  it("declining needs a reason for the audit trail", () => {
    expect(validateReview({ action: "decline" }).ok).toBe(false);
    expect(validateReview({ action: "decline", reason: "  " }).ok).toBe(false);
    expect(validateReview({ action: "decline", reason: "open safety review" }).ok).toBe(true);
  });

  it("trims, and caps the message the person sees", () => {
    const v = valid({ action: "decline", reason: "  r  ", userMessage: "x".repeat(900) });
    expect(v.reason).toBe("r");
    expect(v.userMessage).toHaveLength(500);
  });
});

describe("planReview", () => {
  it("an admin can delete a pending request whose window has ended", () => {
    const p = planReview(valid({ action: "delete", confirm: true }), ctx());
    expect(p).toEqual({ ok: true, kind: "delete", early: false });
  });

  it("deleting inside the person's window needs an explicit second confirmation", () => {
    const open = ctx({ restoreUntil: "2026-10-20T00:00:00.000Z" });
    const refused = planReview(valid({ action: "delete", confirm: true }), open);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.status).toBe(409);
      expect(refused.error).toMatch(/still withdraw/);
    }
    expect(planReview(valid({ action: "delete", confirm: true, confirmEarly: true }), open)).toEqual({
      ok: true, kind: "delete", early: true,
    });
  });

  it("a request with no recorded window counts as still open", () => {
    expect(planReview(valid({ action: "delete", confirm: true }), ctx({ restoreUntil: null })).ok).toBe(false);
  });

  it("only a pending request can be reviewed", () => {
    for (const status of ["restored", "declined", "completed", "processing", "failed", "held"] as const) {
      const p = planReview(valid({ action: "decline", reason: "r" }), ctx({ status }));
      expect(p.ok, status).toBe(false);
      const d = planReview(valid({ action: "delete", confirm: true }), ctx({ status }));
      expect(d.ok, status).toBe(false);
    }
  });

  it("tells the admin why: withdrawn, declined, already deleted", () => {
    const msg = (status: ReviewContext["status"]) => {
      const p = planReview(valid({ action: "decline", reason: "r" }), ctx({ status }));
      return p.ok ? "" : p.error;
    };
    expect(msg("restored")).toMatch(/withdrew/);
    expect(msg("declined")).toMatch(/already declined/);
    expect(msg("completed")).toMatch(/already been deleted/);
    expect(msg("processing")).toMatch(/being deleted/);
    expect(msg("failed")).toMatch(/failed/);
    expect(msg("held")).toMatch(/legal hold/);
  });

  it("declining works inside the window too: it deletes nothing", () => {
    const p = planReview(valid({ action: "decline", reason: "r" }), ctx({ restoreUntil: "2026-12-01T00:00:00.000Z" }));
    expect(p).toEqual({ ok: true, kind: "decline", early: false });
  });

  it("an admin cannot delete their own account, by uid or by email", () => {
    expect(planReview(valid({ action: "delete", confirm: true }), ctx({ userIds: ["u1", "adm1"] })).ok).toBe(false);
    expect(planReview(valid({ action: "delete", confirm: true }), ctx({ email: "Colin@Example.com" })).ok).toBe(false);
  });
});

describe("views", () => {
  const doc = {
    userId: "u1", userIds: ["u1"], email: "u@x.com", displayName: "Una", username: "una",
    phoneNumber: "+441", systemName: "calm_owl_1", source: "app", requestType: "account_deletion",
    status: "declined", reason: "leaving", adminNote: "INTERNAL", userMessage: "Safety review first",
    requestedAt: ts("2026-10-01T00:00:00.000Z"), restoreUntil: ts("2026-10-31T00:00:00.000Z"),
    reviewedBy: "colin@example.com", reviewedAt: ts("2026-10-02T00:00:00.000Z"),
  };

  it("an admin sees how to recognise a phone-only account, and the review history", () => {
    const v = toAdminDeletionRequestView("u1", doc);
    expect(v).toMatchObject({
      username: "una", phoneNumber: "+441", systemName: "calm_owl_1", source: "app",
      adminNote: "INTERNAL", userMessage: "Safety review first", reviewedBy: "colin@example.com", status: "declined",
    });
  });

  it("the person's own view never carries the internal note", () => {
    const v = toDeletionRequestView("u1", doc);
    expect(JSON.stringify(v)).not.toContain("INTERNAL");
    expect("adminNote" in v).toBe(false);
  });

  it("knows all four statuses, and falls back to pending for anything else", () => {
    for (const s of ["pending", "processing", "restored", "declined", "completed", "failed", "held"]) {
      expect(normaliseDeletionStatus(s)).toBe(s);
    }
    expect(normaliseDeletionStatus(undefined)).toBe("pending");
    expect(normaliseDeletionStatus("")).toBe("pending");
    // An unknown status must never be actionable.
    expect(normaliseDeletionStatus("???")).toBe("held");
    expect(normaliseDeletionStatus(undefined)).toBe("pending");
  });

  it("a website-form request (no app fields) still reads", () => {
    const v = toAdminDeletionRequestView("w1", { userId: "w1", email: "w@x.com", status: "pending", requestType: "permanent_deletion" });
    expect(v.source).toBe("website");
    expect(v.username).toBe("");
    expect(v.requestType).toBe("permanent_deletion");
  });
});
