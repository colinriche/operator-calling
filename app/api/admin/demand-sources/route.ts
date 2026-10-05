import { NextRequest, NextResponse, after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { listAdminOwners } from "@/lib/waitlist/admin-owners";
import { recordAdminActivity } from "@/lib/waitlist/admin-activity";
import {
  matchesScope,
  ownerIdOf,
  ownerEmailOf,
  ownerNameOf,
  ownerStampFor,
  resolveScope,
} from "@/lib/waitlist/ownership";
import { groupsDb } from "@/lib/waitlist/group-linking";
import { warmWaitlistCard } from "@/lib/waitlist/og-card";
import {
  COLLECTIONS,
  CONNECTION_TYPE_IDS,
  DEFAULT_CONNECTION_TYPE,
  DEFAULT_RELATIONSHIP_STATUS,
  DEMAND_STATUS_IDS,
  PLATFORM_IDS,
  RELATIONSHIP_STATUS_IDS,
  SOURCE_TYPE_IDS,
  WAITLIST_MODE_IDS,
} from "@/lib/waitlist/constants";
import {
  advisoryDuplicates,
  blockingDuplicates,
  findSimilarDemandSources,
} from "@/lib/waitlist/duplicate-sources";
import {
  sanitiseSocialImages,
  sanitiseSocialImageUrls,
  sanitiseWording,
} from "@/lib/waitlist/library";
import { isTopicArtId } from "@/lib/waitlist/topic-art";
import {
  createUniqueSourceCode,
  getGlobalThreshold,
  toIso,
  waitlistDb,
} from "@/lib/waitlist/server";
import { buildTrackedUrl, type TopicUrlOptions } from "@/lib/waitlist/tracked-url";
import type { DemandSourceRow, SourceLinkRow } from "@/lib/waitlist/types";

// Demand sources - admin or super_admin.
//
// These records hold internal notes and posting rules, and the registrations
// endpoint behind them exposes email addresses. Opened to `admin` deliberately;
// tighten to super_admin only (requireAdmin(req, { superAdminOnly: true })) if
// that access should narrow again.

export const runtime = "nodejs";

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Public origin of this deployment, used to build copyable tracked links. */
function originFrom(req: NextRequest): string {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://operatorcalling.com";
}

function buildLinkRow(
  id: string,
  data: FirebaseFirestore.DocumentData,
  origin: string,
  // The topic lives on the source, not the link, so it has to be passed in.
  topic?: TopicUrlOptions
): SourceLinkRow {
  return {
    id,
    sourceCode: data.sourceCode ?? "",
    platformId: data.platformId ?? "",
    demandSourceId: data.demandSourceId ?? "",
    outreachId: data.outreachId ?? null,
    groupId: data.groupId ?? null,
    formType: data.formType ?? "waitlist",
    status: data.status ?? "active",
    label: data.label ?? "",
    trackedUrl: buildTrackedUrl(origin, data.sourceCode ?? "", topic),
    createdAt: toIso(data.createdAt),
    createdBy: data.createdBy ?? null,
    ownerId: ownerIdOf(data),
    ownerName: ownerNameOf(data),
    ownerEmail: ownerEmailOf(data),
    firstUsedAt: toIso(data.firstUsedAt),
    lastUsedAt: toIso(data.lastUsedAt),
    totalVisitCount: data.totalVisitCount ?? 0,
    uniqueVisitCount: data.uniqueVisitCount ?? 0,
    signupCount: data.signupCount ?? 0,
    organiserInterestCount: data.organiserInterestCount ?? 0,
    shareClickCount: data.shareClickCount ?? 0,
    posted: data.posted === true,
    hidden: data.hidden === true,
  };
}

// ─── GET - list every demand source with its tracked links ───────────────────

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // What this caller may see is decided here, from their role in the `admins`
  // collection. `?scope=` is only a request: an ordinary admin asking for
  // anything but their own work is refused, not narrowed.
  const scope = resolveScope(caller, req.nextUrl.searchParams.get("scope"));
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  try {
    const db = waitlistDb();
    const origin = originFrom(req);
    const globalThreshold = await getGlobalThreshold(db);

    const [allSourceSnap, allLinkSnap] = await Promise.all([
      db.collection(COLLECTIONS.demandSources).get(),
      db.collection(COLLECTIONS.sourceLinks).get(),
    ]);
    // Filtered after the read: ownership is absent on legacy documents, which no
    // Firestore equality query can express. The same filter applies to links
    // through their source, so a link can never surface without its source.
    const sourceDocs = allSourceSnap.docs.filter((d) => matchesScope(d.data(), scope.filter));
    const visibleIds = new Set(sourceDocs.map((d) => d.id));
    const sourceSnap = { docs: sourceDocs };
    const linkSnap = {
      docs: allLinkSnap.docs.filter((d) => visibleIds.has(d.data().demandSourceId ?? "")),
    };

    // Calls state for any source that has a group, so the panel can show
    // whether a group is actually calling without a second round trip.
    const callsState = new Map<
      string,
      { callsEnabled: boolean; callsPausedReason: string | null }
    >();
    const groupIds = sourceSnap.docs
      .map((d) => d.data().groupId as string | undefined)
      .filter((v): v is string => !!v);

    if (groupIds.length > 0) {
      const gDb = groupsDb();
      const groupDocs = await Promise.all(
        groupIds.map((gid) => gDb.collection("groups").doc(gid).get())
      );
      for (const gd of groupDocs) {
        if (!gd.exists) continue;
        const g = gd.data() ?? {};
        callsState.set(gd.id, {
          callsEnabled: g.callsEnabled === true,
          callsPausedReason: g.callsPausedReason ?? null,
        });
      }
    }

    // Built before the link rows: each link's copyable URL may carry its
    // source's topic, and the link document has no idea what that topic is.
    const topicBySource = new Map<string, TopicUrlOptions>();
    for (const doc of sourceSnap.docs) {
      const data = doc.data();
      topicBySource.set(doc.id, {
        topicName: data.topicName ?? "",
        includeTopicInUrl: data.includeTopicInUrl === true,
      });
    }

    const linksBySource = new Map<string, SourceLinkRow[]>();
    for (const doc of linkSnap.docs) {
      const data = doc.data();
      const row = buildLinkRow(
        doc.id,
        data,
        origin,
        topicBySource.get(data.demandSourceId ?? "")
      );
      const list = linksBySource.get(row.demandSourceId) ?? [];
      list.push(row);
      linksBySource.set(row.demandSourceId, list);
    }

    const sources: DemandSourceRow[] = sourceSnap.docs.map((doc) => {
      const data = doc.data();
      const perSource =
        typeof data.demandThreshold === "number" && data.demandThreshold > 0
          ? data.demandThreshold
          : null;
      const uniqueVisitCount = data.uniqueVisitCount ?? 0;
      const signupCount = data.signupCount ?? 0;
      // Falls back to the counter for sources registered before unique counting
      // existed; evaluateThreshold refreshes it on the next signup.
      const uniqueRegistrationCount =
        typeof data.uniqueRegistrationCount === "number"
          ? data.uniqueRegistrationCount
          : signupCount;

      return {
        id: doc.id,
        platformId: data.platformId ?? "other",
        sourceName: data.sourceName ?? "",
        sourceType: data.sourceType ?? "other",
        topicName: data.topicName ?? "",
        includeTopicInUrl: data.includeTopicInUrl === true,
        sourceUrl: data.sourceUrl ?? "",
        publicDisplayName: data.publicDisplayName ?? "",
        publicAudienceLabel: data.publicAudienceLabel ?? "",
        publicEyebrow: data.publicEyebrow ?? "",
        publicDescription: data.publicDescription ?? "",
        // Sent raw, exactly as stored. The panel resolves the fallback through
        // the same presentation code the page uses rather than second-guessing
        // it here.
        waitlistMode: data.waitlistMode ?? "",
        connectionType: data.connectionType ?? "",
        topicArtId: data.topicArtId ?? "",
        familyName: data.familyName ?? "",
        heroImageUrl: data.heroImageUrl ?? null,
        heroImagePath: data.heroImagePath ?? null,
        heroImageUploadedAt: toIso(data.heroImageUploadedAt),
        heroImageUploadedBy: data.heroImageUploadedBy ?? null,
        imageChoice: typeof data.imageChoice === "string" ? data.imageChoice : "",
        imageChoiceUrl: data.imageChoiceUrl ?? null,
        socialImages: sanitiseSocialImages(data.socialImages),
        socialImageUrls: sanitiseSocialImageUrls(data.socialImageUrls),
        wording: sanitiseWording(data.wording),
        wordingTemplateLabel: data.wordingTemplateLabel ?? null,
        internalNotes: data.internalNotes ?? "",
        postingRules: data.postingRules ?? "",
        relationshipStatus:
          data.relationshipStatus ?? DEFAULT_RELATIONSHIP_STATUS,
        status: data.status ?? "active_waitlist",
        statusBeforeArchive: data.statusBeforeArchive ?? null,
        groupId: data.groupId ?? null,
        demandThreshold: perSource,
        effectiveThreshold: perSource ?? globalThreshold,
        totalVisitCount: data.totalVisitCount ?? 0,
        uniqueVisitCount,
        signupCount,
        uniqueRegistrationCount,
        organiserInterestCount: data.organiserInterestCount ?? 0,
        testerCount: data.testerCount ?? 0,
        activeMemberCount: data.activeMemberCount ?? 0,
        pendingMemberCount: data.pendingMemberCount ?? 0,
        reviewRequiredAfterCreate: data.reviewRequiredAfterCreate === true,
        autoCreatedGroupAt: toIso(data.autoCreatedGroupAt),
        callsEnabled: data.groupId
          ? (callsState.get(data.groupId)?.callsEnabled ?? false)
          : false,
        callsPausedReason: data.groupId
          ? (callsState.get(data.groupId)?.callsPausedReason ?? null)
          : null,
        lastPostedAt: toIso(data.lastPostedAt),
        outreachCount: data.outreachCount ?? 0,
        shareClickCount: data.shareClickCount ?? 0,
        conversionRate:
          uniqueVisitCount > 0 ? signupCount / uniqueVisitCount : 0,
        thresholdReachedAt: toIso(data.thresholdReachedAt),
        reviewedAt: toIso(data.reviewedAt),
        reviewedBy: data.reviewedBy ?? null,
        createdAt: toIso(data.createdAt),
        createdBy: data.createdBy ?? null,
        ownerId: ownerIdOf(data),
        ownerName: ownerNameOf(data),
        ownerEmail: ownerEmailOf(data),
        lastAdminActivityAt: toIso(data.lastAdminActivityAt),
        lastAdminActivityBy: data.lastAdminActivityBy ?? null,
        updatedAt: toIso(data.updatedAt),
        links: linksBySource.get(doc.id) ?? [],
      };
    });

    sources.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    // The filter choices a super admin gets: every admin who has signed in (an
    // owner is a Firebase UID, so someone who never has cannot own anything yet).
    // Ordinary admins get nothing here.
    const owners = caller.role === "super_admin" ? await listAdminOwners() : [];

    return NextResponse.json({
      sources,
      globalThreshold,
      viewer: { role: caller.role, ownerId: ownerStampFor(caller).ownerId },
      scope: scope.filter,
      owners,
    });
  } catch (err) {
    console.error("[admin/demand-sources GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── POST - create a demand source and its first tracked link ────────────────

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

  const sourceName = str(body.sourceName, 200);
  if (!sourceName) {
    return NextResponse.json({ error: "Source name is required" }, { status: 400 });
  }

  const platformId = PLATFORM_IDS.includes(str(body.platformId, 40))
    ? str(body.platformId, 40)
    : "other";
  const sourceType = SOURCE_TYPE_IDS.includes(str(body.sourceType, 40))
    ? str(body.sourceType, 40)
    : "other";

  // Relationship status is only ever what an authorised user explicitly chose,
  // and defaults to the most conservative value.
  const relationshipStatus = RELATIONSHIP_STATUS_IDS.includes(
    str(body.relationshipStatus, 40)
  )
    ? str(body.relationshipStatus, 40)
    : DEFAULT_RELATIONSHIP_STATUS;

  const status = DEMAND_STATUS_IDS.includes(str(body.status, 40))
    ? str(body.status, 40)
    : "active_waitlist";

  const thresholdRaw = body.demandThreshold;
  const demandThreshold =
    typeof thresholdRaw === "number" && thresholdRaw > 0
      ? Math.floor(thresholdRaw)
      : null;

  const topicName = str(body.topicName, 200);
  // Cosmetic only, and meaningless without a topic to put in the URL.
  const includeTopicInUrl = body.includeTopicInUrl === true && !!topicName;

  try {
    const db = waitlistDb();

    // Duplicate guard. Enforced here rather than in either caller so it holds
    // for the outreach panel, the spreadsheet view and anything written later:
    // a check that only one screen performs is a check that eventually gets
    // routed around.
    //
    // Only an identical canonical URL refuses the create. A matching name is
    // returned with the created source instead, for the caller to show - it is
    // worth knowing about and not worth blocking a correct create over.
    let advisory: Awaited<ReturnType<typeof findSimilarDemandSources>> = [];
    if (body.acknowledgeDuplicates !== true) {
      const matches = await findSimilarDemandSources(db, {
        sourceName,
        platformId,
        topicName,
        audienceLabel: str(body.publicAudienceLabel, 200),
        sourceUrl: str(body.sourceUrl, 1000),
      });
      const blocking = blockingDuplicates(matches);
      if (blocking.length > 0) {
        return NextResponse.json(
          {
            error: "A source with this URL already exists",
            similar: blocking,
            requiresAcknowledgement: true,
          },
          { status: 409 }
        );
      }
      advisory = advisoryDuplicates(matches);
    }

    const sourceRef = await db.collection(COLLECTIONS.demandSources).add({
      platformId,
      sourceName,
      sourceType,
      topicName,
      includeTopicInUrl,
      sourceUrl: str(body.sourceUrl, 1000),
      publicDisplayName: str(body.publicDisplayName, 200),
      publicAudienceLabel: str(body.publicAudienceLabel, 200),
      publicEyebrow: str(body.publicEyebrow, 80),
      publicDescription: str(body.publicDescription, 1000),
      waitlistMode: WAITLIST_MODE_IDS.includes(str(body.waitlistMode, 40))
        ? str(body.waitlistMode, 40)
        : "community",
      connectionType: CONNECTION_TYPE_IDS.includes(str(body.connectionType, 40))
        ? str(body.connectionType, 40)
        : DEFAULT_CONNECTION_TYPE,
      // Validated against the curated set, so an unknown id can never reach the
      // page and produce a broken hero.
      topicArtId: isTopicArtId(body.topicArtId) ? body.topicArtId : "",
      familyName: str(body.familyName, 120),
      // Only ever set by the image route, which requires the public-visibility
      // confirmation. It must not be settable by a plain create or edit.
      heroImageUrl: null,
      heroImagePath: null,
      // Unset: the page follows the default picture and wording until someone
      // chooses otherwise.
      imageChoice: "",
      imageChoiceUrl: null,
      socialImages: {},
      socialImageUrls: {},
      wording: null,
      wordingTemplateLabel: null,
      internalNotes: str(body.internalNotes, 4000),
      postingRules: str(body.postingRules, 2000),
      relationshipStatus,
      status,
      groupId: null,
      demandThreshold,
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
      label: str(body.linkLabel, 500) || "Primary link",
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
    });

    // A new link has no card yet. Made now, so it is ready before anyone can
    // paste the link into WhatsApp.
    after(() => warmWaitlistCard(sourceCode));

    await recordAdminActivity(db, caller, {
      action: "source.create",
      targetType: "source",
      targetId: sourceRef.id,
      demandSourceId: sourceRef.id,
      ownerId: ownerStampFor(caller).ownerId,
      summary: `Created source "${sourceName}"`,
    });

    return NextResponse.json({
      id: sourceRef.id,
      sourceCode,
      trackedUrl: buildTrackedUrl(originFrom(req), sourceCode, {
        topicName,
        includeTopicInUrl,
      }),
      // Created, and here is what it resembles. Empty unless a name matched.
      similar: advisory,
    });
  } catch (err) {
    console.error("[admin/demand-sources POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
