// ─── Infer demand-source fields from a pasted URL ────────────────────────────
//
// Pure string work on the URL alone - no fetch, no oEmbed, no scraping. Only
// fields that can be read with confidence are returned; everything else is
// left for whoever is filling the form.
//
// Client-safe.

import { PLATFORM_IDS, SOURCE_TYPE_IDS } from "@/lib/waitlist/constants";

export type SourceUrlInference = {
  platformId?: string;
  sourceType?: string;
  sourceName?: string;
};

/** Fields the Add Source form can fill from a URL. */
export const SOURCE_URL_INFERENCE_KEYS = [
  "platformId",
  "sourceType",
  "sourceName",
] as const;

export type SourceUrlInferenceKey = (typeof SOURCE_URL_INFERENCE_KEYS)[number];

const HOST_PREFIXES = /^(www|m|mobile|old|new|np|web|amp|en|en-gb|l|lm)\./;

/** Paths that are Facebook chrome, not a page or group name. */
const FACEBOOK_RESERVED = new Set([
  "groups", "pages", "watch", "reel", "reels", "stories", "story", "photo",
  "photos", "video", "videos", "events", "marketplace", "gaming", "share",
  "permalink", "posts", "people", "profile", "login", "recover", "help",
  "privacy", "policies", "settings", "dialog", "sharer", "share.php",
  "story.php", "photo.php", "watch", "hashtag", "public", "bookmarks",
]);

const INSTAGRAM_RESERVED = new Set([
  "p", "reel", "reels", "stories", "tv", "explore", "accounts", "direct",
  "about", "legal", "developer", "directory",
]);

const TIKTOK_RESERVED = new Set([
  "video", "tag", "music", "place", "discover", "foryou", "following",
  "live", "search", "about", "legal",
]);

const X_RESERVED = new Set([
  "i", "home", "explore", "search", "settings", "messages", "notifications",
  "compose", "intent", "share", "hashtag", "login", "signup", "tos", "privacy",
]);

const LINKEDIN_RESERVED = new Set([
  "feed", "login", "signup", "uas", "help", "legal", "jobs", "messaging",
  "notifications", "search", "checkpoint",
]);

/**
 * Parse a pasted source URL into the demand-source fields it clearly encodes.
 * Returns an empty object when nothing reliable can be said.
 */
