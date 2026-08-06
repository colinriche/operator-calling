// Server-only: imports firebase-admin and reads privileged fields. Never import
// this from a Client Component — use lib/waitlist/constants.ts or copy.ts there.

import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getProjectDb } from "@/lib/firebase-admin";
import {
  COLLECTIONS,
  DEFAULT_DEMAND_THRESHOLD,
  DEMAND_SETTINGS_DOC,
  DEFAULT_RELATIONSHIP_STATUS,
  GENERAL_DEMAND_SOURCE_ID,
  LIVE_DEMAND_STATUSES,
  SHARE_CHANNELS,
  type ShareChannel,
} from "./constants";
import { resolveAudienceLabel, resolveDisclaimer } from "./copy";
import {
  generateSourceCode,
  normaliseEmail,
  normaliseSourceCode,
  shortHash,
} from "./source-code";
import type {
  RegistrationInput,
  RegistrationResult,
  WaitlistContext,
} from "./types";

// ─── Project routing ─────────────────────────────────────────────────────────
//
// All waitlist and demand data lives in the "staging" project
// (operator-calling) — the same project the main mobile app reads groups from,
// so a demand source that graduates into a real group ends up alongside it.
// Admin role checks still run against the "dev" project, where web sign-in and
// the `user` role documents live.

export function waitlistDb(): Firestore {
  return getProjectDb("staging");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toIso(value: unknown): string | null {
  const date =
    (value as { toDate?: () => Date } | null)?.toDate?.() ??
    (value instanceof Date ? value : null);
  return date ? date.toISOString() : null;
}

export function normaliseShareChannel(raw: unknown): ShareChannel | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return (SHARE_CHANNELS as readonly string[]).includes(value)
    ? (value as ShareChannel)
    : null;
}

/** Global signup threshold, falling back to the built-in default. */
export async function getGlobalThreshold(db: Firestore): Promise<number> {
  try {
    const snap = await db
      .collection(COLLECTIONS.settings)
      .doc(DEMAND_SETTINGS_DOC)
      .get();
    const value = snap.data()?.minimumWaitlistSignups;
    if (typeof value === "number" && value > 0) return Math.floor(value);
  } catch (err) {
    console.error("[waitlist] threshold settings read failed:", err);
  }
  return DEFAULT_DEMAND_THRESHOLD;
}

// ─── Source-code resolution ──────────────────────────────────────────────────

interface ResolvedSource {
  linkId: string;
  linkData: FirebaseFirestore.DocumentData;
  sourceId: string;
  sourceData: FirebaseFirestore.DocumentData;
}

/**
 * Look up a tracked link and its demand source. Returns null for anything
 * unusable — unknown code, paused/archived link, or a source that is no longer
 * collecting. Callers fall back to the generic waitlist rather than showing an
 * error, so a stale link posted months ago still lands somewhere sensible.
 */
async function resolveSource(
  db: Firestore,
  code: string
): Promise<ResolvedSource | null> {
  const linkSnap = await db
    .collection(COLLECTIONS.sourceLinks)
    .where("sourceCode", "==", code)
    .limit(1)
    .get();

  if (linkSnap.empty) return null;

  const linkDoc = linkSnap.docs[0];
  const linkData = linkDoc.data();
  if (linkData.status !== "active") return null;

  const sourceId = linkData.demandSourceId as string | undefined;
  if (!sourceId) return null;

  const sourceDoc = await db
    .collection(COLLECTIONS.demandSources)
    .doc(sourceId)
    .get();
  if (!sourceDoc.exists) return null;

  const sourceData = sourceDoc.data() ?? {};
  if (!LIVE_DEMAND_STATUSES.includes(sourceData.status ?? "")) return null;

  return { linkId: linkDoc.id, linkData, sourceId, sourceData };
}

/** Neutral context used when there is no usable tracked source. */
function generalContext(shareChannel: ShareChannel | null): WaitlistContext {
  return {
    sourceCode: null,
    demandSourceId: null,
    sourceLinkId: null,
    platformId: null,
    groupId: null,
    audienceLabel: resolveAudienceLabel(null),
    disclaimer: resolveDisclaimer(DEFAULT_RELATIONSHIP_STATUS),
    relationshipStatus: DEFAULT_RELATIONSHIP_STATUS,
    attributed: false,
    shareChannel,
  };
}

/**
 * Resolve everything the public page needs from a raw `?s=` value. Platform,
 * audience label, group link and relationship status are all read from the
 * database — never accepted from the query string — so a visitor cannot forge
 * an endorsement by editing the URL.
 */
