// ─── Outreach records ────────────────────────────────────────────────────────
//
// A record of every comment, post or message prepared for a demand source:
// what was written, where it went, who posted it and when.
//
// The point is not bookkeeping. It is knowing whether this destination has
// already been contacted before contacting it again — posting the same link
// twice in the same thread is how outreach becomes spam and a subreddit bans
// the domain.
//
// Client-safe: no firebase-admin imports.

export const OUTREACH_TYPES = [
  { id: "public_comment", label: "Public comment" },
  { id: "new_post", label: "New post" },
  { id: "private_message", label: "Private message" },
  { id: "organiser_message", label: "Message to an organiser" },
  { id: "general_link_share", label: "General link share" },
  { id: "social_share", label: "Social share" },
] as const;

export type OutreachType = (typeof OUTREACH_TYPES)[number]["id"];
export const OUTREACH_TYPE_IDS = OUTREACH_TYPES.map((t) => t.id) as readonly string[];

export const OUTREACH_STATUSES = [
  "draft",
  "generated",
  "copied",
  "posted",
  "archived",
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_RECORDS_COLLECTION = "outreachRecords";

/** Recently enough that posting again would look like spamming. */
export const RECENT_OUTREACH_DAYS = 14;

// ─── Starting copy ───────────────────────────────────────────────────────────
//
// Hand-written openers, taken from the spec. These are seeds to edit, not
// things to post verbatim — posting the same sentence everywhere is exactly the
// pattern that gets a link filtered.
//
// An AI generator will later populate the same `generatedText` field these fill
// in, so nothing downstream needs to change when it arrives.

export interface OutreachTemplate {
  id: string;
  label: string;
  text: string;
  /** Types this reads naturally as. */
  suits: OutreachType[];
}

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: "prefer_talking",
    label: "For people who prefer talking",
    text: "This might be useful for people who prefer actually talking rather than just messaging.",
    suits: ["public_comment", "general_link_share", "social_share"],
  },
  {
    id: "being_tested",
    label: "Something being tested",
    text: "There's something being tested for one-to-one voice calls around shared interests. You make yourself available and the call comes to you, rather than having to find someone yourself.",
    suits: ["public_comment", "new_post", "general_link_share"],
  },
  {
    id: "separate_from_site",
    label: "Separate from this site",
    text: "It's separate from this site, but there's a page here for people who might be interested.",
    suits: ["public_comment", "private_message"],
  },
  {
    id: "operator_makes_call",
    label: "How it works",
    text: "The idea is that Operator finds someone suitable and makes the call, so you don't have to arrange it yourself.",
    suits: ["public_comment", "new_post", "private_message"],
  },
  {
    id: "organiser_intro",
    label: "To an organiser",
    text: "I'm working on something separate for one-to-one voice calls around shared interests, and wondered whether people here might find it useful. It isn't connected to this site in any way — I'd rather ask than just post a link.",
    suits: ["organiser_message", "private_message"],
  },
];

/** Wording that makes outreach read as marketing. Shown as a warning, never auto-blocked. */
export const DISCOURAGED_PHRASES = [
  "we are excited to announce",
  "we're excited to announce",
  "revolutionary",
  "transform your community",
  "amazing opportunity",
  "join us today",
  "sign up now",
  "discover the future",
  "unlock meaningful",
  "perfect for your community",
  "game changer",
  "game-changer",
];

/** Discouraged phrases present in a draft. Advisory — the writer decides. */
export function findDiscouragedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return DISCOURAGED_PHRASES.filter((phrase) => lower.includes(phrase));
}

// ─── Destination identity ────────────────────────────────────────────────────

/**
 * Reduce a URL to something two posts at the same place will share.
 *
 * Strips protocol, `www.`, trailing slashes, the query string and the fragment,
 * and lowercases the host. Reddit's `?utm_source=share` and a bare link are the
 * same thread; treating them as different destinations would silently defeat
 * the duplicate warning that is the whole reason this exists.
 */
export function normaliseDestinationUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

/**
 * Join a comment and its tracked link without ending up with the URL twice —
 * the writer may already have pasted it in.
 */
export function composeWithLink(text: string, trackedUrl: string): string {
  const body = text.trim();
  if (!trackedUrl) return body;
  if (body.includes(trackedUrl)) return body;

  // Also catch the same link written without its protocol.
  const bare = trackedUrl.replace(/^https?:\/\//, "");
  if (bare && body.includes(bare)) return body;

  return body ? `${body}\n\n${trackedUrl}` : trackedUrl;
}
