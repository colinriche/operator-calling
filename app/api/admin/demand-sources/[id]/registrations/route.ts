import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { toIso, waitlistDb } from "@/lib/waitlist/server";

// GET /api/admin/demand-sources/[id]/registrations
//
// Registration emails are the most sensitive thing this feature stores, so this
// is super-admin only and is never folded into the main list response — it is
// fetched deliberately, per source.

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req, { superAdminOnly: true });
  if (!caller) {
    return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const db = waitlistDb();
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
        country: data.country ?? "",
        englishFirstLanguage: data.englishFirstLanguage !== false,
        firstLanguage: data.firstLanguage ?? null,
        sourceCode: data.sourceCode ?? null,
        shareChannel: data.shareChannel ?? null,
        relationshipStatusAtSignup: data.relationshipStatusAtSignup ?? null,
        createdAt: toIso(data.createdAt),
      };
    });

    // Sorted in memory so this needs no composite index — 500 rows is nothing.
    registrations.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return NextResponse.json({ registrations });
  } catch (err) {
    console.error("[admin/demand-sources registrations]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
