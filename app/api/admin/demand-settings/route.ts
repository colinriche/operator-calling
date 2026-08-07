import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS, DEMAND_SETTINGS_DOC } from "@/lib/waitlist/constants";
import { waitlistDb } from "@/lib/waitlist/server";

// PATCH /api/admin/demand-settings — global demand threshold.
//
// Editable at runtime so changing it does not need a deploy or console access.
// Sources with their own demandThreshold override are unaffected.

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const value = body.minimumWaitlistSignups;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return NextResponse.json(
      { error: "Threshold must be a whole number of 1 or more" },
      { status: 400 }
    );
  }

  try {
    await waitlistDb()
      .collection(COLLECTIONS.settings)
      .doc(DEMAND_SETTINGS_DOC)
      .set(
        {
          minimumWaitlistSignups: Math.floor(value),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: caller.uid,
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      minimumWaitlistSignups: Math.floor(value),
    });
  } catch (err) {
    console.error("[admin/demand-settings PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
