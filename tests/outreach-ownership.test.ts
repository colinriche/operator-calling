import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdminCaller } from "@/lib/admin-auth";
import {
  canAccessRecord,
  inheritedOwner,
  matchesScope,
  ownerIdFor,
  ownerLabel,
  ownerStampFor,
  resolveScope,
  type OwnershipCaller,
} from "@/lib/waitlist/ownership";

// The permission boundary between an ordinary admin and a super admin, tested
// twice: as pure rules (lib/waitlist/ownership.ts) and through the real route
// handlers, with an in-memory Firestore and requireAdmin standing in for the
// `admins` lookup. The routes are the part that matters - a rule nobody calls
// protects nothing.

const ann: OwnershipCaller = { uid: "u-ann", email: "ann@example.com", name: "Ann", role: "admin" };
const bob: OwnershipCaller = { uid: "u-bob", email: "bob@example.com", name: "Bob", role: "admin" };
const sue: OwnershipCaller = { uid: "u-sue", email: "sue@example.com", name: "Sue", role: "super_admin" };

describe("ownership rules", () => {
  it("keys an admin by Firebase UID, never by email", () => {
    expect(ownerIdFor(ann)).toBe("u-ann");
    expect(ownerIdFor({ uid: "u-ann" })).toBe("u-ann");
  });

  it("stamps the UID, with name and email beside it for display", () => {
    expect(ownerStampFor(ann)).toEqual({
      ownerId: "u-ann",
      ownerName: "Ann",
      ownerEmail: "ann@example.com",
    });
  });

  it("ownership survives an email change, and an email alone grants nothing", () => {
    const record = { ownerId: "u-ann", ownerName: "Ann", ownerEmail: "ann@example.com" };
    // Same person, new address: same UID, still theirs.
    expect(canAccessRecord({ ...ann, email: "ann.new@example.com" }, record)).toBe(true);
    // Someone else who has Ann's old address on their account is not Ann.
    expect(canAccessRecord({ ...bob, email: "ann@example.com" }, record)).toBe(false);
    expect(resolveScope({ ...bob, email: "ann@example.com" }, "owner:u-ann")).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  describe("resolveScope", () => {
    it("starts an ordinary admin on their own work, and a super admin on everything", () => {
      expect(resolveScope(ann, null)).toEqual({
        ok: true,
        filter: { kind: "owner", ownerId: "u-ann" },
      });
      expect(resolveScope(sue, null)).toEqual({ ok: true, filter: { kind: "all" } });
    });

    it("'mine' is the caller's own work for anyone", () => {
      for (const caller of [ann, sue]) {
        expect(resolveScope(caller, "mine")).toEqual({
          ok: true,
          filter: { kind: "owner", ownerId: ownerIdFor(caller) },
        });
      }
    });

    it("refuses an ordinary admin anything wider than their own work", () => {
      for (const scope of ["all", "unassigned", "owner:u-bob", "owner:", "bogus"]) {
        expect(resolveScope(ann, scope)).toMatchObject({ ok: false, status: 403 });
      }
    });

    it("lets an ordinary admin name themselves, which is just 'mine'", () => {
      expect(resolveScope(ann, "owner:u-ann")).toEqual({
        ok: true,
        filter: { kind: "owner", ownerId: "u-ann" },
      });
    });

    it("gives a super admin all, unassigned, and any one admin", () => {
      expect(resolveScope(sue, "all")).toEqual({ ok: true, filter: { kind: "all" } });
      expect(resolveScope(sue, "unassigned")).toEqual({ ok: true, filter: { kind: "unassigned" } });
      expect(resolveScope(sue, "owner:u-bob")).toEqual({
        ok: true,
        filter: { kind: "owner", ownerId: "u-bob" },
      });
    });
  });

  describe("legacy records (no owner)", () => {
    const legacy: Record<string, unknown> = { sourceName: "old" };

    it("are unassigned, not guessed", () => {
      expect(ownerLabel(legacy)).toBe("Unassigned (legacy)");
      expect(matchesScope(legacy, { kind: "unassigned" })).toBe(true);
      expect(matchesScope(legacy, { kind: "owner", ownerId: "u-ann" })).toBe(false);
      expect(matchesScope(legacy, { kind: "all" })).toBe(true);
    });

    it("are a super admin's until assigned: an ordinary admin cannot claim one", () => {
      expect(canAccessRecord(ann, legacy)).toBe(false);
      expect(canAccessRecord(sue, legacy)).toBe(true);
      expect(canAccessRecord(ann, { ownerId: "" })).toBe(false);
    });

    it("pass no owner on to records created under them", () => {
      expect(inheritedOwner(legacy)).toEqual({});
    });
  });

  it("a record belongs to its owner, and is closed to another ordinary admin", () => {
    const mine = { ownerId: "u-ann", ownerName: "Ann" };
    expect(canAccessRecord(ann, mine)).toBe(true);
    expect(canAccessRecord(bob, mine)).toBe(false);
    expect(canAccessRecord(sue, mine)).toBe(true);
  });

  it("work a super admin adds to an admin's source stays the admin's", () => {
    expect(inheritedOwner({ ownerId: "u-ann", ownerName: "Ann", ownerEmail: "ann@example.com" })).toEqual({
      ownerId: "u-ann",
      ownerName: "Ann",
      ownerEmail: "ann@example.com",
    });
  });
});

// ─── The routes ──────────────────────────────────────────────────────────────

type Doc = Record<string, unknown>;
type Store = Record<string, Record<string, Doc>>;

let store: Store;
let nextId = 0;
let current: OwnershipCaller | null;

function snapOf(id: string, data: Doc | undefined) {
  return { id, exists: data !== undefined, data: () => data, ref: { id } };
}

function applyMerge(coll: string, id: string, data: Doc) {
  store[coll] ??= {};
  store[coll][id] = { ...(store[coll][id] ?? {}), ...data };
}

function collection(name: string) {
  const filters: Array<[string, unknown]> = [];
  const q = {
    where(field: string, _op: string, value: unknown) {
      filters.push([field, value]);
      return q;
    },
    limit: () => q,
    orderBy: () => q,
    async get() {
      const docs = Object.entries(store[name] ?? {})
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .map(([id, d]) => ({ ...snapOf(id, d), ref: { id, coll: name } }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    doc(id: string) {
      return {
        id,
        coll: name,
        async get() {
          return snapOf(id, store[name]?.[id]);
        },
        async set(data: Doc, _opts?: unknown) {
          applyMerge(name, id, data);
        },
        async update(data: Doc) {
          if (!store[name]?.[id]) throw new Error("NOT_FOUND");
          applyMerge(name, id, data);
        },
        async delete() {
          delete store[name]?.[id];
        },
      };
    },
    async add(data: Doc) {
      const id = `${name}-${++nextId}`;
      applyMerge(name, id, data);
      return { id };
    },
  };
  return q;
}

const fakeDb = {
  collection,
  batch() {
    const ops: Array<() => void> = [];
    return {
      set(ref: { id: string; coll: string }, data: Doc) {
        ops.push(() => applyMerge(ref.coll, ref.id, data));
      },
      delete(ref: { id: string; coll: string }) {
        ops.push(() => delete store[ref.coll]?.[ref.id]);
      },
      async commit() {
        ops.forEach((op) => op());
      },
    };
  },
};

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async (_req: unknown, opts?: { superAdminOnly?: boolean }) => {
    if (!current) return null;
    if (opts?.superAdminOnly && current.role !== "super_admin") return null;
    return { ...current, profileDocId: null, source: "admins" } satisfies AdminCaller;
  },
}));
vi.mock("@/lib/waitlist/admin-owners", () => {
  const owners = [
    { id: "u-ann", name: "Ann", email: "ann@example.com" },
    { id: "u-bob", name: "Bob", email: "bob@example.com" },
    { id: "u-sue", name: "Sue", email: "sue@example.com" },
  ];
  return {
    listAdminOwners: async () => owners,
    resolveAdminOwner: async (uid: string) => owners.find((o) => o.id === uid) ?? null,
  };
});
vi.mock("@/lib/waitlist/server", () => ({
  waitlistDb: () => fakeDb,
  getGlobalThreshold: async () => 100,
  createUniqueSourceCode: async () => "ABC123",
  toIso: (v: unknown) => (typeof v === "string" ? v : null),
}));
vi.mock("@/lib/waitlist/og-card", () => ({
  warmWaitlistCard: async () => {},
  warmWaitlistCardsForSource: async () => {},
}));
vi.mock("@/lib/waitlist/group-linking", async (orig) => ({
  ...(await orig<typeof import("@/lib/waitlist/group-linking")>()),
  groupsDb: () => fakeDb,
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: () => {},
}));

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function seed() {
  nextId = 0;
  store = {
    groupDemandSources: {
      annSrc: { sourceName: "Ann's forum", platformId: "forum", ownerId: "u-ann", ownerName: "Ann", ownerEmail: "ann@example.com", status: "active_waitlist" },
      bobSrc: { sourceName: "Bob's subreddit", platformId: "reddit", ownerId: "u-bob", ownerName: "Bob", ownerEmail: "bob@example.com", status: "active_waitlist" },
      oldSrc: { sourceName: "Legacy group", platformId: "facebook", status: "active_waitlist" },
    },
    sourceLinks: {
      annLink: { demandSourceId: "annSrc", sourceCode: "AAAAAA", ownerId: "u-ann" },
      bobLink: { demandSourceId: "bobSrc", sourceCode: "BBBBBB", ownerId: "u-bob" },
      oldLink: { demandSourceId: "oldSrc", sourceCode: "CCCCCC" },
    },
    outreachRecords: {
      annRec: { demandSourceId: "annSrc", ownerId: "u-ann", status: "draft" },
      bobRec: { demandSourceId: "bobSrc", ownerId: "u-bob", status: "draft" },
      oldRec: { demandSourceId: "oldSrc", status: "draft" },
    },
    waitlistEntries: {
      e1: { demandSourceId: "bobSrc", email: "x@example.com" },
    },
    sourceVisits: { v1: { demandSourceId: "annSrc", sourceCode: "AAAAAA", isUnique: true, createdAt: "2026-01-01T00:00:00.000Z" } },
    shareEvents: { s1: { demandSourceId: "annSrc", sourceCode: "AAAAAA", shareChannel: "whatsapp", shareClickedAt: "2026-01-02T00:00:00.000Z" } },
    adminActivity: {
      a1: { actorId: "u-ann", actorName: "Ann", ownerId: "u-ann", demandSourceId: "annSrc", action: "source.create", summary: "x" },
      a2: { actorId: "u-bob", actorName: "Bob", ownerId: "u-bob", demandSourceId: "bobSrc", action: "source.create", summary: "y" },
      a3: { actorId: "u-sue", actorName: "Sue", ownerId: null, demandSourceId: "oldSrc", action: "source.update", summary: "z" },
    },
  };
}

let sourcesRoute: typeof import("@/app/api/admin/demand-sources/route");
let sourceRoute: typeof import("@/app/api/admin/demand-sources/[id]/route");
let ownerRoute: typeof import("@/app/api/admin/demand-sources/[id]/owner/route");
let regsRoute: typeof import("@/app/api/admin/demand-sources/[id]/registrations/route");
let linksRoute: typeof import("@/app/api/admin/source-links/route");
let outreachRoute: typeof import("@/app/api/admin/outreach/route");
let activityRoute: typeof import("@/app/api/admin/admin-activity/route");
let quickAddRoute: typeof import("@/app/api/admin/demand-sources/quick-add/route");

beforeAll(async () => {
  sourcesRoute = await import("@/app/api/admin/demand-sources/route");
  sourceRoute = await import("@/app/api/admin/demand-sources/[id]/route");
  ownerRoute = await import("@/app/api/admin/demand-sources/[id]/owner/route");
  regsRoute = await import("@/app/api/admin/demand-sources/[id]/registrations/route");
  linksRoute = await import("@/app/api/admin/source-links/route");
  outreachRoute = await import("@/app/api/admin/outreach/route");
  activityRoute = await import("@/app/api/admin/admin-activity/route");
  quickAddRoute = await import("@/app/api/admin/demand-sources/quick-add/route");
}, 120_000);

beforeEach(() => {
  seed();
  current = ann;
});

async function names(res: Response): Promise<string[]> {
  const body = (await res.json()) as { sources: Array<{ sourceName: string }> };
  return body.sources.map((s) => s.sourceName).sort();
}

describe("GET /api/admin/demand-sources", () => {
  it("shows an ordinary admin only their own work, by default", async () => {
    const res = await sourcesRoute.GET(req("/api/admin/demand-sources"));
    expect(await names(res)).toEqual(["Ann's forum"]);
  });

  it("never shows an ordinary admin legacy or another admin's sources, links included", async () => {
    const res = await sourcesRoute.GET(req("/api/admin/demand-sources"));
    const body = (await res.json()) as { sources: Array<{ links: Array<{ sourceCode: string }> }>; owners: unknown[] };
    expect(body.sources.flatMap((s) => s.links.map((l) => l.sourceCode))).toEqual(["AAAAAA"]);
    expect(body.owners).toEqual([]);
  });

  it("refuses an ordinary admin who asks for more, whatever the client sent", async () => {
    for (const scope of ["all", "unassigned", "owner:u-bob"]) {
      const res = await sourcesRoute.GET(req(`/api/admin/demand-sources?scope=${encodeURIComponent(scope)}`));
      expect(res.status).toBe(403);
      expect(JSON.stringify(await res.json())).not.toContain("Bob's subreddit");
    }
  });

  it("gives a super admin everything by default, and just their own on request", async () => {
    current = sue;
    expect(await names(await sourcesRoute.GET(req("/api/admin/demand-sources?scope=mine")))).toEqual([]);
    expect(await names(await sourcesRoute.GET(req("/api/admin/demand-sources")))).toEqual([
      "Ann's forum",
      "Bob's subreddit",
      "Legacy group",
    ]);
  });

  it("lets a super admin filter to one admin, or to legacy records", async () => {
    current = sue;
    expect(await names(await sourcesRoute.GET(req("/api/admin/demand-sources?scope=owner:u-bob")))).toEqual([
      "Bob's subreddit",
    ]);
    const res = await sourcesRoute.GET(req("/api/admin/demand-sources?scope=unassigned"));
    const body = (await res.json()) as { sources: Array<{ sourceName: string; ownerId: string | null; ownerName: string | null }> };
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toMatchObject({ sourceName: "Legacy group", ownerId: null, ownerName: null });
  });

  it("says who owns each source, and offers a super admin every admin to filter by", async () => {
    current = sue;
    const body = (await (await sourcesRoute.GET(req("/api/admin/demand-sources?scope=all"))).json()) as {
      sources: Array<{ sourceName: string; ownerName: string | null }>;
      owners: Array<{ id: string }>;
    };
    expect(body.sources.find((s) => s.sourceName === "Ann's forum")?.ownerName).toBe("Ann");
    expect(body.owners.map((o) => o.id)).toEqual(["u-ann", "u-bob", "u-sue"]);
  });

  it("answers 403 to someone who is not an admin", async () => {
    current = null;
    expect((await sourcesRoute.GET(req("/api/admin/demand-sources"))).status).toBe(403);
  });
});

describe("POST /api/admin/demand-sources", () => {
  it("records who owns and who created the new source and its first link", async () => {
    const res = await sourcesRoute.POST(
      req("/api/admin/demand-sources", { method: "POST", body: { sourceName: "Fresh place", platformId: "forum" } })
    );
    expect(res.status).toBe(200);
    const created = Object.values(store.groupDemandSources).find((s) => s.sourceName === "Fresh place");
    expect(created).toMatchObject({ ownerId: "u-ann", ownerName: "Ann", ownerEmail: "ann@example.com", createdBy: "u-ann" });
    const link = Object.values(store.sourceLinks).find((l) => l.sourceCode === "ABC123");
    expect(link).toMatchObject({ ownerId: "u-ann", createdBy: "u-ann" });
  });

  it("writes an activity entry naming the actor, the action and the record", async () => {
    const res = await sourcesRoute.POST(
      req("/api/admin/demand-sources", { method: "POST", body: { sourceName: "Fresh place", platformId: "forum" } })
    );
    const { id } = (await res.json()) as { id: string };
    const entry = Object.values(store.adminActivity).find((a) => a.targetId === id);
    expect(entry).toMatchObject({
      actorId: "u-ann",
      actorName: "Ann",
      actorRole: "admin",
      action: "source.create",
      targetType: "source",
      demandSourceId: id,
      ownerId: "u-ann",
    });
    expect(entry?.at).toBeDefined();
  });
});

describe("changing another admin's work", () => {
  it("PATCH on a source: owner ok, other admin and legacy refused, super admin ok", async () => {
    const patch = (id: string) =>
      sourceRoute.PATCH(req(`/api/admin/demand-sources/${id}`, { method: "PATCH", body: { internalNotes: "hi" } }), ctx(id));

    expect((await patch("annSrc")).status).toBe(200);
    expect(store.groupDemandSources.annSrc.internalNotes).toBe("hi");

    expect((await patch("bobSrc")).status).toBe(404);
    expect((await patch("oldSrc")).status).toBe(404);
    expect(store.groupDemandSources.bobSrc.internalNotes).toBeUndefined();
    expect(store.groupDemandSources.oldSrc.internalNotes).toBeUndefined();

    current = sue;
    expect((await patch("bobSrc")).status).toBe(200);
    expect(store.groupDemandSources.bobSrc.internalNotes).toBe("hi");
  });

  it("records a super admin's edit against the actor, leaving the owner unchanged", async () => {
    current = sue;
    await sourceRoute.PATCH(
      req("/api/admin/demand-sources/bobSrc", { method: "PATCH", body: { internalNotes: "x" } }),
      ctx("bobSrc")
    );
    const entry = Object.values(store.adminActivity).find((a) => a.actorId === "u-sue" && a.targetId === "bobSrc");
    expect(entry).toMatchObject({ action: "source.update", ownerId: "u-bob", actorRole: "super_admin" });
    expect(store.groupDemandSources.bobSrc.ownerId).toBe("u-bob");
  });

  it("cannot be used to reassign: ownerId in a PATCH body is ignored", async () => {
    await sourceRoute.PATCH(
      req("/api/admin/demand-sources/annSrc", { method: "PATCH", body: { ownerId: "u-bob", internalNotes: "n" } }),
      ctx("annSrc")
    );
    expect(store.groupDemandSources.annSrc.ownerId).toBe("u-ann");
  });

  it("source links: an admin cannot add to or edit another admin's", async () => {
    const add = await linksRoute.POST(
      req("/api/admin/source-links", { method: "POST", body: { demandSourceId: "bobSrc" } })
    );
    expect(add.status).toBe(404);
    const edit = await linksRoute.PATCH(
      req("/api/admin/source-links", { method: "PATCH", body: { id: "bobLink", label: "mine now" } })
    );
    expect(edit.status).toBe(404);
    expect(store.sourceLinks.bobLink.label).toBeUndefined();
  });

  it("a link added to an admin's source inherits that admin as owner", async () => {
    current = sue;
    await linksRoute.POST(req("/api/admin/source-links", { method: "POST", body: { demandSourceId: "annSrc" } }));
    const link = Object.values(store.sourceLinks).find((l) => l.sourceCode === "ABC123");
    expect(link).toMatchObject({ ownerId: "u-ann", createdBy: "u-sue" });
  });

  it("outreach records: listing, creating and editing follow the source's owner", async () => {
    // Listing without a source is scoped; asking for more is refused.
    const mine = (await (await outreachRoute.GET(req("/api/admin/outreach"))).json()) as { records: Array<{ id: string }> };
    expect(mine.records.map((r) => r.id)).toEqual(["annRec"]);
    expect((await outreachRoute.GET(req("/api/admin/outreach?scope=all"))).status).toBe(403);
    expect((await outreachRoute.GET(req("/api/admin/outreach?demandSourceId=bobSrc"))).status).toBe(404);

    expect(
      (await outreachRoute.POST(req("/api/admin/outreach", { method: "POST", body: { demandSourceId: "bobSrc" } }))).status
    ).toBe(404);
    expect(
      (await outreachRoute.PATCH(req("/api/admin/outreach", { method: "PATCH", body: { id: "bobRec", status: "posted" } })))
        .status
    ).toBe(404);
    expect(store.outreachRecords.bobRec.status).toBe("draft");

    // Super admin sees all of it, and a record keeps its owner.
    current = sue;
    const all = (await (await outreachRoute.GET(req("/api/admin/outreach?scope=all"))).json()) as { records: Array<{ id: string; ownerName: string | null }> };
    expect(all.records.map((r) => r.id).sort()).toEqual(["annRec", "bobRec", "oldRec"]);
    expect(all.records.find((r) => r.id === "oldRec")?.ownerName).toBeNull();
  });

  it("registrant emails: only the source's owner or a super admin", async () => {
    expect((await regsRoute.GET(req("/api/admin/demand-sources/bobSrc/registrations"), ctx("bobSrc"))).status).toBe(404);
    expect((await regsRoute.GET(req("/api/admin/demand-sources/_general/registrations"), ctx("_general"))).status).toBe(404);
    current = sue;
    const res = await regsRoute.GET(req("/api/admin/demand-sources/bobSrc/registrations"), ctx("bobSrc"));
    expect(res.status).toBe(200);
    expect(Object.values(store.adminActivity).some((a) => a.action === "registrations.view" && a.actorId === "u-sue")).toBe(true);
  });
});

describe("reassigning ownership", () => {
  const assign = (id: string, ownerId: string) =>
    ownerRoute.POST(req(`/api/admin/demand-sources/${id}/owner`, { method: "POST", body: { ownerId } }), ctx(id));

  it("is refused to an ordinary admin, even for their own source", async () => {
    expect((await assign("annSrc", "u-bob")).status).toBe(403);
    expect((await assign("oldSrc", "u-ann")).status).toBe(403);
    expect(store.groupDemandSources.annSrc.ownerId).toBe("u-ann");
    expect(store.groupDemandSources.oldSrc.ownerId).toBeUndefined();
  });

  it("lets a super admin give a legacy source an owner, with its links and records", async () => {
    current = sue;
    const res = await assign("oldSrc", "u-ann");
    expect(res.status).toBe(200);
    expect(store.groupDemandSources.oldSrc).toMatchObject({ ownerId: "u-ann", ownerName: "Ann", ownerEmail: "ann@example.com" });
    expect(store.sourceLinks.oldLink.ownerId).toBe("u-ann");
    expect(store.outreachRecords.oldRec.ownerId).toBe("u-ann");
    // And Ann can now see it.
    current = ann;
    expect(await names(await sourcesRoute.GET(req("/api/admin/demand-sources")))).toEqual(["Ann's forum", "Legacy group"]);
    // The reassignment is logged against the super admin.
    const entry = Object.values(store.adminActivity).find((a) => a.action === "source.reassign");
    expect(entry).toMatchObject({ actorId: "u-sue", targetId: "oldSrc", ownerId: "u-ann" });
  });

  it("will not hand work to someone who is not an admin", async () => {
    current = sue;
    expect((await assign("annSrc", "u-stranger")).status).toBe(400);
    expect(store.groupDemandSources.annSrc.ownerId).toBe("u-ann");
  });
});

describe("GET /api/admin/admin-activity", () => {
  it("gives an ordinary admin the activity on and by their own work", async () => {
    const body = (await (await activityRoute.GET(req("/api/admin/admin-activity"))).json()) as { adminActivity: Array<{ actorName: string }> };
    expect(body.adminActivity.map((a) => a.actorName)).toEqual(["Ann"]);
  });

  it("refuses an ordinary admin the combined or another admin's view", async () => {
    for (const scope of ["all", "unassigned", "owner:u-bob"]) {
      expect((await activityRoute.GET(req(`/api/admin/admin-activity?scope=${encodeURIComponent(scope)}`))).status).toBe(403);
    }
    expect((await activityRoute.GET(req("/api/admin/admin-activity?demandSourceId=bobSrc"))).status).toBe(404);
  });

  it("gives a super admin everyone's, one admin's, or the legacy records'", async () => {
    current = sue;
    const actors = async (q: string) =>
      ((await (await activityRoute.GET(req(`/api/admin/admin-activity?${q}`))).json()) as { adminActivity: Array<{ actorName: string }> })
        .adminActivity.map((a) => a.actorName)
        .sort();
    expect(await actors("scope=all")).toEqual(["Ann", "Bob", "Sue"]);
    expect(await actors("scope=owner:u-bob")).toEqual(["Bob"]);
    expect(await actors("scope=unassigned")).toEqual(["Sue"]);
  });

  it("keeps visitor activity apart from admin activity, for one source", async () => {
    const body = (await (await activityRoute.GET(req("/api/admin/admin-activity?demandSourceId=annSrc"))).json()) as {
      adminActivity: Array<Record<string, unknown>>;
      visitorActivity: Array<Record<string, unknown>>;
    };
    expect(body.adminActivity.map((a) => a.actorName)).toEqual(["Ann"]);
    expect(body.visitorActivity.map((v) => v.kind).sort()).toEqual(["share", "visit"]);
    // Visitors have no identity to show.
    expect(Object.keys(body.visitorActivity[0]).sort()).toEqual(["at", "kind", "shareChannel", "sourceCode", "unique"]);
  });
});

// ─── Cross-admin duplicate protection stays on, on purpose ───────────────────
//
// Two admins must not end up doing the same outreach. These checks look across
// owners deliberately, and an ordinary admin is meant to see them.

describe("duplicate-work guards", () => {
  const post = "https://www.reddit.com/r/phonecalls/comments/abc123/hello/";

  it("quick-add refuses a community another admin owns, and says whose and which", async () => {
    const { deriveCommunityUrl } = await import("@/lib/waitlist/parse-source-url");
    const derived = deriveCommunityUrl(post)!;
    store.groupDemandSources.bobSrc.sourceUrl = derived.communityUrl;
    store.groupDemandSources.bobSrc.platformId = derived.platformId;

    const res = await quickAddRoute.POST(req("/api/admin/demand-sources/quick-add", { method: "POST", body: { url: post } }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { alreadyOwned: boolean; existing: Record<string, unknown> };
    expect(body.alreadyOwned).toBe(true);
    expect(body.existing).toMatchObject({
      sourceId: "bobSrc",
      sourceName: "Bob's subreddit",
      ownerName: "Bob",
      ownerEmail: "bob@example.com",
    });
    // Nothing was added to Bob's source.
    expect(Object.values(store.sourceLinks).filter((l) => l.demandSourceId === "bobSrc")).toHaveLength(1);
  });

  it("quick-add refuses a legacy community to an ordinary admin, naming it unassigned", async () => {
    const { deriveCommunityUrl } = await import("@/lib/waitlist/parse-source-url");
    const derived = deriveCommunityUrl(post)!;
    store.groupDemandSources.oldSrc.sourceUrl = derived.communityUrl;
    store.groupDemandSources.oldSrc.platformId = derived.platformId;

    const res = await quickAddRoute.POST(req("/api/admin/demand-sources/quick-add", { method: "POST", body: { url: post } }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { existing: { ownerName: string; ownerEmail: string | null } };
    expect(body.existing.ownerName).toBe("Unassigned (legacy)");
    expect(body.existing.ownerEmail).toBeNull();
  });

  it("quick-add adds a link to a community the caller owns, which stays theirs", async () => {
    const { deriveCommunityUrl } = await import("@/lib/waitlist/parse-source-url");
    const derived = deriveCommunityUrl(post)!;
    store.groupDemandSources.annSrc.sourceUrl = derived.communityUrl;
    store.groupDemandSources.annSrc.platformId = derived.platformId;

    const res = await quickAddRoute.POST(req("/api/admin/demand-sources/quick-add", { method: "POST", body: { url: post } }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { created: string }).created).toBe("link");
    const added = Object.values(store.sourceLinks).find((l) => l.sourceCode === "ABC123");
    expect(added).toMatchObject({ demandSourceId: "annSrc", ownerId: "u-ann" });
  });

  it("'has this URL been posted before?' still sees other admins' outreach", async () => {
    store.outreachRecords.bobRec.normalisedDestination = "example.com/thread/1";
    store.outreachRecords.bobRec.type = "public_comment";
    const res = await outreachRoute.GET(
      req("/api/admin/outreach?destination=" + encodeURIComponent("https://www.example.com/thread/1"))
    );
    const body = (await res.json()) as { priorUses: Array<{ id: string; demandSourceId: string }> };
    expect(body.priorUses.map((u) => u.id)).toEqual(["bobRec"]);
    expect(body.priorUses[0].demandSourceId).toBe("bobSrc");
  });

  it("creating a source with an existing URL is still refused with the match, across owners", async () => {
    store.groupDemandSources.bobSrc.sourceUrl = "https://www.reddit.com/r/phonecalls";
    const res = await sourcesRoute.POST(
      req("/api/admin/demand-sources", {
        method: "POST",
        body: { sourceName: "My copy", platformId: "reddit", sourceUrl: "https://www.reddit.com/r/phonecalls" },
      })
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { requiresAcknowledgement: boolean; similar: Array<{ id: string }> };
    expect(body.requiresAcknowledgement).toBe(true);
    expect(body.similar.map((m) => m.id)).toContain("bobSrc");
  });
});
