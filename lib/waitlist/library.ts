// ─── The waitlist image and wording library ──────────────────────────────────
//
// Shapes and pure helpers shared by the admin panels, the admin API routes and
// the presentation code. Client-safe: no firebase-admin, no server imports.
//
// ─── Images ──────────────────────────────────────────────────────────────────
//
// A source's picture is one `imageChoice` string:
//
//   ""                 unset - whatever the page showed before the library
//                      existed (a family photograph, community artwork), else
//                      the default
//   "default"          the library default, explicitly
//   "builtin:<id>"     a picture shipped with the site (builtin-images.ts)
//   "art:<id>"         a curated topic illustration (topic-art.ts)
//   "library:<docId>"  an uploaded library image; its URL is copied onto the
//                      source as `imageChoiceUrl`, so the page needs no second
//                      read to render it
//   "own"              this family's own uploaded photograph, which stays out
//                      of the shared library unless someone adds it
//   "brand"            the small Operator brand mark
//
// ─── Wording ─────────────────────────────────────────────────────────────────
//
// The main copy of a page - heading, two paragraphs, the family sign-off and the
// link-preview description - comes in four variants, because the four kinds of
// page are selling different things (see presentation.ts).
//
// Each variant has a default: the built-in text, or an admin's edit of it held
// in settings. A source with no wording of its own follows the default, so
// editing the default changes it. Templates are saved copies an admin can start
// a source from; choosing one copies its text into the source, and later edits
// to the template do not reach pages that already used it.

import { WHATSAPP_DEFAULT_IMAGE_CHOICE } from "./builtin-images";
import type { ConnectionType, WaitlistMode } from "./constants";

// ─── Images ──────────────────────────────────────────────────────────────────

export const LIBRARY_IMAGE_CATEGORIES = [
  { id: "general", label: "General" },
  { id: "interest", label: "Interests" },
  { id: "sport", label: "Sport" },
  { id: "group", label: "Groups" },
  { id: "family", label: "Families" },
] as const;

export type LibraryImageCategory = (typeof LIBRARY_IMAGE_CATEGORIES)[number]["id"];

export const LIBRARY_IMAGE_CATEGORY_IDS = LIBRARY_IMAGE_CATEGORIES.map(
  (c) => c.id
) as readonly string[];

export interface LibraryImageRow {
  id: string;
  label: string;
  category: LibraryImageCategory | string;
  url: string;
  createdAt: string | null;
  createdBy: string | null;
  /** Hidden from the picker. Pages already using it keep showing it. */
  archived: boolean;
}

export type ParsedImageChoice =
  | { type: "default" }
  | { type: "builtin"; id: string }
  | { type: "art"; id: string }
  | { type: "library"; id: string }
  | { type: "own" }
  | { type: "brand" };

export function parseImageChoice(raw: unknown): ParsedImageChoice | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value === "default") return { type: "default" };
  if (value === "own") return { type: "own" };
  if (value === "brand") return { type: "brand" };
  const colon = value.indexOf(":");
  if (colon < 1) return null;
  const prefix = value.slice(0, colon);
  const id = value.slice(colon + 1);
  if (!id || id.length > 200) return null;
  if (prefix === "builtin" || prefix === "art" || prefix === "library") {
    return { type: prefix, id };
  }
  return null;
}

// ─── Per-network pictures ────────────────────────────────────────────────────
//
// The page's picture is the link preview everywhere. A network can be given a
// different one, and only the networks someone chose to change carry an entry:
// { whatsapp: "library:abc" }. Nothing else needs setting up.
//
// Which network is asking is read off the preview fetcher's user agent when it
// requests the page, so one tracked link serves every network its own card -
// nobody has to post a different URL to each.
//
// Some previews cannot be told apart. Messenger and Instagram use Facebook's
// fetcher, and iMessage announces itself as Facebook and X at once, so all of
// those get Facebook's picture. Signal builds its preview on the sender's
// phone with no identifying agent, so it gets the page's picture.

export const SOCIAL_NETWORKS = [
  { id: "facebook", label: "Facebook", hint: "Also Messenger, Instagram and iMessage", agent: /facebookexternalhit|facebot/i },
  { id: "whatsapp", label: "WhatsApp", hint: "", agent: /whatsapp/i },
  { id: "x", label: "X", hint: "", agent: /twitterbot/i },
  { id: "linkedin", label: "LinkedIn", hint: "", agent: /linkedinbot/i },
  { id: "reddit", label: "Reddit", hint: "", agent: /redditbot/i },
  { id: "discord", label: "Discord", hint: "", agent: /discordbot/i },
  { id: "telegram", label: "Telegram", hint: "", agent: /telegrambot/i },
  { id: "slack", label: "Slack", hint: "", agent: /slackbot/i },
] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]["id"];