export async function resolveWaitlistContext(
  rawCode: unknown,
  rawShareChannel: unknown
): Promise<WaitlistContext> {
  const shareChannel = normaliseShareChannel(rawShareChannel);
  const code = normaliseSourceCode(rawCode);
  if (!code) return generalContext(shareChannel);

  try {
    const db = waitlistDb();
    const resolved = await resolveSource(db, code);
    if (!resolved) {
      // Record the miss for debugging without exposing anything to the visitor.
      console.warn(`[waitlist] unresolved source code: ${code}`);
      return generalContext(shareChannel);
    }

    const { linkId, sourceId, sourceData } = resolved;
    const relationshipStatus =
      sourceData.relationshipStatus ?? DEFAULT_RELATIONSHIP_STATUS;

    return {
      sourceCode: code,
      demandSourceId: sourceId,
      sourceLinkId: linkId,
      platformId: sourceData.platformId ?? null,
      groupId: sourceData.groupId ?? null,
      audienceLabel: resolveAudienceLabel(sourceData.publicAudienceLabel),
      disclaimer: resolveDisclaimer(relationshipStatus),
      relationshipStatus,
      attributed: true,
      shareChannel,
    };
  } catch (err) {
    console.error("[waitlist] context resolution failed:", err);
    return generalContext(shareChannel);
  }
}

// ─── Visits ──────────────────────────────────────────────────────────────────

interface RecordVisitArgs {
  sourceCode: string;
  visitorHash: string;
  shareChannel: ShareChannel | null;
  landingPage: string;
  referrer: string;
}

/**
 * Log a visit and bump counters. Uniqueness is tracked with a marker document
 * per visitor under the link, so "unique visits" survives across serverless
 * instances without storing anything that identifies a person.
 */
