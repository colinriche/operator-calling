// Server-only: imports firebase-admin and reads privileged fields. Never import
// this from a Client Component — use lib/waitlist/constants.ts or copy.ts there.

import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  COLLECTIONS,
  DEFAULT_DEMAND_THRESHOLD,
  DEMAND_SETTINGS_DOC,
  DEFAULT_RELATIONSHIP_STATUS,
  GENERAL_DEMAND_SOURCE_ID,
  LIVE_DEMAND_STATUSES,
  SHARE_CHANNELS,
  TESTER_CONSENT_VERSION,
  TESTER_STATUSES,
  type ShareChannel,
  type TesterStatus,
} from "./constants";
import { canonicalEmail, normaliseEmail } from "./email";
import {
  buildWaitlistPresentation,
  globalContext,
  waitlistContextFrom,
} from "./presentation";
import {
  generateManageToken,
  generateSourceCode,
  normaliseSourceCode,
  stableHash,
} from "./source-code";
import type {
  RegistrationInput,
  RegistrationResult,
  WaitlistContext,
} from "./types";

// ─── Project routing ─────────────────────────────────────────────────────────
//
// All waitlist and demand data lives in the "staging" project
// (operator-calling) — the project the mobile app reads, so demand sources and
// registrations sit alongside the groups they eventually become.
//
// This moved off the old dev project once the flow had been exercised.
// Nothing was migrated: the dev collections held test data only.
//
// Two consequences worth knowing, both deliberate:
//
// The website now uses one project for everything, so this is the same handle
// the admin gate, groups and sign-in use. Without FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY it throws by name rather than falling back anywhere.

