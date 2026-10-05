// Regression tests for the three account-ownership findings behind PR #3.
// Principle: only a verified Firebase credential establishes account ownership.
// See docs/phone-first-auth.md ("Security findings").

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isAppProfile, pickPhoneMatch } from "@/lib/account-resolve";

const root = path.join(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    const full = path.join(root, rel);
    if (statSync(full).isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

// ─── Finding 1: systemName (+ email) must never link or merge accounts ───────

describe("finding 1: systemName is not proof of ownership", () => {
  it("/api/account/link is retired and ignores a systemName + email body", async () => {
    const { POST } = await import("@/app/api/account/link/route");
    const res = await (POST as unknown as (req: Request) => Promise<Response>)(
      new Request("http://x/api/account/link", {
        method: "POST",
        headers: { authorization: "Bearer anything" },
        body: JSON.stringify({ supportCode: "swift-falcon-342", emailVerification: "victim@example.com" }),
      })
    );
    expect(res.status).toBe(410);
    expect((await res.json()).status).toBe("retired");
  });

  it("the route has no database access, no transaction and no document delete", () => {
    const src = read("app/api/account/link/route.ts");
    expect(src).not.toMatch(/firebase-admin|runTransaction|\.delete\(|\.update\(|\.set\(/);
  });

  it("no website code looks an account up by systemName any more", () => {
    const offenders = [...sourceFiles("app"), ...sourceFiles("hooks"), ...sourceFiles("components"), ...sourceFiles("lib")]
      .filter((f) => /where\(\s*["']systemName["']/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("only /api/account/resolve writes link aliases, and only from a verified token", () => {
    const writers = [...sourceFiles("app"), ...sourceFiles("hooks"), ...sourceFiles("components"), ...sourceFiles("lib")]
      .filter((f) => /linkedWebUids?\s*[:=]\s*(FieldValue|webUid)|arrayUnion\(webUid\)/.test(read(f)));
    expect(writers).toEqual(["app/api/account/resolve/route.ts"]);
  });
});

// ─── Finding 2: an email address is not proof of identity ────────────────────

describe("finding 2: a shared email does not identify an account", () => {
  it("the sign-in path never looks a profile up by email", () => {
    for (const f of ["hooks/useAuth.ts", "components/auth/SignInChoices.tsx", "app/api/account/resolve/route.ts"]) {
      expect(read(f), f).not.toMatch(/where\(\s*["']email["']/);
    }
  });

  it("the profile resolver does not read an email from the token", () => {
    expect(read("app/api/account/resolve/route.ts")).not.toMatch(/decoded\.email|\.email\b/);
  });
});

// ─── Finding 3: an unverified phone number is not proof of ownership ─────────

describe("finding 3: only a Firebase-verified phone proves ownership", () => {
  const app = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    data: { phoneNumber: "+447900000001", systemName: `name-${id}`, ...extra },
  });
  const webStub = (id: string) => ({ id, data: { phoneNumber: "+447900000001", role: "user" } });

  it("a profile with a typed-in number and no systemName cannot be matched", () => {
    expect(isAppProfile(webStub("squatter").data)).toBe(false);
    expect(pickPhoneMatch([webStub("squatter")])).toBeNull();
  });

  it("a squatter's web profile cannot shadow the real app profile", () => {
    expect(pickPhoneMatch([webStub("squatter"), app("real")])?.id).toBe("real");
  });

  it("two app profiles with the same number are ambiguous, so nothing is matched", () => {
    expect(pickPhoneMatch([app("a"), app("b")])).toBeNull();
  });

  it("one app profile is matched", () => {
    expect(pickPhoneMatch([app("a")])?.id).toBe("a");
    expect(pickPhoneMatch([])).toBeNull();
  });

  it("the resolver takes the number from the verified token and uses the picker", () => {
    const src = read("app/api/account/resolve/route.ts");
    expect(src).toMatch(/decoded\.phone_number/);
    expect(src).toMatch(/pickPhoneMatch/);
    expect(src).not.toMatch(/queryFirst\(db,\s*"phoneNumber"/);
  });

  it("the website no longer saves a typed phone number onto a profile", () => {
    const src = read("components/auth/SignInChoices.tsx");
    expect(src).not.toMatch(/add_phone|setPhoneNumberOnProfile/);
    // The only phoneNumber write is the number Firebase just verified (user.phoneNumber).
    const writes = src.match(/phoneNumber\s*:[^,\n}]*/g) ?? [];
    for (const w of writes) expect(w).toMatch(/user\.phoneNumber/);
  });
});

// The invite route used to key an `invites` record by a client-supplied number.
describe("finding 3: /api/invite/process trusts only the verified number", () => {
  const batchSet = vi.fn();

  beforeEach(() => {
    batchSet.mockReset();
    vi.resetModules();
  });

  async function run(tokenPhone: string | undefined, bodyPhone: string) {
    const snap = (docs: unknown[]) => ({ empty: docs.length === 0, docs });
    const chain = (docs: unknown[]) => {
      const q: Record<string, unknown> = {};
      q.where = () => q;
      q.limit = () => q;
      q.get = async () => snap(docs);
      return q;
    };
    const inviter = { id: "inviter1", data: () => ({ name: "Inviter", username: "inv" }) };
    const db = {
      collection: (name: string) => ({
        ...chain(name === "user" ? [inviter] : []),
        doc: () => ({ get: async () => ({ exists: true, data: () => ({}) }) }),
      }),
      batch: () => ({ set: batchSet, commit: async () => undefined }),
    };
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminServices: () => ({
        db,
        adminAuth: { verifyIdToken: async () => ({ uid: "invitee1", ...(tokenPhone ? { phone_number: tokenPhone } : {}) }) },
      }),
    }));
    const { POST } = await import("@/app/api/invite/process/route");
    return (POST as unknown as (req: Request) => Promise<Response>)(
      new Request("http://x/api/invite/process", {
        method: "POST",
        headers: { authorization: "Bearer t" },
        body: JSON.stringify({ inviterUsername: "inv", inviteeUid: "invitee1", inviteePhone: bodyPhone }),
      })
    );
  }

  const invitesWritten = () =>
    batchSet.mock.calls.filter(([, data]) => (data as { method?: string }).method === "web_signup");

  it("ignores a body phone that is not the verified one", async () => {
    const res = await run("+447900000001", "+447900000999");
    expect(res.status).toBe(200);
    expect(invitesWritten()).toHaveLength(0);
  });

  it("ignores any body phone when the token has no verified phone", async () => {
    const res = await run(undefined, "+447900000999");
    expect(res.status).toBe(200);
    expect(invitesWritten()).toHaveLength(0);
  });

  it("writes the phone-keyed invite only for the verified number", async () => {
    await run("+447900000001", "+447900000001");
    const written = invitesWritten();
    expect(written).toHaveLength(1);
    expect((written[0][1] as { phoneNumber: string }).phoneNumber).toBe("+447900000001");
  });
});
