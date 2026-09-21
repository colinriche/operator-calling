// ─── Demand-source duplicate detection ───────────────────────────────────────
//
// Server-only: scans the demand-source collection through the Admin SDK.
//
// The sibling of findSimilarGroups in group-linking.ts, one level earlier in
// the funnel. That one asks "does a group already cover this audience?" before
// creating a group; this asks "are we already tracking this place?" before
// creating a source - and the cost of getting it wrong is the same shape.
// A second source for the same subreddit splits its registrations across two
// records, so neither ever reaches the threshold and the community that was
// ready never gets its group.
//
// Two signals, deliberately different in kind:
//
//   the URL     evidence. Two sources pointing at the same normalised URL are
//               the same place, whatever they are called.
//   the name    a guess. Scored with the same tokeniser group matching uses,
//               and only ever advisory - an admin can override it.

import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "./constants";
import { tokenise } from "./group-linking";
import { normaliseDestinationUrl } from "./outreach";
import type { SimilarSourceRow } from "./types";

/** Wire shape lives in types.ts so client components can render these. */
export type SimilarSource = SimilarSourceRow;

/** Above this, creating without an explicit acknowledgement is refused. */
export const STRONG_DUPLICATE_SOURCE_SCORE = 0.5;

export interface DuplicateSourceInput {
  sourceName: string;
  topicName: string;
  audienceLabel: string;
  sourceUrl: string;
  /** The source being edited, so a row never matches itself. */
  excludeId?: string;
}

/**
 * Score existing demand sources against a proposed one.
 *
 * Archived sources are included on purpose. Somebody archiving a subreddit and
 * later adding it again is the single most likely way to end up with two
 * records for one place, and the right answer there is to unarchive the
 * original - which the caller can only offer if it is told the original exists.
 */
export async function findSimilarDemandSources(
  db: Firestore,
  input: DuplicateSourceInput
): Promise<SimilarSource[]> {
  const normalisedUrl = normaliseDestinationUrl(input.sourceUrl ?? "");
  const needleText = [input.sourceName, input.topicName, input.audienceLabel]
    .filter(Boolean)
    .join(" ");
  const needle = new Set(tokenise(needleText));

  // Nothing to match on at all. A source with no name and no URL is caught by
  // the route's own validation, not here.
  if (needle.size === 0 && !normalisedUrl) return [];

  // Bounded scan, as in findSimilarGroups: the collection is small and this
  // avoids needing a composite index for a check that runs once per create.
  const snap = await db.collection(COLLECTIONS.demandSources).limit(500).get();

  const results: SimilarSource[] = [];
  for (const doc of snap.docs) {
    if (doc.id === input.excludeId) continue;
    const data = doc.data();

    const sourceName = (data.sourceName ?? "") as string;
    const sourceUrl = (data.sourceUrl ?? "") as string;

    const exactUrl =
      !!normalisedUrl && normaliseDestinationUrl(sourceUrl) === normalisedUrl;

    let score = 0;
    let reason = "";

    if (exactUrl) {
      score = 1;
      reason = "Same URL - this is the same place";
    } else if (needle.size > 0) {
      const hay = new Set(
        tokenise(
          [
            sourceName,
            data.topicName ?? "",
            data.publicAudienceLabel ?? "",
            data.publicDisplayName ?? "",
          ].join(" ")
        )
      );
      if (hay.size === 0) continue;

      let shared = 0;
      for (const token of needle) if (hay.has(token)) shared++;
      if (shared === 0) continue;

      // Relative to the shorter side, so a source with a long audience label
      // does not dilute an otherwise exact name match.
      score = shared / Math.min(needle.size, hay.size);

      const nameTokens = new Set(tokenise(sourceName));
      let nameShared = 0;
      for (const token of needle) if (nameTokens.has(token)) nameShared++;

      score = Math.min(1, nameShared > 0 ? score + 0.25 : score);
      reason = nameShared > 0 ? "Name overlaps" : "Topic or audience overlaps";
    } else {
      continue;
    }

    results.push({
      id: doc.id,
      sourceName: sourceName || "(unnamed source)",
      platformId: (data.platformId ?? "other") as string,
      sourceType: (data.sourceType ?? "other") as string,
      sourceUrl,
      status: (data.status ?? "active_waitlist") as string,
      topicName: (data.topicName ?? "") as string,
      uniqueRegistrationCount:
        typeof data.uniqueRegistrationCount === "number"
          ? data.uniqueRegistrationCount
          : (data.signupCount ?? 0),
      score,
      reason,
      exactUrl,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

/** The matches worth stopping for, as opposed to the ones worth mentioning. */
export function blockingDuplicates(matches: SimilarSource[]): SimilarSource[] {
  return matches.filter(
    (m) => m.exactUrl || m.score >= STRONG_DUPLICATE_SOURCE_SCORE
  );
}
