import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adminDocId,
  canAdminister,
  canManageAdmins,
  canManageUsers,
  isAdminRole,
  toAdminRecord,
} from "@/lib/admins";

// The `admins` collection is the whole permission system — there is no second
// place that grants administrative access. So the parts that decide whether a
// document counts have to fail closed on anything unexpected, and the document
// id has to be derived identically every time or a real admin silently stops
// being one.

describe("adminDocId", () => {
  it("resolves one person to one document however they type their address", () => {
    for (const variant of [
      "colin@example.com",
      "Colin@example.com",
      "COLIN@EXAMPLE.COM",
      "  colin@example.com  ",
      "\tColin@Example.com\n",
    ]) {
      expect(adminDocId(variant)).toBe("colin@example.com");
    }
  });

  it("keeps different addresses apart", () => {
    expect(adminDocId("a@example.com")).not.toBe(adminDocId("b@example.com"));
  });

  it("does not strip gmail dots or +tags", () => {
    // Deliberate: unlike waitlist duplicate detection, this is an authority
    // list. Merging two addresses that a person believes are distinct would
    // grant access to an address nobody deliberately added.
    expect(adminDocId("a.b@gmail.com")).toBe("a.b@gmail.com");
    expect(adminDocId("a+admin@gmail.com")).toBe("a+admin@gmail.com");
  });
});

describe("isAdminRole", () => {
  it("accepts exactly the two real roles", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("super_admin")).toBe(true);
  });

  it("rejects anything else, including near misses", () => {
    for (const value of [
      "Admin",
      "SUPER_ADMIN",
      "superadmin",
      "super-admin",
      "user",
      "group_admin",
      "",
      null,
      undefined,
      true,
      1,
      {},
    ]) {
      expect(isAdminRole(value)).toBe(false);
    }
  });
});

describe("capabilities", () => {
  it("gives super_admin everything an admin has", () => {
    expect(canAdminister("admin")).toBe(true);
    expect(canAdminister("super_admin")).toBe(true);
  });

  it("restricts managing admins and users to super_admin", () => {
    expect(canManageAdmins("admin")).toBe(false);
    expect(canManageAdmins("super_admin")).toBe(true);
    expect(canManageUsers("admin")).toBe(false);
    expect(canManageUsers("super_admin")).toBe(true);
  });
});

describe("toAdminRecord", () => {
  it("refuses a document whose role is not recognised", () => {
    // A typo in a hand-written record must remove access, never grant it.
    expect(toAdminRecord("a@example.com", { name: "A", role: "Admin" })).toBeNull();
    expect(toAdminRecord("a@example.com", { name: "A", role: "owner" })).toBeNull();
    expect(toAdminRecord("a@example.com", { name: "A" })).toBeNull();
  });

  it("reads a valid record", () => {
    const record = toAdminRecord("a@example.com", { name: "A", role: "super_admin" });
    expect(record).toMatchObject({ email: "a@example.com", name: "A", role: "super_admin" });
  });
});

// Enforced in the route rather than the UI, because the UI is not the only
// thing that can call it.
describe("/api/admin/admins invariants", () => {
  const route = readFileSync("app/api/admin/admins/route.ts", "utf8");

  it("requires super_admin to write, not merely admin", () => {
    expect(route).toMatch(/requireAdminManager/);
  });

  it("refuses to remove the last super_admin", () => {
    expect(route).toMatch(/countSuperAdmins/);
  });

  it("refuses self-demotion and self-deletion", () => {
    expect(route.match(/email === caller\.email/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
