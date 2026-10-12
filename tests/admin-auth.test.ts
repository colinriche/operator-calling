import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Who is an admin must never depend on something the person can edit. A signed-in
// user could set the `email` field on their OWN user document to an admin's
// address; the gate used to read it back and treat them as that admin.

const verifyIdToken = vi.fn();
const userDoc = vi.fn();
const lookupAdmin = vi.fn();
const lookupAdminById = vi.fn();

vi.mock("@/lib/firebase-admin", () => ({
  verifyIdToken: (...a: unknown[]) => verifyIdToken(...a),
  getAdminDb: () => ({
    collection: () => ({ doc: () => ({ get: () => userDoc() }) }),
  }),
}));
vi.mock("@/lib/admins", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admins")>("@/lib/admins");
  return {
    ...actual,
    lookupAdmin: (...a: unknown[]) => lookupAdmin(...a),
    lookupAdminById: (...a: unknown[]) => lookupAdminById(...a),
  };
});

import { requireAdmin } from "@/lib/admin-auth";

const req = { headers: { get: () => "Bearer t" } } as unknown as NextRequest;
const SUPER = { role: "super_admin", name: "Colin", email: "colin@x.com" };

beforeEach(() => {
  vi.resetAllMocks();
  lookupAdmin.mockImplementation(async (email: string) => (email === "colin@x.com" ? SUPER : null));
  lookupAdminById.mockResolvedValue(null);
});

describe("requireAdmin", () => {
  it("lets in an admin whose email Firebase has verified", async () => {
    verifyIdToken.mockResolvedValue({ uid: "g1", email: "colin@x.com", decoded: { email_verified: true }, phone: null });
    userDoc.mockResolvedValue({ exists: false });
    expect((await requireAdmin(req))?.role).toBe("super_admin");
  });

  it("refuses an UNVERIFIED email that matches an admin", async () => {
    verifyIdToken.mockResolvedValue({ uid: "x", email: "colin@x.com", decoded: { email_verified: false }, phone: null });
    userDoc.mockResolvedValue({ exists: false });
    expect(await requireAdmin(req)).toBeNull();
  });

  it("refuses a phone user who put an admin's address on their own user document", async () => {
    verifyIdToken.mockResolvedValue({ uid: "attacker", email: null, decoded: {}, phone: "+447700900000" });
    userDoc.mockResolvedValue({ exists: true, id: "attacker", data: () => ({ email: "colin@x.com" }) });
    expect(await requireAdmin(req)).toBeNull();
    expect(lookupAdmin).not.toHaveBeenCalled();
  });

  it("still lets in a uid-keyed operator admin with no email", async () => {
    verifyIdToken.mockResolvedValue({ uid: "op1", email: null, decoded: {}, phone: null });
    userDoc.mockResolvedValue({ exists: true, id: "op1", data: () => ({}) });
    lookupAdminById.mockResolvedValue({ role: "admin", name: "Op", email: "" });
    expect((await requireAdmin(req))?.role).toBe("admin");
  });
});
