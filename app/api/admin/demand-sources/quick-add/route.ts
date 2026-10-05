import { NextRequest, NextResponse, after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAdminActivity } from "@/lib/waitlist/admin-activity";
import {
  canAccessRecord,
  inheritedOwner,
  ownerEmailOf,
  ownerIdOf,
  ownerLabel,
  ownerStampFor,
} from "@/lib/waitlist/ownership";
import { warmWaitlistCard } from "@/lib/waitlist/og-card";
import {
  COLLECTIONS,
  DEFAULT_CONNECTION_TYPE,
  DEFAULT_RELATIONSHIP_STATUS,
  PLATFORM_IDS,
  SOURCE_TYPE_IDS,
  platformLabel,
} from "@/lib/waitlist/constants";
import { advisoryDuplicates, blockingDuplicates, findSimilarDemandSources } from "@/lib/waitlist/duplicate-sources";
import { deriveCommunityUrl } from "@/lib/waitlist/parse-source-url";
import { createUniqueSourceCode, waitlistDb } from "@/lib/waitlist/server";
import { buildTrackedUrl } from "@/lib/waitlist/tracked-url";

// POST /api/admin/demand-sources/quick-add - one URL in, no other decision.
//
// The admin pastes the URL of a post, comment or share. From it alone this
// works out which platform and community it belongs to, and:
//
//   already tracked   the pasted URL becomes a new tracked link under that
//                      source. No second record for the same place.
//   not tracked yet    a source is created for the community (its own root
//                      URL, not the post), then the pasted URL becomes that
//                      source's first tracked link.
//
// "Already tracked" is decided the same way the Add Source form's duplicate
// guard decides it - an exact match on the canonical community URL, never on
// the name - so this can never rule differently to a human filling that form
// in by hand for the same link.
//
// Deliberately narrow: a URL this cannot place in a known platform's
// community structure is refused rather than guessed at, and the admin is
// pointed at the ordinary Add Source form instead.

export const runtime = "nodejs";

function originFrom(req: NextRequest): string {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://operatorcalling.com";
}

