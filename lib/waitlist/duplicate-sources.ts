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
//   the URL     evidence. Two sources whose canonical URL is identical are the
//               same place, whatever they are called. This one, and only this
//               one, refuses the write until somebody says otherwise.
//   the name    a warning. The same name on a compatible platform is worth
//               reading before creating a second record, and nothing more:
//               it is shown and the write goes through.
//
// What is deliberately NOT a signal any more: a shared topic or audience
// label. Every birdwatching source overlaps every other birdwatching source,
// so scoring that overlap flagged sources that had nothing to do with each
// other and taught whoever saw it to click straight past the warning. Two
// records for one place are found by URL or by name, or they are not found.

import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "./constants";
import { tokenise } from "./group-linking";
import {
  canonicalSourceUrl,
  nameContains,
  platformsCompatible,
  sameName,
} from "./source-identity";
import type { SimilarSourceRow } from "./types";

/** Wire shape lives in types.ts so client components can render these. */
export type SimilarSource = SimilarSourceRow;

export interface DuplicateSourceInput {
  sourceName: string;
  /** Narrows name matches: two named, different platforms are two places. */
  platformId?: string;
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
  const url = canonicalSourceUrl(input.sourceUrl ?? "");
  const name = new Set(tokenise(input.sourceName ?? ""));
  const platform = input.platformId ?? "";

  // Nothing identifying to match on. A URL that canonicalises to "" is a bare
  // platform domain or a typo, and a name of nothing but stopwords says as
  // little - neither is grounds for warning about anything.
  if (name.size === 0 && !url) return [];

  // Bounded scan, as in findSimilarGroups: the collection is small and this
  // avoids needing a composite index for a check that runs once per create.
  const snap = await db.collection(COLLECTIONS.demandSources).limit(500).get();

  const results: SimilarSource[] = [];
  for (const doc of snap.docs) {
    if (doc.id === input.excludeId) continue;
    const data = doc.data();

    const sourceName = (data.sourceName ?? "") as string;
    const sourceUrl = (data.sourceUrl ?? "") as string;
    const sourcePlatform = (data.platformId ?? "") as string;

    const otherUrl = canonicalSourceUrl(sourceUrl);
    const exactUrl = !!url && otherUrl === url;

    // Both point somewhere identifying, and it is not the same somewhere.
    // Two subreddits can be called the same thing; they are still two places,
    // and the name is not worth mentioning once the URLs have answered.
    if (!exactUrl && url && otherUrl) continue;

    let score = 0;
    let reason = "";

    if (exactUrl) {
      score = 1;
      reason = "Same URL - this is the same place";
    } else if (name.size > 0 && platformsCompatible(platform, sourcePlatform)) {
      const other = new Set(tokenise(sourceName));
      if (sameName(name, other)) {
        score = 0.8;
        reason = "Same name, ignoring case, punctuation and words like \"group\"";
      } else if (nameContains(name, other)) {
        score = 0.6;
        reason = "One name is the other with extra words";
      } else {
        continue;
      }
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

/**
 * The matches worth refusing a write over, as opposed to the ones worth
 * reading.
 *
 * Only an identical canonical URL qualifies. A name is a judgement - "Leeds
 * 2009 housemates" is a perfectly good name for two different WhatsApp groups
 * - and a guard that refuses writes on a judgement is one that gets overridden
 * by reflex. The name matches are still returned to the caller and still shown;
 * they just do not stand in the way.
 */
export function blockingDuplicates(matches: SimilarSource[]): SimilarSource[] {
  return matches.filter((m) => m.exactUrl);
}

/** The matches to show without stopping anything: everything else. */
export function advisoryDuplicates(matches: SimilarSource[]): SimilarSource[] {
  return matches.filter((m) => !m.exactUrl);
}
