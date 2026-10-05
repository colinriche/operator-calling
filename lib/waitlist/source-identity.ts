// ─── What makes two demand sources the same place ────────────────────────────
//
// Duplicate detection is only as good as the two questions asked here: is this
// the same URL, and is this the same name. Both have to survive the ways the
// same place gets written down twice - a pasted mobile link, a tracking
// parameter, a trailing slash, a capital letter, "UK" on the end - without
// deciding that two genuinely different places are one.
//
// The cost is asymmetric in both directions, which is why this is strict:
//
//   a missed duplicate  splits one audience's registrations across two records
//                       so neither reaches the threshold.
//   a false duplicate   trains whoever sees it to click past the warning, and
//                       the next one is a real one.
//
// Client-safe: pure string work, no firebase-admin.

/**
 * Query parameters that say where a link was clicked, not what it points at.
 * Dropping them is what makes a link shared out of the Reddit app and the same
 * link typed by hand one destination.
 */
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_name", "utm_id", "utm_reader", "utm_social", "utm_brand",
  "fbclid", "gclid", "gbraid", "wbraid", "dclid", "msclkid", "yclid",
  "twclid", "ttclid", "igshid", "igsh", "mibextid", "sfnsn", "extid",
  "mc_cid", "mc_eid", "ref", "ref_src", "ref_url", "referrer", "referral",
  "share", "share_id", "shared", "si", "spm", "sourceid", "rdt", "correlation_id",
  // Our own attribution code, and the readable slug beside it. A tracked
  // Operator link pasted into the source URL field still points at the source.
  "s", "t", "feature",
]);

/**
 * Hosts where the domain on its own names a platform rather than a place.
 * `facebook.com` with nothing after it is an empty field with a URL in it;
 * `cornishswimming.org` with nothing after it is a forum.
 */
const PLATFORM_HOSTS = new Set([
  "facebook.com", "fb.com", "fb.me", "messenger.com",
  "reddit.com", "redd.it",
  "x.com", "twitter.com", "t.co",
  "instagram.com", "threads.net",
  "linkedin.com", "lnkd.in",
  "youtube.com", "youtu.be",
  "discord.com", "discord.gg", "discordapp.com",
  "t.me", "telegram.me", "telegram.org",
  "whatsapp.com", "chat.whatsapp.com", "wa.me",
  "tiktok.com", "pinterest.com", "tumblr.com", "snapchat.com",
  "meetup.com", "nextdoor.com", "eventbrite.com", "eventbrite.co.uk",
  "substack.com", "medium.com", "quora.com", "mastodon.social", "bsky.app",
  "strava.com", "slack.com", "google.com", "groups.google.com",
]);

/** Subdomains that are the same site wearing a different hat. */
const HOST_PREFIXES = /^(www|m|mobile|old|new|np|web|amp|en|en-gb)\./;

/**
 * Reduce a source URL to the string two records for the same place will share,
 * or "" when the URL identifies nothing.
 *
 * Returning "" for a bare platform domain is the point rather than an edge
 * case: two sources whose URL field holds only "facebook.com" are not evidence
 * of anything, and treating them as the same place would block a create that
 * is perfectly correct.
 *
 * Kept separate from `normaliseDestinationUrl` in outreach.ts, which answers a
 * different question - "have we posted at this destination before" - and whose
 * stored keys would all have to be rewritten if its output changed.
 */
export function canonicalSourceUrl(raw: string): string {
  // Pasted out of a sentence or an email, a URL arrives wrapped: brackets,
  // angle brackets, a full stop that belongs to the prose.
  const trimmed = (raw ?? "")
    .trim()
    .replace(/^[(\[<"']+/, "")
    .replace(/[)\]>.,;!'"]+$/, "");
  if (!trimmed) return "";

  let host = "";
  let path = "";
  let query = "";

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    host = url.hostname.toLowerCase().replace(HOST_PREFIXES, "");
    path = url.pathname.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "");

    // Kept, unlike the destination normaliser: `?v=` is which YouTube video and
    // `?id=` is which Facebook group, so dropping the whole query string would
    // make every video on a channel the same place.
    const kept: [string, string][] = [];
    for (const [key, value] of url.searchParams) {
      const name = key.toLowerCase();
      if (TRACKING_PARAMS.has(name) || name.startsWith("utm_")) continue;
      if (!value) continue;
      kept.push([name, value.toLowerCase()]);
    }
    kept.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    query = kept.map(([k, v]) => `${k}=${v}`).join("&");
  } catch {
    // Not a URL at all. Somebody typed a name into the URL field; it identifies
    // a place no better than the name field does.
    return "";
  }

  if (!host) return "";
  if (!path && !query && PLATFORM_HOSTS.has(host)) return "";

  return `${host}${path}${query ? `?${query}` : ""}`;
}

// ─── Names ───────────────────────────────────────────────────────────────────
//
// A name is compared as the set of tokens `tokenise` leaves behind: lowercased,
// punctuation gone, and the words that carry no identity - "the", "group",
// "UK" - dropped. "The Yorkshire Terrier Owners Group (UK)" and "yorkshire
// terrier owners" are then the same name, which is the whole intent.
//
// The tokeniser itself lives in group-linking.ts, so demand sources and groups
// cannot drift into scoring the same name two different ways.

/** Same tokens, in any order. */
export function sameName(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size !== b.size) return false;
  for (const token of a) if (!b.has(token)) return false;
  return true;
}

/**
 * One name is the other plus extra words - "Leeds 2009 housemates" inside
 * "Leeds 2009 housemates and friends".
 *
 * The two-token floor is what keeps this from firing on every single-word
 * topic: without it "chess" would be contained in every chess source there is.
 */
export function nameContains(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size < 2 || small.size === large.size) return false;
  for (const token of small) if (!large.has(token)) return false;
  return true;
}

/**
 * Whether two platform ids can describe the same place. An unset or "other"
 * platform tells us nothing, so it is compared with everything; two named and
 * different platforms are two different places, whatever they are called.
 */
export function platformsCompatible(a: string, b: string): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  if (!left || !right || left === "other" || right === "other") return true;
  return left === right;
}