export async function POST(req: NextRequest) {
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

  const pasted = typeof body.url === "string" ? body.url.trim() : "";
  if (!pasted) {
    return NextResponse.json({ error: "Paste a URL first" }, { status: 400 });
  }

  const derived = deriveCommunityUrl(pasted);
  if (!derived) {
    return NextResponse.json(
      {
        error:
          "Couldn't recognise a community in that link. Add the source by hand instead.",
      },
      { status: 422 }
    );
  }

  const platformId =
    derived.platformId && PLATFORM_IDS.includes(derived.platformId)
      ? derived.platformId
      : "other";
  const sourceType =
    derived.sourceType && SOURCE_TYPE_IDS.includes(derived.sourceType)
      ? derived.sourceType
      : "other";
  const sourceName = derived.sourceName || `${platformLabel(platformId)} community`;

  try {
    const db = waitlistDb();
    const origin = originFrom(req);

    // Same duplicate check the Add Source form runs - only an exact canonical
    // URL counts as "already tracked"; a name match is advisory everywhere
    // else in this app and stays that way here.
    const matches = await findSimilarDemandSources(db, {
      sourceName,
      platformId,
      topicName: "",
      audienceLabel: "",
      sourceUrl: derived.communityUrl,
    });
    const existing = blockingDuplicates(matches)[0];

    let existingData: FirebaseFirestore.DocumentData = {};
    if (existing) {
      // The community is already tracked. If it is another admin's, an ordinary
      // admin cannot add a link to it or see more than whose it is - the usual
      // answer is "ask them", and a super admin can reassign.
      const existingSnap = await db.collection(COLLECTIONS.demandSources).doc(existing.id).get();
      existingData = existingSnap.data() ?? {};
      if (!canAccessRecord(caller, existingData)) {
        return NextResponse.json(
          {
            error: `This community is already being worked by ${ownerLabel(existingData)}. Ask them, or ask a super admin to reassign it.`,
            alreadyOwned: true,
            // Enough to find the work and the person: this is a duplicate-work
            // guard, and "someone has it" would leave nothing to act on.
            existing: {
              sourceId: existing.id,
              sourceName: existing.sourceName,
              sourceUrl: existing.sourceUrl,
              ownerName: ownerLabel(existingData),
              ownerEmail: ownerEmailOf(existingData),
            },
          },
          { status: 409 }
        );
      }

      const sourceCode = await createUniqueSourceCode(db);
      const linkRef = await db.collection(COLLECTIONS.sourceLinks).add({
        sourceCode,
        platformId: existing.platformId,
        demandSourceId: existing.id,
        outreachId: null,
        groupId: null,
        formType: "waitlist",
        status: "active",
        label: derived.postUrl.slice(0, 500),
        createdAt: FieldValue.serverTimestamp(),
        createdBy: caller.uid,
      ...inheritedOwner(existingData),
        firstUsedAt: null,
        lastUsedAt: null,
        totalVisitCount: 0,
        uniqueVisitCount: 0,
        signupCount: 0,
        organiserInterestCount: 0,
        shareClickCount: 0,
        posted: false,
        hidden: false,
      });
      after(() => warmWaitlistCard(sourceCode));

      await recordAdminActivity(db, caller, {
        action: "link.create",
        targetType: "link",
        targetId: linkRef.id,
        demandSourceId: existing.id,
        ownerId: ownerIdOf(existingData),
        summary: `Added a link to "${existing.sourceName}" from a pasted URL`,
      });

      return NextResponse.json({
        created: "link",
        sourceId: existing.id,
        sourceName: existing.sourceName,
        trackedUrl: buildTrackedUrl(origin, sourceCode, {}),
      });
    }

    const sourceRef = await db.collection(COLLECTIONS.demandSources).add({
      platformId,
      sourceName,
      sourceType,
      topicName: "",
      includeTopicInUrl: false,
      sourceUrl: derived.communityUrl,
      publicDisplayName: "",
      publicAudienceLabel: "",
      publicEyebrow: "",
      publicDescription: "",
      waitlistMode: "community",
      connectionType: DEFAULT_CONNECTION_TYPE,
      topicArtId: "",
      familyName: "",
      heroImageUrl: null,
      heroImagePath: null,
      imageChoice: "",
      imageChoiceUrl: null,
      socialImages: {},
      socialImageUrls: {},
      wording: null,
      wordingTemplateLabel: null,
      internalNotes: "",
      postingRules: "",
      relationshipStatus: DEFAULT_RELATIONSHIP_STATUS,
      status: "active_waitlist",
      groupId: null,
      demandThreshold: null,
      totalVisitCount: 0,
      uniqueVisitCount: 0,
      signupCount: 0,
      organiserInterestCount: 0,
      shareClickCount: 0,
      thresholdReachedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      ...ownerStampFor(caller),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const sourceCode = await createUniqueSourceCode(db);
    await db.collection(COLLECTIONS.sourceLinks).add({
      sourceCode,
      platformId,
      demandSourceId: sourceRef.id,
      outreachId: null,
      groupId: null,
      formType: "waitlist",
      status: "active",
      label: derived.postUrl.slice(0, 500),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      ...ownerStampFor(caller),
      firstUsedAt: null,
      lastUsedAt: null,
      totalVisitCount: 0,
      uniqueVisitCount: 0,
      signupCount: 0,
      organiserInterestCount: 0,
      shareClickCount: 0,
      posted: false,
      hidden: false,
    });

    after(() => warmWaitlistCard(sourceCode));

    await recordAdminActivity(db, caller, {
      action: "source.create",
      targetType: "source",
      targetId: sourceRef.id,
      demandSourceId: sourceRef.id,
      ownerId: ownerStampFor(caller).ownerId,
      summary: `Created source "${sourceName}" from a pasted URL`,
    });

    return NextResponse.json({
      created: "source",
      sourceId: sourceRef.id,
      sourceName,
      communityUrl: derived.communityUrl,
      trackedUrl: buildTrackedUrl(origin, sourceCode, {}),
      similar: advisoryDuplicates(matches),
    });
  } catch (err) {
    console.error("[admin/demand-sources/quick-add POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