export function inferSourceFromUrl(raw: string): SourceUrlInference {
  const trimmed = (raw ?? "")
    .trim()
    .replace(/^[(\[<"']+/, "")
    .replace(/[)\]>.,;!'"]+$/, "");
  if (!trimmed) return {};

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return {};
  }

  const host = url.hostname.toLowerCase().replace(HOST_PREFIXES, "");
  const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "";
  const segments = path.split("/").filter(Boolean).map(decodeSegment);

  if (isReddit(host)) return reddit(segments);
  if (isFacebook(host)) return facebook(segments);
  if (isYouTube(host)) return youtube(host, segments, url.searchParams);
  if (isDiscord(host)) return discord(host, segments);
  if (isX(host)) return x(segments);
  if (isInstagram(host)) return instagram(segments);
  if (isTikTok(host)) return tiktok(segments);
  if (isLinkedIn(host)) return linkedin(segments);
  if (isTelegram(host)) return telegram(segments);
  if (isWhatsApp(host)) return whatsapp(host, segments);
  if (isMeetup(host)) return meetup(segments);
  if (host === "threads.net") return threads(segments);
  if (host === "bsky.app") return bluesky(segments);
  if (host === "snapchat.com") {
    return pick({ platformId: "other", sourceType: "social_page", sourceName: readableName(segments[0]) });
  }

  return {};
}

/**
 * Merge an inference into a form draft without touching fields the user has
 * already set by hand. Locked keys are left alone; everything else that the
 * URL confidently names is written in.
 */
export function applySourceUrlInference<T extends object>(
  form: T,
  inferred: SourceUrlInference,
  locked: ReadonlySet<string>
): T {
  let next: T | null = null;
  for (const key of SOURCE_URL_INFERENCE_KEYS) {
    const value = inferred[key];
    if (value === undefined || value === "") continue;
    if (locked.has(key)) continue;
    if ((form as Record<string, unknown>)[key] === value) continue;
    if (!next) next = { ...form };
    (next as Record<string, unknown>)[key] = value;
  }
  return next ?? form;
}

// ─── Platform parsers ────────────────────────────────────────────────────────

function reddit(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "reddit" };
  const head = (segments[0] ?? "").toLowerCase();

  if (head === "r" && segments[1]) {
    const sub = segments[1];
    if (segments[2]?.toLowerCase() === "comments") {
      out.sourceType = "post";
      // Title slug is the only human-readable bit after the post id.
      const title = segments[4];
      out.sourceName = readableName(title) ?? readableName(sub);
    } else if (segments[2]?.toLowerCase() === "s") {
      // Reddit short share links: /r/name/s/xxx
      out.sourceType = "post";
      out.sourceName = readableName(sub);
    } else {
      out.sourceType = "subreddit";
      out.sourceName = readableName(sub);
    }
    return pick(out);
  }

  if ((head === "u" || head === "user") && segments[1]) {
    out.sourceType = "social_page";
    out.sourceName = readableName(segments[1]);
    return pick(out);
  }

  if (head === "comments") {
    out.sourceType = "comment";
    return pick(out);
  }

  return pick(out);
}

function facebook(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "facebook" };
  const head = (segments[0] ?? "").toLowerCase();

  if (head === "groups" && segments[1]) {
    out.sourceType = "group";
    // /groups/<id or slug>/… - only a non-numeric slug is a name.
    out.sourceName = readableName(segments[1]);
    return pick(out);
  }

  if (head === "pages" && segments[1]) {
    out.sourceType = "social_page";
    // /pages/Category/Name/id or /pages/Name/id
    const candidate = segments.length >= 3 ? segments[2] : segments[1];
    out.sourceName = readableName(candidate) ?? readableName(segments[1]);
    return pick(out);
  }

  if (head === "profile.php" || (head === "people" && segments[1])) {
    out.sourceType = "social_page";
    return pick(out);
  }

  if (
    head === "watch" ||
    head === "reel" ||
    head === "reels" ||
    head === "photo" ||
    head === "photo.php" ||
    head === "story.php" ||
    head === "permalink.php" ||
    segments.some((s) => s.toLowerCase() === "posts")
  ) {
    out.sourceType = "post";
    return pick(out);
  }

  if (head === "share") {
    // share/g/… is a group share with an opaque id.
    if ((segments[1] ?? "").toLowerCase() === "g") {
      out.sourceType = "group";
    } else {
      out.sourceType = "post";
    }
    return pick(out);
  }

  if (head && !FACEBOOK_RESERVED.has(head)) {
    out.sourceType = "social_page";
    out.sourceName = readableName(segments[0]);
    return pick(out);
  }

  return pick(out);
}

function youtube(
  host: string,
  segments: string[],
  params: URLSearchParams
): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "youtube" };

  if (host === "youtu.be") {
    out.sourceType = "post";
    return pick(out);
  }

  const head = (segments[0] ?? "").toLowerCase();

  if (head.startsWith("@") || head === "c" || head === "user") {
    out.sourceType = "channel";
    const handle = head.startsWith("@") ? segments[0].slice(1) : segments[1];
    out.sourceName = readableName(handle);
    return pick(out);
  }

  if (head === "channel") {
    out.sourceType = "channel";
    // /channel/UCxxxx is an opaque id - platform and type only.
    return pick(out);
  }

  if (head === "watch" || head === "shorts" || head === "live" || params.has("v")) {
    out.sourceType = "post";
    return pick(out);
  }

  if (head === "playlist") {
    out.sourceType = "discussion";
    return pick(out);
  }

  if (head === "youtube" && (segments[1] ?? "").toLowerCase() === "c" && segments[2]) {
    // Rare /youtube/c/Name form.
    out.sourceType = "channel";
    out.sourceName = readableName(segments[2]);
    return pick(out);
  }

  return pick(out);
}

function discord(host: string, segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "discord" };

  if (host === "discord.gg" && segments[0]) {
    out.sourceType = "server";
    out.sourceName = readableName(segments[0]);
    return pick(out);
  }

  const head = (segments[0] ?? "").toLowerCase();
  if (head === "invite" && segments[1]) {
    out.sourceType = "server";
    out.sourceName = readableName(segments[1]);
    return pick(out);
  }

  if (head === "channels") {
    out.sourceType = "server";
    // Channel and guild ids are snowflakes - never names.
    return pick(out);
  }

  return pick(out);
}

