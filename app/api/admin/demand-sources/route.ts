import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import {
  COLLECTIONS,
  DEFAULT_RELATIONSHIP_STATUS,
  DEMAND_STATUS_IDS,
  PLATFORM_IDS,
  RELATIONSHIP_STATUS_IDS,
  SOURCE_TYPE_IDS,
} from "@/lib/waitlist/constants";
import {
  createUniqueSourceCode,
  getGlobalThreshold,
  toIso,
  waitlistDb,
} from "@/lib/waitlist/server";
import type { DemandSourceRow, SourceLinkRow } from "@/lib/waitlist/types";

// Demand sources — admin or super_admin.
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
  origin: string
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
    trackedUrl: `${origin}/waitlist?s=${data.sourceCode ?? ""}`,
    createdAt: toIso(data.createdAt),
    createdBy: data.createdBy ?? null,
    firstUsedAt: toIso(data.firstUsedAt),
    lastUsedAt: toIso(data.lastUsedAt),
    totalVisitCount: data.totalVisitCount ?? 0,
    uniqueVisitCount: data.uniqueVisitCount ?? 0,
    signupCount: data.signupCount ?? 0,
    organiserInterestCount: data.organiserInterestCount ?? 0,
    shareClickCount: data.shareClickCount ?? 0,
  };
}

// ─── GET — list every demand source with its tracked links ───────────────────

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    const db = waitlistDb();
    const origin = originFrom(req);
    const globalThreshold = await getGlobalThreshold(db);

    const [sourceSnap, linkSnap] = await Promise.all([
      db.collection(COLLECTIONS.demandSources).get(),
      db.collection(COLLECTIONS.sourceLinks).get(),
    ]);

    const linksBySource = new Map<string, SourceLinkRow[]>();
    for (const doc of linkSnap.docs) {
      const row = buildLinkRow(doc.id, doc.data(), origin);
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
        sourceUrl: data.sourceUrl ?? "",
        publicDisplayName: data.publicDisplayName ?? "",
        publicAudienceLabel: data.publicAudienceLabel ?? "",
        publicDescription: data.publicDescription ?? "",
        internalNotes: data.internalNotes ?? "",
        postingRules: data.postingRules ?? "",
        relationshipStatus:
          data.relationshipStatus ?? DEFAULT_RELATIONSHIP_STATUS,
        status: data.status ?? "active_waitlist",
        groupId: data.groupId ?? null,
        demandThreshold: perSource,
        effectiveThreshold: perSource ?? globalThreshold,
        totalVisitCount: data.totalVisitCount ?? 0,
        uniqueVisitCount,
        signupCount,
        uniqueRegistrationCount,
        organiserInterestCount: data.organiserInterestCount ?? 0,
        shareClickCount: data.shareClickCount ?? 0,
        conversionRate:
          uniqueVisitCount > 0 ? signupCount / uniqueVisitCount : 0,
        thresholdReachedAt: toIso(data.thresholdReachedAt),
        reviewedAt: toIso(data.reviewedAt),
        reviewedBy: data.reviewedBy ?? null,
        createdAt: toIso(data.createdAt),
        createdBy: data.createdBy ?? null,
        updatedAt: toIso(data.updatedAt),
        links: linksBySource.get(doc.id) ?? [],
      };
    });

    sources.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return NextResponse.json({ sources, globalThreshold });
  } catch (err) {
    console.error("[admin/demand-sources GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── POST — create a demand source and its first tracked link ────────────────

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

  try {
    const db = waitlistDb();

    const sourceRef = await db.collection(COLLECTIONS.demandSources).add({
      platformId,
      sourceName,
      sourceType,
      topicName: str(body.topicName, 200),
      sourceUrl: str(body.sourceUrl, 1000),
      publicDisplayName: str(body.publicDisplayName, 200),
      publicAudienceLabel: str(body.publicAudienceLabel, 200),
      publicDescription: str(body.publicDescription, 1000),
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
      label: str(body.linkLabel, 120) || "Primary link",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      firstUsedAt: null,
      lastUsedAt: null,
      totalVisitCount: 0,
      uniqueVisitCount: 0,
      signupCount: 0,
      organiserInterestCount: 0,
      shareClickCount: 0,
    });

    return NextResponse.json({
      id: sourceRef.id,
      sourceCode,
      trackedUrl: `${originFrom(req)}/waitlist?s=${sourceCode}`,
    });
  } catch (err) {
    console.error("[admin/demand-sources POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