export async function recordVisit(args: RecordVisitArgs): Promise<void> {
  const db = waitlistDb();
  const resolved = await resolveSource(db, args.sourceCode);
  if (!resolved) return;

  const { linkId, sourceId } = resolved;
  const linkRef = db.collection(COLLECTIONS.sourceLinks).doc(linkId);
  const sourceRef = db.collection(COLLECTIONS.demandSources).doc(sourceId);
  const visitorRef = linkRef.collection("visitors").doc(args.visitorHash);

  const isUnique = await db.runTransaction(async (tx: Transaction) => {
    const visitorSnap = await tx.get(visitorRef);
    const first = !visitorSnap.exists;

    if (first) {
      tx.set(visitorRef, { firstSeenAt: FieldValue.serverTimestamp() });
    }

    const increments = {
      totalVisitCount: FieldValue.increment(1),
      ...(first ? { uniqueVisitCount: FieldValue.increment(1) } : {}),
    };

    tx.set(
      linkRef,
      {
        ...increments,
        lastUsedAt: FieldValue.serverTimestamp(),
        ...(resolved.linkData.firstUsedAt
          ? {}
          : { firstUsedAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
    tx.set(sourceRef, increments, { merge: true });

    return first;
  });

  // Append-only event log for per-post reporting. Deliberately holds no IP,
  // user agent or anything else tying a visit back to a person.
  await db.collection(COLLECTIONS.sourceVisits).add({
    sourceCode: args.sourceCode,
    demandSourceId: sourceId,
    sourceLinkId: linkId,
    shareChannel: args.shareChannel,
    landingPage: args.landingPage.slice(0, 500),
    referrer: args.referrer.slice(0, 500),
    isUnique,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ─── Share events ────────────────────────────────────────────────────────────

export async function recordShareClick(
  sourceCode: string,
  channel: ShareChannel
): Promise<void> {
  const db = waitlistDb();
  const resolved = await resolveSource(db, sourceCode);

  // Share clicks from the generic (unattributed) page are still worth counting.
  const batch = db.batch();
  batch.set(db.collection(COLLECTIONS.shareEvents).doc(), {
    sourceCode,
    demandSourceId: resolved?.sourceId ?? null,
    sourceLinkId: resolved?.linkId ?? null,
    outreachId: resolved?.linkData.outreachId ?? null,
    shareChannel: channel,
    shareClickedAt: FieldValue.serverTimestamp(),
  });

  if (resolved) {
    batch.set(
      db.collection(COLLECTIONS.sourceLinks).doc(resolved.linkId),
      { shareClickCount: FieldValue.increment(1) },
      { merge: true }
    );
    batch.set(
      db.collection(COLLECTIONS.demandSources).doc(resolved.sourceId),
      { shareClickCount: FieldValue.increment(1) },
      { merge: true }
    );
  }

  await batch.commit();
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Write a waitlist registration, resolving attribution server-side.
 *
 * Duplicate protection uses a deterministic document id per
 * (demand source, email) pair rather than a query-then-write, so two
 * simultaneous submissions cannot both be treated as new and inflate demand.
 * A repeat submission preserves the original createdAt and can only ever
 * upgrade organiser interest from false to true.
 */
export async function registerWaitlistEntry(
  input: RegistrationInput
): Promise<RegistrationResult> {
  const db = waitlistDb();
  const normalisedEmail = normaliseEmail(input.email);

  const code = normaliseSourceCode(input.sourceCode);
  const resolved = code ? await resolveSource(db, code) : null;

  const demandSourceId = resolved?.sourceId ?? GENERAL_DEMAND_SOURCE_ID;
  const sourceData = resolved?.sourceData ?? {};
  const audienceLabel = resolveAudienceLabel(sourceData.publicAudienceLabel);

  const entryId = `${demandSourceId}__${shortHash(normalisedEmail)}`;
  const entryRef = db.collection(COLLECTIONS.waitlistEntries).doc(entryId);

  const threshold = resolved ? await getGlobalThreshold(db) : 0;

  const outcome = await db.runTransaction(async (tx: Transaction) => {
    const existing = await tx.get(entryRef);

    // Read the source inside the transaction so the threshold decision sees the
    // signup we are about to add, and can only fire once.
    const sourceRef = resolved
      ? db.collection(COLLECTIONS.demandSources).doc(resolved.sourceId)
      : null;
    const sourceSnap = sourceRef ? await tx.get(sourceRef) : null;

    if (existing.exists) {
      const previous = existing.data() ?? {};
      const wasOrganiser = previous.interestedInOrganising === true;
      const upgrade = !wasOrganiser && input.interestedInOrganising;

      tx.set(
        entryRef,
        {
          // Later submissions may correct these; createdAt is never touched.
          displayName: input.displayName,
          country: input.country,
          englishFirstLanguage: input.englishFirstLanguage,
          firstLanguage: input.firstLanguage,
          ...(upgrade ? { interestedInOrganising: true } : {}),
          updatedAt: FieldValue.serverTimestamp(),
          submissionCount: FieldValue.increment(1),
        },
        { merge: true }
      );

      // Only the organiser counter can move — signupCount must not grow, or a
      // resubmitted form would push a source over its threshold on its own.
      if (upgrade && sourceRef) {
        tx.set(
          sourceRef,
          { organiserInterestCount: FieldValue.increment(1) },
          { merge: true }
        );
        if (resolved) {
          tx.set(
            db.collection(COLLECTIONS.sourceLinks).doc(resolved.linkId),
            { organiserInterestCount: FieldValue.increment(1) },
            { merge: true }
          );
        }
      }

      return { created: false, organiserUpgraded: upgrade };
    }

    tx.set(entryRef, {
      email: input.email.trim(),
      normalisedEmail,
      displayName: input.displayName,
      interestedInOrganising: input.interestedInOrganising,
      country: input.country,
      englishFirstLanguage: input.englishFirstLanguage,
      firstLanguage: input.firstLanguage,
      sourceCode: code,
      platformId: sourceData.platformId ?? null,
      demandSourceId,
      sourceLinkId: resolved?.linkId ?? null,
      outreachId: resolved?.linkData.outreachId ?? null,
      groupId: sourceData.groupId ?? null,
      sourceType: sourceData.sourceType ?? null,
      relationshipStatusAtSignup:
        sourceData.relationshipStatus ?? DEFAULT_RELATIONSHIP_STATUS,
      shareChannel: normaliseShareChannel(input.shareChannel),
      landingPage: input.landingPage.slice(0, 500),
      referrer: input.referrer.slice(0, 500),
      submissionCount: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (resolved && sourceRef && sourceSnap) {
      const current = sourceSnap.data() ?? {};
      const newSignupCount = (current.signupCount ?? 0) + 1;
      const effectiveThreshold =
        typeof current.demandThreshold === "number" && current.demandThreshold > 0
          ? current.demandThreshold
          : threshold;

      const crossesThreshold =
        effectiveThreshold > 0 &&
        newSignupCount >= effectiveThreshold &&
        !current.thresholdReachedAt;

      tx.set(
        sourceRef,
        {
          signupCount: FieldValue.increment(1),
          ...(input.interestedInOrganising
            ? { organiserInterestCount: FieldValue.increment(1) }
            : {}),
          ...(crossesThreshold
            ? {
                status: "threshold_reached",
                thresholdReachedAt: FieldValue.serverTimestamp(),
              }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        db.collection(COLLECTIONS.sourceLinks).doc(resolved.linkId),
        {
          signupCount: FieldValue.increment(1),
          ...(input.interestedInOrganising
            ? { organiserInterestCount: FieldValue.increment(1) }
            : {}),
        },
        { merge: true }
      );
    }

    return { created: true, organiserUpgraded: false };
  });

  return {
    ...outcome,
    audienceLabel,
    interestedInOrganising: input.interestedInOrganising,
  };
}

// ─── Source code allocation ──────────────────────────────────────────────────

/**
 * Allocate a code no existing link is using. Uniqueness matters: two links
 * sharing a code would silently cross-attribute every visit and signup between
 * two unrelated audiences.
 */
export async function createUniqueSourceCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateSourceCode();
    const existing = await db
      .collection(COLLECTIONS.sourceLinks)
      .where("sourceCode", "==", code)
      .limit(1)
      .get();
    if (existing.empty) return code;
  }
  throw new Error("Could not allocate a unique source code");
}

// ─── Admin reads ─────────────────────────────────────────────────────────────

export function serialiseTimestamps<T extends Record<string, unknown>>(
  data: T,
  fields: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const field of fields) {
    out[field] = toIso(data[field]);
  }
  return out;
}

export { toIso };
