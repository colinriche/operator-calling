// Server-only: reads and writes groups via the Admin SDK.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getProjectDb, type ProjectKey } from "@/lib/firebase-admin";

// ─── Where a created group lands ─────────────────────────────────────────────
//
// "staging" (operator-calling) — the project the mobile app reads. A group
// created in "dev" would never appear in the app, which was acceptable while
// the flow was being tested and is not the end state.
//
// Flipped alongside waitlistDb() in lib/waitlist/server.ts so that a demand
// source and the group it becomes live in the same project. Nothing was
// migrated: the dev groups were test data.
//
// The chosen project is recorded on the demand source as `groupProject`
// alongside `groupId`, so a source linked before the switch still says which
// project its group actually lives in rather than being silently wrong.
//
// Groups created here are still written `callsEnabled: false` with their
// schedules `paused`. Being visible to the app is not the same as calling
// anybody — see docs/calls-enabled-dispatch-guard.md.

export const GROUP_TARGET_PROJECT: ProjectKey = "staging";

export function groupsDb(): Firestore {
  return getProjectDb(GROUP_TARGET_PROJECT);
}

// ─── Duplicate detection ─────────────────────────────────────────────────────
//
// Before creating a group we check whether one already covers this audience.
// Creating a second "live poker" group splits the very demand the waitlist
// spent weeks collecting, and there is no clean way to merge them afterwards.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "in", "on", "at", "to", "with",
  "group", "groups", "calling", "call", "calls", "operator", "people", "chat",
  "club", "uk", "us",
]);

function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export interface SimilarGroup {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  /** 0–1. Above ~0.5 is worth blocking on; lower is worth showing. */
  score: number;
  reason: string;
}

/**
 * Score existing groups against a demand source. Deliberately errs towards
 * showing too many candidates: a false warning costs one click, a missed
 * duplicate costs a split audience.
 */
export async function findSimilarGroups(
  db: Firestore,
  input: { sourceName: string; topicName: string; audienceLabel: string }
): Promise<SimilarGroup[]> {
  const needleText = [input.sourceName, input.topicName, input.audienceLabel]
    .filter(Boolean)
    .join(" ");
  const needle = new Set(tokenise(needleText));
  if (needle.size === 0) return [];

  // Group counts are small; a bounded scan avoids needing a search index.
  const snap = await db.collection("groups").limit(500).get();

  const results: SimilarGroup[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const name = (data.name ?? "") as string;
    const description = (data.description ?? "") as string;
    const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];

    const hay = new Set(tokenise([name, description, ...tags].join(" ")));
    if (hay.size === 0) continue;

    let shared = 0;
    for (const token of needle) if (hay.has(token)) shared++;
    if (shared === 0) continue;

    // Overlap relative to the shorter side, so a long group description does
    // not dilute an otherwise exact topic match.
    const score = shared / Math.min(needle.size, hay.size);

    const nameTokens = new Set(tokenise(name));
    let nameShared = 0;
    for (const token of needle) if (nameTokens.has(token)) nameShared++;

    results.push({
      id: doc.id,
      name: name || "(unnamed group)",
      description,
      memberCount: Array.isArray(data.memberIds) ? data.memberIds.length : 0,
      score: Math.min(1, nameShared > 0 ? score + 0.25 : score),
      reason:
        nameShared > 0
          ? "Name overlaps this audience"
          : "Description or tags overlap this audience",
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

/** Above this, the UI requires an explicit acknowledgement before creating. */
export const STRONG_DUPLICATE_SCORE = 0.5;

// ─── Creation ────────────────────────────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
  description: string;
  isPrivate: boolean;
  type: string;
  /** Firebase Auth uid of the admin creating it. */
  creatorUid: string;
  creatorName: string;
  creatorUsername: string;
}

export const GROUP_TYPES = [
  "general",
  "family",
  "work",
  "sport",
  "social",
  "college",
] as const;

/**
 * Create a group with the same document shape as POST /api/groups, so a group
 * born from demand is indistinguishable from a hand-made one.
 *
 * memberIds holds the creator's Auth uid rather than their `user` document id,
 * because the Firestore rules gate group reads on
 * `request.auth.uid in resource.data.memberIds`.
 */
export async function createGroupFromDemand(
  db: Firestore,
  input: CreateGroupInput
): Promise<string> {
  const ref = db.collection("groups").doc();
  await ref.set({
    name: input.name,
    description: input.description,
    isPrivate: input.isPrivate,
    type: input.type,
    createdBy: input.creatorUid,
    memberIds: [input.creatorUid],
    members: {
      [input.creatorUid]: {
        name: input.creatorName,
        username: input.creatorUsername,
        joinedAt: FieldValue.serverTimestamp(),
      },
    },
    tags: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Display rows for the "link an existing group" picker. */
export async function listGroupsForLinking(db: Firestore): Promise<
  Array<{ id: string; name: string; memberCount: number; createdAt: string | null }>
> {
  const snap = await db.collection("groups").limit(500).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: (data.name ?? "(unnamed group)") as string,
        memberCount: Array.isArray(data.memberIds) ? data.memberIds.length : 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