export const SOCIAL_NETWORK_IDS = SOCIAL_NETWORKS.map((n) => n.id) as readonly string[];

export function isSocialNetwork(value: unknown): value is SocialNetwork {
  return typeof value === "string" && SOCIAL_NETWORK_IDS.includes(value);
}

/**
 * The order agents are tested in, which is not the display order: fetchers
 * borrow each other's names. Telegram's is "TelegramBot (like TwitterBot)", so
 * X is tested last; iMessage's names Facebook and X, and gets Facebook's.
 */
const AGENT_MATCH_ORDER: readonly SocialNetwork[] = [
  "telegram",
  "slack",
  "discord",
  "linkedin",
  "reddit",
  "whatsapp",
  "facebook",
  "x",
];

/** Which network's preview fetcher sent this request, if any. */
export function socialNetworkFromUserAgent(userAgent: string): SocialNetwork | null {
  for (const id of AGENT_MATCH_ORDER) {
    if (SOCIAL_NETWORKS.find((n) => n.id === id)!.agent.test(userAgent)) return id;
  }
  return null;
}

/** Network id → image choice. */
export type SocialImages = Partial<Record<SocialNetwork, string>>;

/** Network id → a library image's copied URL, for the entries that are one. */
export type SocialImageUrls = Partial<Record<SocialNetwork, string>>;

/** Keep only known networks with a valid choice. */
export function sanitiseSocialImages(raw: unknown): SocialImages {
  const out: SocialImages = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isSocialNetwork(key) && parseImageChoice(value)) out[key] = String(value).trim();
  }
  return out;
}

export function sanitiseSocialImageUrls(raw: unknown): SocialImageUrls {
  const out: SocialImageUrls = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isSocialNetwork(key) && typeof value === "string" && value) out[key] = value;
  }
  return out;
}

/** Two per-network maps hold the same choices. */
export function sameSocialImages(a: SocialImages, b: SocialImages): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<SocialNetwork>;
  return [...keys].every((k) => a[k] === b[k]);
}

/**
 * The networks worth offering first for a source: the one its links are posted
 * on, then the two every link ends up forwarded through.
 */
export function suggestedNetworks(platformId: string | null | undefined): SocialNetwork[] {
  const first = isSocialNetwork(platformId) ? [platformId] : [];
  return [...new Set<SocialNetwork>([...first, "whatsapp", "facebook"])];
}

/**
 * The picture a network shows when nobody has chosen one for it, or "" when
 * that is simply the page's picture.
 *
 * Only WhatsApp has one - see WHATSAPP_DEFAULT_IMAGE_CHOICE for why, and for
 * why a family page is excluded. It lives here rather than in heroFor so the
 * admin panel can label a network honestly: a WhatsApp tile that reads "same
 * as the page" while the card says otherwise is worse than no tile at all.
 *
 * `mode` is null where the mode is not known - the site-wide defaults, which
 * are not a page and have no mode of their own.
 */
export function builtInNetworkImageChoice(
  network: SocialNetwork,
  mode: WaitlistMode | null
): string {
  if (network !== "whatsapp" || mode === "family") return "";
  return WHATSAPP_DEFAULT_IMAGE_CHOICE;
}

// ─── Wording ─────────────────────────────────────────────────────────────────

export const WORDING_VARIANTS = [
  {
    id: "global",
    label: "Global page",
    hint: "No tracked link, or a source set to global.",
    placeholders: [] as string[],
  },
  {
    id: "community_interest",
    label: "Shared interest",
    hint: "People who don't know each other but share a topic, sport or hobby.",
    placeholders: ["{topic}"],
  },
  {
    id: "community_known",
    label: "Existing group",
    hint: "People who already know each other - a year group, an old team.",
    placeholders: ["{group}"],
  },
  {
    id: "family",
    label: "Family",
    hint: "A family's private calling group.",
    placeholders: ["{family}"],
  },
] as const;

export type WordingVariant = (typeof WORDING_VARIANTS)[number]["id"];

export const WORDING_VARIANT_IDS = WORDING_VARIANTS.map((v) => v.id) as readonly string[];

export function isWordingVariant(value: unknown): value is WordingVariant {
  return typeof value === "string" && WORDING_VARIANT_IDS.includes(value);
}

/** Which wording a page uses, from what the page is. */
export function wordingVariantFor(
  mode: WaitlistMode,
  connectionType: ConnectionType
): WordingVariant {
  if (mode === "global") return "global";
  if (mode === "family") return "family";
  return connectionType === "existing_connections"
    ? "community_known"
    : "community_interest";
}

