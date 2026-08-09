import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { waitlistDb } from "@/lib/waitlist/server";

// Data-integrity audit. Read-only — reports, never repairs.
//
// Exists because the public registration endpoint could once mint
// `testerStatus: "active"` with no account behind it. Those records are
// indistinguishable from legitimate ones by status alone; the tell is an active
// tester with no `testerUid`, since the authenticated flow always records one.
//
// Deliberately does not delete anything. A record created by the bypass may
// still be a real person who genuinely wanted in, and deciding that is not a
// script's job.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    const db = waitlistDb();
    const snap = await db
      .collection(COLLECTIONS.waitlistEntries)
      .where("testerStatus", "==", "active")
      .get();

    const suspect: Array<{
      id: string;
      maskedEmail: string;
      createdAt: string | null;
      hasConsentTimestamp: boolean;
      sourceCode: string | null;
    }> = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      if (typeof data.testerUid === "string" && data.testerUid) continue;

      const email = (data.email as string) ?? "";
      const [local, domain] = email.split("@");
      suspect.push({
        id: doc.id,
        maskedEmail: local && domain ? `${local.slice(0, 2)}••••@${domain}` : "",
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        // The bypass did stamp a consent time, so this being present proves
        // nothing about whether anyone actually consented.
        hasConsentTimestamp: !!data.testerConsentAt,
        sourceCode: (data.sourceCode as string) ?? null,
      });
    }

    return NextResponse.json({
      activeTesters: snap.size,
      activeTestersWithoutUid: suspect.length,
      suspect,
      note:
        suspect.length > 0
          ? "Active testers with no uid predate the authenticated-only opt-in. They cannot be in a group and were never verified. Review before deciding."
          : "No active testers without a verified uid.",
    });
  } catch (err) {
    console.error("[admin/waitlist-audit]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