export function waitlistDb(): Firestore {
  return getAdminDb();
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

/**
 * Resolve everything the public page needs from a raw `?s=` value. Platform,
 * audience label, group link, relationship status, page mode and imagery are
 * all read from the database — never accepted from the query string — so a
 * visitor cannot forge an endorsement, or a family name, by editing the URL.
 *
 * The mapping itself lives in lib/waitlist/presentation.ts, shared with the
 * admin preview, so the page an admin is shown is built by the same code that
 * builds the page a visitor gets.
 */
export async function resolveWaitlistContext(
  rawCode: unknown,
  rawShareChannel: unknown
): Promise<WaitlistContext> {
  const shareChannel = normaliseShareChannel(rawShareChannel);
  const code = normaliseSourceCode(rawCode);
  if (!code) return globalContext(shareChannel);

  try {
    const db = waitlistDb();
    const resolved = await resolveSource(db, code);
    if (!resolved) {
      // Record the miss for debugging without exposing anything to the visitor.
      console.warn(`[waitlist] unresolved source code: ${code}`);
      return globalContext(shareChannel);
    }

    const { linkId, sourceId, sourceData } = resolved;

    return waitlistContextFrom(sourceData, {
      sourceCode: code,
      demandSourceId: sourceId,
      sourceLinkId: linkId,
      shareChannel,
      attributed: true,
    });
  } catch (err) {
    console.error("[waitlist] context resolution failed:", err);
    return globalContext(shareChannel);
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
  const canonical = canonicalEmail(input.email);

  const code = normaliseSourceCode(input.sourceCode);
  const resolved = code ? await resolveSource(db, code) : null;

  const demandSourceId = resolved?.sourceId ?? GENERAL_DEMAND_SOURCE_ID;
  const sourceData = resolved?.sourceData ?? {};

  // Taken from the presentation rather than straight off the source, so the
  // confirmation email names the same thing the page they joined from did — a
  // family by its name, a global page as talking with new people, and not the
  // neutral "people who share this interest" fallback in either case.
  const audienceLabel = buildWaitlistPresentation(
    waitlistContextFrom(sourceData, {
      sourceCode: code,
      demandSourceId: resolved?.sourceId ?? null,
      sourceLinkId: resolved?.linkId ?? null,
      shareChannel: null,
      attributed: !!resolved,
    })
  ).interestLabel;

  // Identity is the canonical address, not the stored one, so a Gmail user
  // cannot register the same mailbox repeatedly with dots and +tags.
  const entryId = `${demandSourceId}__${stableHash(canonical)}`;
  const entryRef = db.collection(COLLECTIONS.waitlistEntries).doc(entryId);

  // Generated up front so the transaction stays deterministic; only actually
  // written for a new entry, since an existing one keeps the token it already
  // issued.
  const manageToken = generateManageToken();

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

      // Tester status is never touched here. Joining requires a verified
      // account and happens only through the authenticated tester route, so an
      // unauthenticated resubmission must not be able to activate, reactivate
      // or alter it.
      const previousTester: TesterStatus = TESTER_STATUSES.includes(
        previous.testerStatus
      )
        ? previous.testerStatus
        : "none";

      tx.set(
        entryRef,
        {
          // Later submissions may correct these; createdAt is never touched.
          displayName: input.displayName,
          country: input.country,
          englishFirstLanguage: input.englishFirstLanguage,
          firstLanguage: input.firstLanguage,
          timezone: input.timezone,
          timezoneSource: input.timezoneSource,
          ...(upgrade ? { interestedInOrganising: true } : {}),
          // Same one-way rule as organiser interest: a resubmission can add it
          // but never silently withdraw it, so an unticked box on a second
          // visit cannot erase something they asked for on the first.
          ...(input.familyInterest ? { familyInterest: true } : {}),
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

      return {
        created: false,
        organiserUpgraded: upgrade,
        // Reuse the existing token — regenerating would silently break a link
        // they had already saved.
        manageToken: (previous.manageToken as string) ?? manageToken,
        testerStatus: previousTester,
      };
    }

    tx.set(entryRef, {
      email: input.email.trim(),
      normalisedEmail,
      canonicalEmail: canonical,
      displayName: input.displayName,
      interestedInOrganising: input.interestedInOrganising,
      // Separate from the community they registered for, and deliberately not
      // a demand source of its own: it records that this person would want The
      // Operator for their family too, nothing more.
      familyInterest: input.familyInterest,
      country: input.country,
      englishFirstLanguage: input.englishFirstLanguage,
      firstLanguage: input.firstLanguage,

      // Community interest and tester status are independent. A registration
      // can carry either, both, or only the tester side (no tracked link).
      communityInterest: !!resolved,
      // Always "none". Only the authenticated tester route can change this.
      testerStatus: "none",
      testerConsentAt: null,
      testerConsentVersion: null,
      testerJoinedFromSourceCode: null,

      timezone: input.timezone,
      timezoneSource: input.timezoneSource,

      manageToken,
      manageTokenCreatedAt: FieldValue.serverTimestamp(),

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
      // Threshold is NOT decided here. It is evaluated after the transaction
      // against a real count of entry documents, so it can never be driven by a
      // counter that has drifted — see evaluateThreshold below.
      tx.set(
        sourceRef,
        {
          signupCount: FieldValue.increment(1),
          ...(input.interestedInOrganising
            ? { organiserInterestCount: FieldValue.increment(1) }
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

    return {
      created: true,
      organiserUpgraded: false,
      manageToken,
      testerStatus: "none" as TesterStatus,
    };
  });

  // Only a genuinely new registration can move a source towards its threshold.
  if (outcome.created && resolved) {
    try {
      const threshold = await evaluateThreshold(db, resolved.sourceId);

      // Crossing the line opens the group immediately. Deferring to a human
      // means a community that fills up on a Friday night waits until Monday,
      // which is the moment its interest is highest. The safety net is the
      // review flag set on the source, not a gate before creation.
      if (threshold?.justReached) {
        const { activateCommunityGroup } = await import("./activation");
        const createdBy =
          (resolved.sourceData.createdBy as string | undefined) ?? null;
        if (createdBy) {
          await activateCommunityGroup(resolved.sourceId, createdBy);
        } else {
          console.warn(
            `[waitlist] source ${resolved.sourceId} reached threshold but has no createdBy to own the group`
          );
        }
      }
    } catch (err) {
      // The person is registered either way; a failed threshold check or group
      // activation must not turn into a failed signup. The next registration
      // re-evaluates, and the admin panel recomputes on load.
      console.error("[waitlist] threshold evaluation failed:", err);
    }
  }

  return {
    ...outcome,
    audienceLabel,
    interestedInOrganising: input.interestedInOrganising,
    communityInterest: !!resolved,
    timezone: input.timezone,
  };
}

// ─── Threshold evaluation ────────────────────────────────────────────────────

/**
 * Count the registrations that actually exist for a source.
 *
 * One document per (source, canonical email), so this is a count of unique
 * normalised registrations by construction — dots and +tags on a Gmail address
 * all collapse onto the same document and are counted once.
 *
 * Uses an aggregate count rather than reading the documents: cheap, exact, and
 * unaffected by how many entries there are.
 */
export async function countUniqueRegistrations(
  db: Firestore,
  demandSourceId: string
): Promise<number> {
  const snap = await db
    .collection(COLLECTIONS.waitlistEntries)
    .where("demandSourceId", "==", demandSourceId)
    .count()
    .get();
  return snap.data().count;
}

export interface ThresholdOutcome {
  uniqueRegistrations: number;
  effectiveThreshold: number;
  /** True only on the transition, so callers can act once. */
  justReached: boolean;
}

/**
 * Decide whether a source has met its threshold, counting real documents rather
 * than trusting the incrementing counter.
 *
 * Deliberately separate from the registration transaction: the aggregate query
 * cannot run inside one, and basing an automatic group creation on a cached
 * number is exactly the kind of thing that silently creates a group for four
 * people. The stamp is written conditionally so concurrent callers cannot both
 * report `justReached`.
 */
export async function evaluateThreshold(
  db: Firestore,
  demandSourceId: string
): Promise<ThresholdOutcome | null> {
  const sourceRef = db.collection(COLLECTIONS.demandSources).doc(demandSourceId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) return null;

  const data = sourceSnap.data() ?? {};
  const globalThreshold = await getGlobalThreshold(db);
  const effectiveThreshold =
    typeof data.demandThreshold === "number" && data.demandThreshold > 0
      ? data.demandThreshold
      : globalThreshold;

  const uniqueRegistrations = await countUniqueRegistrations(db, demandSourceId);
  const met = effectiveThreshold > 0 && uniqueRegistrations >= effectiveThreshold;

  // Keep the cached counter honest so the dashboard cannot disagree with the
  // number the threshold decision was actually made on.
  const updates: Record<string, unknown> = {
    uniqueRegistrationCount: uniqueRegistrations,
  };

  const justReached = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(sourceRef);
    const current = fresh.data() ?? {};
    const alreadyStamped = !!current.thresholdReachedAt;

    if (met && !alreadyStamped && !current.groupId) {
      tx.set(
        sourceRef,
        {
          ...updates,
          status:
            current.status === "active_waitlist" || current.status === "researching"
              ? "threshold_reached"
              : current.status,
          thresholdReachedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return true;
    }

    tx.set(sourceRef, updates, { merge: true });
    return false;
  });

  return { uniqueRegistrations, effectiveThreshold, justReached };
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