export interface WaitlistWording {
  heading: string;
  lead: string;
  body: string;
  /** Family pages: the paragraph after the sign-off. "" for none. */
  bodyContinued: string;
  /** Family pages: the strapline between the paragraphs. "" for none. */
  signoff: string;
  /** The link preview's description. */
  ogDescription: string;
  /**
   * The message the share buttons carry - the post on X, the Reddit title, the
   * WhatsApp message, the email. "" follows the built-in wording, which is also
   * what wording saved before this field existed does.
   */
  shareText: string;
}

export const WORDING_FIELDS: ReadonlyArray<{
  key: keyof WaitlistWording;
  label: string;
  max: number;
  rows: number;
  /** Only offered on family pages, the only ones that render it. */
  familyOnly?: boolean;
}> = [
  { key: "heading", label: "Heading", max: 160, rows: 1 },
  { key: "lead", label: "Opening paragraph", max: 600, rows: 3 },
  { key: "body", label: "Main paragraph", max: 1500, rows: 5 },
  { key: "signoff", label: "Sign-off line", max: 160, rows: 1, familyOnly: true },
  { key: "bodyContinued", label: "Second paragraph", max: 1500, rows: 5, familyOnly: true },
  { key: "ogDescription", label: "Link preview description", max: 300, rows: 2 },
  { key: "shareText", label: "Share message", max: 400, rows: 2 },
];

/**
 * A stored or submitted wording object, trimmed and length-limited, or null
 * when it is not one. Heading, opening paragraph and main paragraph are
 * required: a page with a blank heading is a broken page, not a choice.
 */
export function sanitiseWording(raw: unknown): WaitlistWording | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const out = {} as WaitlistWording;
  for (const field of WORDING_FIELDS) {
    const value = source[field.key];
    out[field.key] = typeof value === "string" ? value.trim().slice(0, field.max) : "";
  }
  if (!out.heading || !out.lead || !out.body) return null;
  return out;
}

export function sameWording(a: WaitlistWording | null, b: WaitlistWording | null): boolean {
  if (a === null || b === null) return a === b;
  return WORDING_FIELDS.every((f) => a[f.key] === b[f.key]);
}

export interface WordingTemplateRow {
  id: string;
  label: string;
  variant: WordingVariant;
  wording: WaitlistWording;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/** settings/waitlistDefaults, as the page and the panels read it. */
export interface WaitlistDefaults {
  /** An imageChoice, never "" or "default". */
  imageChoice: string;
  /** Set when imageChoice is a library image. */
  imageChoiceUrl: string | null;
  /** Admin edits of the built-in wording. A missing variant uses the built-in. */
  wording: Partial<Record<WordingVariant, WaitlistWording>>;
  /** Per-network pictures for pages that use the default picture. */
  socialImages: SocialImages;
  socialImageUrls: SocialImageUrls;
}

export const EMPTY_WAITLIST_DEFAULTS: WaitlistDefaults = {
  imageChoice: "",
  imageChoiceUrl: null,
  wording: {},
  socialImages: {},
  socialImageUrls: {},
};

/** Parse a stored defaults document, discarding anything malformed. */
export function sanitiseDefaults(raw: unknown): WaitlistDefaults {
  if (!raw || typeof raw !== "object") return EMPTY_WAITLIST_DEFAULTS;
  const data = raw as Record<string, unknown>;
  // "default" would point at itself and "own" belongs to a family.
  const socialImages = sanitiseSocialImages(data.socialImages);
  for (const [network, choice] of Object.entries(socialImages)) {
    if (choice === "default" || choice === "own") delete socialImages[network as SocialNetwork];
  }
  const choice = parseImageChoice(data.imageChoice);
  const wording: WaitlistDefaults["wording"] = {};
  if (data.wording && typeof data.wording === "object") {
    for (const variant of WORDING_VARIANT_IDS) {
      const value = sanitiseWording((data.wording as Record<string, unknown>)[variant]);
      if (value) wording[variant as WordingVariant] = value;
    }
  }
  return {
    imageChoice: choice && choice.type !== "default" ? String(data.imageChoice).trim() : "",
    imageChoiceUrl:
      typeof data.imageChoiceUrl === "string" && data.imageChoiceUrl
        ? data.imageChoiceUrl
        : null,
    wording,
    socialImages,
    socialImageUrls: sanitiseSocialImageUrls(data.socialImageUrls),
  };
}

/** What the admin library endpoint returns. */
export interface WaitlistLibraryPayload {
  images: LibraryImageRow[];
  templates: WordingTemplateRow[];
  defaults: WaitlistDefaults;
}
