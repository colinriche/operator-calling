import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import {
  COLLECTIONS,
  DEMAND_STATUS_IDS,
  PLATFORM_IDS,
  RELATIONSHIP_STATUS_IDS,
  SOURCE_TYPE_IDS,
  WAITLIST_MODE_IDS,
} from "@/lib/waitlist/constants";
import { getGlobalThreshold, waitlistDb } from "@/lib/waitlist/server";
import { isTopicArtId } from "@/lib/waitlist/topic-art";

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
  ["familyName", 120],
  ["internalNotes", 4000],
  ["postingRules", 2000],
];

// Deliberately absent from everything below: heroImageUrl and heroImagePath.
// The hero image is only ever set by POST …/[id]/image, which requires the
// public-visibility confirmation. Accepting a URL here would be a way to put an
// image on a public page and into every link preview without anyone having
// acknowledged that it becomes public.

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

  // Whether tracked URLs carry the topic slug. Cosmetic, so it needs no
  // re-issuing of codes — the same links simply copy differently from now on.
  if (typeof body.includeTopicInUrl === "boolean") {
    update.includeTopicInUrl = body.includeTopicInUrl;
  }

  // Which of the three pages this source's tracked links render.
  if (
    typeof body.waitlistMode === "string" &&
    WAITLIST_MODE_IDS.includes(body.waitlistMode)
  ) {
    update.waitlistMode = body.waitlistMode;
  }

  // "" clears the choice and falls back to the brand mark; anything not in the
  // curated set is ignored rather than stored and rendered as a broken hero.
  if (typeof body.topicArtId === "string") {
    if (body.topicArtId === "") update.topicArtId = "";
    else if (isTopicArtId(body.topicArtId)) update.topicArtId = body.topicArtId;
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

  const thresholdChanged =
    body.demandThreshold === null ||
    (typeof body.demandThreshold === "number" && body.demandThreshold > 0);
  if (thresholdChanged) {
    update.demandThreshold =
      body.demandThreshold === null
        ? null
        : Math.floor(body.demandThreshold as number);
  }

  try {
    const db = waitlistDb();
    const ref = db.collection(COLLECTIONS.demandSources).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Changing the bar re-evaluates against the signups already collected,
    // rather than waiting for the next one. Lowering it below the current count
    // should flag the source immediately; raising it above should reopen
    // collection instead of leaving it stuck at threshold_reached.
    if (thresholdChanged) {
      const current = snap.data() ?? {};
      const effective =
        update.demandThreshold === null
          ? await getGlobalThreshold(db)
          : (update.demandThreshold as number);
      const met = (current.signupCount ?? 0) >= effective;

      if (met && !current.groupId) {
        update.thresholdReachedAt =
          current.thresholdReachedAt ?? FieldValue.serverTimestamp();
        // Never move a source that has already been reviewed or actioned.
        if (
          current.status === "active_waitlist" ||
          current.status === "researching"
        ) {
          update.status = "threshold_reached";
        }
      } else if (!met) {
        update.thresholdReachedAt = null;
        if (current.status === "threshold_reached") {
          update.status = "active_waitlist";
        }
      }
    }

    await ref.set(update, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/demand-sources PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