function x(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "x" };
  const head = (segments[0] ?? "").toLowerCase();

  if (!head || X_RESERVED.has(head)) {
    if (head === "i" && (segments[1] ?? "").toLowerCase() === "communities") {
      out.sourceType = "group";
    }
    return pick(out);
  }

  if ((segments[1] ?? "").toLowerCase() === "status") {
    out.sourceType = "post";
    out.sourceName = readableName(segments[0]);
    return pick(out);
  }

  out.sourceType = "social_page";
  out.sourceName = readableName(segments[0]);
  return pick(out);
}

function instagram(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "instagram" };
  const head = (segments[0] ?? "").toLowerCase();

  if (head === "p" || head === "reel" || head === "reels" || head === "tv") {
    out.sourceType = "post";
    return pick(out);
  }

  if (head === "stories") {
    out.sourceType = "post";
    out.sourceName = readableName(segments[1]);
    return pick(out);
  }

  if (head && !INSTAGRAM_RESERVED.has(head)) {
    out.sourceType = "social_page";
    out.sourceName = readableName(segments[0]);
    return pick(out);
  }

  return pick(out);
}

function tiktok(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "tiktok" };
  const head = segments[0] ?? "";
  const lower = head.toLowerCase();

  if (lower === "video" || lower === "t") {
    out.sourceType = "post";
    return pick(out);
  }

  if (head.startsWith("@")) {
    out.sourceType = "social_page";
    out.sourceName = readableName(head.slice(1));
    return pick(out);
  }

  if (head && !TIKTOK_RESERVED.has(lower)) {
    out.sourceType = "social_page";
    out.sourceName = readableName(head.startsWith("@") ? head.slice(1) : head);
    return pick(out);
  }

  return pick(out);
}

function linkedin(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "linkedin" };
  const head = (segments[0] ?? "").toLowerCase();

  if (head === "groups" && segments[1]) {
    out.sourceType = "group";
    out.sourceName = readableName(segments[1]);
    return pick(out);
  }

  if (head === "company" || head === "school" || head === "showcase") {
    out.sourceType = "social_page";
    out.sourceName = readableName(segments[1]);
    return pick(out);
  }

  if (head === "in" || head === "pub") {
    out.sourceType = "social_page";
    out.sourceName = readableName(segments[1]);
    return pick(out);
  }

  if (
    head === "posts" ||
    head === "feed" ||
    segments.some((s) => s.toLowerCase() === "activity")
  ) {
    out.sourceType = "post";
    return pick(out);
  }

  if (head && !LINKEDIN_RESERVED.has(head)) {
    out.sourceType = "social_page";
    out.sourceName = readableName(segments[0]);
    return pick(out);
  }

  return pick(out);
}

function telegram(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "telegram" };
  const head = segments[0] ?? "";
  const lower = head.toLowerCase();

  if (!head) return pick(out);

  // Invite links carry only an opaque token.
  if (head.startsWith("+") || lower === "joinchat" || lower === "addstickers") {
    out.sourceType = "group";
    return pick(out);
  }

  if (lower === "c" || lower === "s") {
    // Private channel / message links use numeric ids.
    out.sourceType = lower === "c" ? "channel" : "post";
    return pick(out);
  }

  // Public username: channel or group - "channel" is the closest listed type
  // that matches how Telegram presents public @handles.
  out.sourceType = "channel";
  out.sourceName = readableName(head.startsWith("@") ? head.slice(1) : head);
  return pick(out);
}

function whatsapp(host: string, segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "whatsapp" };

  if (host === "chat.whatsapp.com" || (segments[0] ?? "").toLowerCase() === "invite") {
    out.sourceType = "group";
    // Invite codes are opaque.
    return pick(out);
  }

  if (host === "wa.me" || host === "api.whatsapp.com") {
    out.sourceType = "private_message";
    return pick(out);
  }

  return pick(out);
}

function meetup(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "other", sourceType: "group" };
  const head = (segments[0] ?? "").toLowerCase();
  if (
    head &&
    !["find", "login", "register", "cities", "topics", "apps"].includes(head)
  ) {
    out.sourceName = readableName(segments[0]);
  }
  return pick(out);
}

