import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAdminActivity } from "@/lib/waitlist/admin-activity";
import { ownerIdOf } from "@/lib/waitlist/ownership";
import { loadSourceForCaller } from "@/lib/waitlist/source-access";
import { COLLECTIONS, GENERAL_DEMAND_SOURCE_ID } from "@/lib/waitlist/constants";
import { toIso, waitlistDb } from "@/lib/waitlist/server";

// GET /api/admin/demand-sources/[id]/registrations
//
// Registration emails are the most sensitive thing this feature stores, so this
// is never folded into the main list response - it is fetched deliberately, per
// source. Open to admin and super_admin.

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const db = waitlistDb();

    // Emails are only for the admin whose source this is (or a super admin).
    // The general bucket (registrations with no code) has no owner and no source
    // document, so it is a super admin's.
    let ownerId: string | null = null;
    if (id === GENERAL_DEMAND_SOURCE_ID) {
      if (caller.role !== "super_admin") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else {
      const access = await loadSourceForCaller(db, id, caller);
      if (!access.ok) return access.response;
      ownerId = ownerIdOf(access.data);
    }

    const snap = await db
      .collection(COLLECTIONS.waitlistEntries)
      .where("demandSourceId", "==", id)
      .limit(500)
      .get();

    const registrations = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data.email ?? "",
        displayName: data.displayName ?? "",
        interestedInOrganising: data.interestedInOrganising === true,
        // Community interest and tester status are reported separately - one is
        // never derived from the other.
        communityInterest: data.communityInterest !== false,
        testerStatus: data.testerStatus ?? "none",
        testerConsentAt: toIso(data.testerConsentAt),
        testerConsentVersion: data.testerConsentVersion ?? null,
        testerJoinedFromSourceCode: data.testerJoinedFromSourceCode ?? null,
        timezone: data.timezone ?? null,
        country: data.country ?? "",
        englishFirstLanguage: data.englishFirstLanguage !== false,
        firstLanguage: data.firstLanguage ?? null,
        sourceCode: data.sourceCode ?? null,
        shareChannel: data.shareChannel ?? null,
        // Self-reported, and only ever set server-side when sourceCode above
        // is null - see normaliseReferralSource in lib/waitlist/server.ts.
        referralSource: data.referralSource ?? null,
        relationshipStatusAtSignup: data.relationshipStatusAtSignup ?? null,
        createdAt: toIso(data.createdAt),
      };
    });

    // Sorted in memory so this needs no composite index - 500 rows is nothing.
    registrations.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    // Reading registrant emails is the one read worth logging.
    await recordAdminActivity(db, caller, {
      action: "registrations.view",
      targetType: "source",
      targetId: id,
      demandSourceId: id,
      ownerId,
      summary: `Viewed ${registrations.length} registrations`,
    });

    return NextResponse.json({ registrations });
  } catch (err) {
    console.error("[admin/demand-sources registrations]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
