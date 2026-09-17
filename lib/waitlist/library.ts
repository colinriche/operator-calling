// ─── The waitlist image and wording library ──────────────────────────────────
//
// Shapes and pure helpers shared by the admin panels, the admin API routes and
// the presentation code. Client-safe: no firebase-admin, no server imports.
//
// ─── Images ──────────────────────────────────────────────────────────────────
//
// A source's picture is one `imageChoice` string:
//
//   ""                 unset — whatever the page showed before the library
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
// The main copy of a page — heading, two paragraphs, the family sign-off and the
// link-preview description — comes in four variants, because the four kinds of
// page are selling different things (see presentation.ts).
//
// Each variant has a default: the built-in text, or an admin's edit of it held
// in settings. A source with no wording of its own follows the default, so
// editing the default changes it. Templates are saved copies an admin can start
// a source from; choosing one copies its text into the source, and later edits
// to the template do not reach pages that already used it.

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
    hint: "People who already know each other — a year group, an old team.",
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
}

export const EMPTY_WAITLIST_DEFAULTS: WaitlistDefaults = {
  imageChoice: "",
  imageChoiceUrl: null,
  wording: {},
};

/** Parse a stored defaults document, discarding anything malformed. */
export function sanitiseDefaults(raw: unknown): WaitlistDefaults {
  if (!raw || typeof raw !== "object") return EMPTY_WAITLIST_DEFAULTS;
  const data = raw as Record<string, unknown>;
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
  };
}

/** What the admin library endpoint returns. */
export interface WaitlistLibraryPayload {
  images: LibraryImageRow[];
  templates: WordingTemplateRow[];
  defaults: WaitlistDefaults;
}