function threads(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "other" };
  const head = segments[0] ?? "";
  if (head.startsWith("@")) {
    out.sourceType = "social_page";
    out.sourceName = readableName(head.slice(1));
  } else if ((head || "").toLowerCase() === "t") {
    out.sourceType = "post";
  }
  return pick(out);
}

function bluesky(segments: string[]): SourceUrlInference {
  const out: SourceUrlInference = { platformId: "other" };
  // /profile/handle.bsky.social or /profile/handle/post/…
  if ((segments[0] ?? "").toLowerCase() === "profile" && segments[1]) {
    out.sourceType =
      (segments[2] ?? "").toLowerCase() === "post" ? "post" : "social_page";
    const handle = segments[1].replace(/\.bsky\.social$/i, "");
    out.sourceName = readableName(handle);
  }
  return pick(out);
}

// ─── Hosts ───────────────────────────────────────────────────────────────────

function isReddit(host: string): boolean {
  return host === "reddit.com" || host === "redd.it" || host.endsWith(".reddit.com");
}

function isFacebook(host: string): boolean {
  return (
    host === "facebook.com" ||
    host === "fb.com" ||
    host === "fb.me" ||
    host === "fb.watch" ||
    host.endsWith(".facebook.com")
  );
}

function isYouTube(host: string): boolean {
  return (
    host === "youtube.com" ||
    host === "youtu.be" ||
    host === "music.youtube.com" ||
    host.endsWith(".youtube.com")
  );
}

function isDiscord(host: string): boolean {
  return (
    host === "discord.com" ||
    host === "discord.gg" ||
    host === "discordapp.com" ||
    host.endsWith(".discord.com")
  );
}

function isX(host: string): boolean {
  return host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com";
}

function isInstagram(host: string): boolean {
  return host === "instagram.com" || host.endsWith(".instagram.com");
}

function isTikTok(host: string): boolean {
  return host === "tiktok.com" || host === "vm.tiktok.com" || host.endsWith(".tiktok.com");
}

function isLinkedIn(host: string): boolean {
  return host === "linkedin.com" || host === "lnkd.in" || host.endsWith(".linkedin.com");
}

function isTelegram(host: string): boolean {
  return (
    host === "t.me" ||
    host === "telegram.me" ||
    host === "telegram.org" ||
    host.endsWith(".telegram.org")
  );
}

function isWhatsApp(host: string): boolean {
  return (
    host === "whatsapp.com" ||
    host === "chat.whatsapp.com" ||
    host === "wa.me" ||
    host === "api.whatsapp.com" ||
    host.endsWith(".whatsapp.com")
  );
}

function isMeetup(host: string): boolean {
  return host === "meetup.com" || host.endsWith(".meetup.com");
}

// ─── Name heuristics ─────────────────────────────────────────────────────────

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, " "));
  } catch {
    return segment;
  }
}

/**
 * A path segment that is clearly a human-facing name, or null when it is an
 * opaque id (digits, YouTube UC…, Discord snowflake, invite hash, …).
 */
function readableName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let value = raw.trim();
  if (!value) return undefined;
  if (value.startsWith("@")) value = value.slice(1);
  if (!value) return undefined;

  // Pure numeric ids, including Facebook group ids and Discord snowflakes.
  if (/^\d+$/.test(value)) return undefined;
  // YouTube channel ids.
  if (/^UC[\w-]{20,}$/i.test(value)) return undefined;
  // Long opaque invite / share tokens (WhatsApp, Telegram joinchat, …).
  if (/^[A-Za-z0-9_-]{16,}$/.test(value) && !/[aeiouy]{2}/i.test(value) && !/-/.test(value)) {
    return undefined;
  }
  // Single-character noise.
  if (value.length < 2) return undefined;

  return value;
}

/** Drop empty fields and values the form would reject. */
function pick(inferred: SourceUrlInference): SourceUrlInference {
  const out: SourceUrlInference = {};
  if (inferred.platformId && PLATFORM_IDS.includes(inferred.platformId)) {
    out.platformId = inferred.platformId;
  }
  if (inferred.sourceType && SOURCE_TYPE_IDS.includes(inferred.sourceType)) {
    out.sourceType = inferred.sourceType;
  }
  if (inferred.sourceName) {
    out.sourceName = inferred.sourceName;
  }
  return out;
}
