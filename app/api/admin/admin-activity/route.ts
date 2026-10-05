import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { toActivityRow, type AdminActivityRow } from "@/lib/waitlist/admin-activity";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { ownerIdFor, resolveScope } from "@/lib/waitlist/ownership";
import { loadSourceForCaller } from "@/lib/waitlist/source-access";
import { toIso, waitlistDb } from "@/lib/waitlist/server";

// GET /api/admin/admin-activity - what admins did, and (for one source) what
// visitors did, as two separate lists.
//
//   ?scope=mine|all|unassigned|owner:<id>   same rules as the source list: an
//                                           ordinary admin gets their own, and
//                                           anything wider is a 403.
//   ?demandSourceId=<id>                    one source's story. Allowed when the
//                                           source is the caller's, or a super
//                                           admin. Adds `visitorActivity`.
//
// Admin events and visitor events stay in separate arrays on purpose: the first
// is people with names, the second is anonymous traffic and must stay that way.

export const runtime = "nodejs";

const LIMIT = 100;

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const sourceId = req.nextUrl.searchParams.get("demandSourceId")?.trim() ?? "";

  try {
    const db = waitlistDb();
    const col = db.collection(COLLECTIONS.adminActivity);
    let rows: AdminActivityRow[];
    let visitorActivity: Array<{ kind: string; at: string | null; sourceCode: string; unique: boolean; shareChannel: unknown }> | undefined;

    if (sourceId) {
      const access = await loadSourceForCaller(db, sourceId, caller);
      if (!access.ok) return access.response;

      const [adminSnap, visitSnap, shareSnap] = await Promise.all([
        col.where("demandSourceId", "==", sourceId).limit(500).get(),
        db.collection(COLLECTIONS.sourceVisits).where("demandSourceId", "==", sourceId).limit(500).get(),
        db.collection(COLLECTIONS.shareEvents).where("demandSourceId", "==", sourceId).limit(500).get(),
      ]);
      rows = adminSnap.docs.map((d) => toActivityRow(d.id, d.data()));

      // Anonymous by construction: no IP, agent or identity is stored to show.
      visitorActivity = [
        ...visitSnap.docs.map((d) => {
          const v = d.data();
          return {
            kind: "visit",
            at: toIso(v.createdAt),
            sourceCode: v.sourceCode ?? "",
            unique: v.isUnique === true,
            shareChannel: v.shareChannel ?? null,
          };
        }),
        ...shareSnap.docs.map((d) => {
          const v = d.data();
          return {
            kind: "share",
            at: toIso(v.shareClickedAt),
            sourceCode: v.sourceCode ?? "",
            unique: false,
            shareChannel: v.shareChannel ?? null,
          };
        }),
      ]
        .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
        .slice(0, LIMIT);
    } else {
      const scope = resolveScope(caller, req.nextUrl.searchParams.get("scope"));
      if (!scope.ok) {
        return NextResponse.json({ error: scope.error }, { status: scope.status });
      }
      const f = scope.filter;
      if (f.kind === "all") {
        rows = (await col.orderBy("at", "desc").limit(LIMIT).get()).docs.map((d) =>
          toActivityRow(d.id, d.data())
        );
      } else if (f.kind === "unassigned") {
        // Events on records with no owner. Filtered after the read: absence of a
        // field is not something an equality query can match.
        rows = (await col.orderBy("at", "desc").limit(500).get()).docs
          .map((d) => toActivityRow(d.id, d.data()))
          .filter((r) => r.ownerId === null);
      } else {
        // An owner's view: work done on their records, by anyone, plus anything
        // they did themselves. Two equality queries, merged - no composite index.
        const [onTheirs, byThem] = await Promise.all([
          col.where("ownerId", "==", f.ownerId).limit(500).get(),
          col.where("actorId", "==", f.ownerId).limit(500).get(),
        ]);
        const byId = new Map<string, AdminActivityRow>();
        for (const d of [...onTheirs.docs, ...byThem.docs]) byId.set(d.id, toActivityRow(d.id, d.data()));
        rows = [...byId.values()];
      }
    }

    rows.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    return NextResponse.json({
      adminActivity: rows.slice(0, LIMIT),
      ...(visitorActivity ? { visitorActivity } : {}),
      viewerId: ownerIdFor(caller),
    });
  } catch (err) {
    console.error("[admin/admin-activity GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
