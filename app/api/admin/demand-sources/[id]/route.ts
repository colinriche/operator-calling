import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import {
  COLLECTIONS,
  DEMAND_STATUS_IDS,
  PLATFORM_IDS,
  RELATIONSHIP_STATUS_IDS,
  SOURCE_TYPE_IDS,
} from "@/lib/waitlist/constants";
import { waitlistDb } from "@/lib/waitlist/server";

// PATCH /api/admin/demand-sources/[id] — edit a demand source.
//
// Relationship status is settable here and nowhere else: it must be an
// explicit act by an authorised user, never inferred from traffic, signups or
// anything a visitor can influence.

export const runtime = "nodejs";

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const TEXT_FIELDS: Array<[key: string, max: number]> = [
  ["sourceName", 200],
  ["topicName", 200],
  ["sourceUrl", 1000],
  ["publicDisplayName", 200],
  ["publicAudienceLabel", 200],
  ["publicDescription", 1000],
  ["internalNotes", 4000],
  ["postingRules", 2000],
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  for (const [key, max] of TEXT_FIELDS) {
    if (typeof body[key] === "string") update[key] = str(body[key], max);
  }

  if (typeof body.platformId === "string" && PLATFORM_IDS.includes(body.platformId)) {
    update.platformId = body.platformId;
  }
  if (typeof body.sourceType === "string" && SOURCE_TYPE_IDS.includes(body.sourceType)) {
    update.sourceType = body.sourceType;
  }
  if (
    typeof body.relationshipStatus === "string" &&
    RELATIONSHIP_STATUS_IDS.includes(body.relationshipStatus)
  ) {
    update.relationshipStatus = body.relationshipStatus;
  }
  if (typeof body.status === "string" && DEMAND_STATUS_IDS.includes(body.status)) {
    update.status = body.status;
    // Reviewing a source is an action by a person — record who and when.
    if (body.status === "under_review") {
      update.reviewedAt = FieldValue.serverTimestamp();
      update.reviewedBy = caller.uid;
    }
  }

  if (body.demandThreshold === null) {
    update.demandThreshold = null;
  } else if (typeof body.demandThreshold === "number" && body.demandThreshold > 0) {
    update.demandThreshold = Math.floor(body.demandThreshold);
    // Raising the bar past the current count reopens collection rather than
    // leaving the source stuck in threshold_reached.
    update.thresholdReachedAt = null;
  }

  try {
    const db = waitlistDb();
    const ref = db.collection(COLLECTIONS.demandSources).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await ref.set(update, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/demand-sources PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
