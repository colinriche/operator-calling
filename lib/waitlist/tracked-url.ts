// ─── Tracked link URLs ───────────────────────────────────────────────────────
//
// A tracked link is `/waitlist?s=CODE`. When a source opts in, its topic is
// appended as `&t=<slug>` purely so the link reads sensibly when pasted into a
// forum post — "…/waitlist?s=K7P4MX&t=live-poker" says more than the code alone.
//
// `t` is cosmetic and carries no meaning: the waitlist page ignores it entirely.
// Everything public-facing (audience label, disclaimer, group) is still resolved
// server-side from `s`, so editing the slug in a URL changes nothing on the page
// and cannot be used to forge an endorsement.
//
// Client-safe — no firebase-admin, no server-only imports.

const MAX_TOPIC_SLUG_LENGTH = 48;

/**
 * URL-safe slug of a topic name: lowercase, ASCII, hyphen-separated. Returns ""
 * for anything that slugs down to nothing, so callers can simply omit the param.
 */
export function topicSlug(raw: unknown): string {
  if (typeof raw !== "string") return "";

  const slug = raw
    // NFKD splits "Über" into "U" + a combining mark, so the letter survives the
    // ASCII filter below. The mark has to be dropped rather than left to the
    // filter, which would turn it into a separator and give "u-ber".
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Trim again after truncation so a cut mid-word cannot leave a trailing dash.
  return slug.slice(0, MAX_TOPIC_SLUG_LENGTH).replace(/-+$/, "");
}

export interface TopicUrlOptions {
  topicName?: unknown;
  includeTopicInUrl?: unknown;
}

/**
 * Build the copyable tracked URL for a source code, appending the source's topic
 * when it has opted in and has a topic worth slugging.
 */
export function buildTrackedUrl(
  origin: string,
  sourceCode: string,
  source?: TopicUrlOptions
): string {
  const base = `${origin}/waitlist?s=${sourceCode}`;
  if (source?.includeTopicInUrl !== true) return base;

  // topicSlug only ever emits [a-z0-9-], so no further encoding is needed.
  const slug = topicSlug(source.topicName);
  return slug ? `${base}&t=${slug}` : base;
}
