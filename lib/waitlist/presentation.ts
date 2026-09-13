// ─── One description of the page, used everywhere ────────────────────────────
//
// The waitlist page renders three quite different things depending on the
// tracked link that led to it, and each of those has to appear identically in
// three places: the page, the Open Graph tags, and the generated preview image.
//
// Previously the page held its own hard-coded headline and `metadata` held its
// own hard-coded title, so the two were only ever the same by coincidence — and
// once a link began carrying a topic they stopped being the same at all. This
// module is the only thing that decides what a waitlist page says. The page
// reads it, `generateMetadata` reads it, the OG image route reads it, and the
// admin preview reads it. There is no second place to change.
//
// Client-safe on purpose: pure functions, no firebase-admin, no `next/headers`.
// The admin panel builds a live preview from the same code the server renders
// from, which is what makes "the preview matches the page" a fact rather than a
// promise.

import {
  canNameSourcePublicly,
  CONNECTION_TYPE_IDS,
  DEFAULT_CONNECTION_TYPE,
  DEFAULT_RELATIONSHIP_STATUS,
  FALLBACK_AUDIENCE_LABEL,
  WAITLIST_MODE_IDS,
  type ConnectionType,
  type ShareChannel,
  type WaitlistMode,
} from "./constants";
import {
  independenceNote,
  resolveAudienceLabel,
  resolveDisclaimer,
  sourceDescriptor,
  sourceLine,
} from "./copy";
import { BRAND_ART_DATA_URI, isTopicArtId, topicArtDataUri } from "./topic-art";
import { urlSourceCode } from "./tracked-url";
import type {
  DemandSourceRow,
  WaitlistContext,
  WaitlistHero,
  WaitlistPresentation,
} from "./types";

// ─── Context assembly ────────────────────────────────────────────────────────
//
// The one mapping from stored source fields to the resolved public context.
// Shared by the server (reading Firestore) and the admin panel (previewing an
// unsaved edit), so a field can never mean one thing in the preview and another
// on the page.

/** The public-facing fields of a demand source, however they were obtained. */
export interface PublicSourceFields {
  platformId?: unknown;
  sourceType?: unknown;
  relationshipStatus?: unknown;
  publicDisplayName?: unknown;
  publicAudienceLabel?: unknown;
  topicName?: unknown;
  waitlistMode?: unknown;
  connectionType?: unknown;
  topicArtId?: unknown;
  familyName?: unknown;
  heroImageUrl?: unknown;
  groupId?: unknown;
}

export interface ContextMeta {
  sourceCode: string | null;
  demandSourceId: string | null;
  sourceLinkId: string | null;
  shareChannel: ShareChannel | null;
  /** True only when a live tracked source actually resolved. */
  attributed: boolean;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Which page a source renders.
 *
 * An unset or unrecognised value is not an error: sources created before modes
 * existed simply keep the page they already had — the community page when a
 * link resolved, the global one when it did not.
 */
export function resolveWaitlistMode(raw: unknown, attributed: boolean): WaitlistMode {
  const value = text(raw);
  if (WAITLIST_MODE_IDS.includes(value)) return value as WaitlistMode;
  return attributed ? "community" : "global";
}

/**
 * Whether these people already know each other.
 *
 * A family page is existing connections by definition — that is what a family
 * is — so it does not depend on the stored value being right. Everything else
 * falls back to shared interest, the weaker of the two claims.
 */
export function resolveConnectionType(
  raw: unknown,
  mode: WaitlistMode
): ConnectionType {
  if (mode === "family") return "existing_connections";
  const value = text(raw);
  return CONNECTION_TYPE_IDS.includes(value)
    ? (value as ConnectionType)
    : DEFAULT_CONNECTION_TYPE;
}

export function waitlistContextFrom(
  fields: PublicSourceFields,
  meta: ContextMeta
): WaitlistContext {
  const relationshipStatus =
    text(fields.relationshipStatus) || DEFAULT_RELATIONSHIP_STATUS;
  const mode = resolveWaitlistMode(fields.waitlistMode, meta.attributed);

  return {
    sourceCode: meta.sourceCode,
    demandSourceId: meta.demandSourceId,
    sourceLinkId: meta.sourceLinkId,
    platformId: text(fields.platformId) || null,
    groupId: text(fields.groupId) || null,
    audienceLabel: resolveAudienceLabel(text(fields.publicAudienceLabel)),
    disclaimer: resolveDisclaimer(relationshipStatus),
    relationshipStatus,
    attributed: meta.attributed,
    shareChannel: meta.shareChannel,

    mode,
    connectionType: resolveConnectionType(fields.connectionType, mode),
    sourceType: text(fields.sourceType) || null,
    publicDisplayName: text(fields.publicDisplayName),
    // Decided once, here. Every consumer asks this flag rather than re-deriving
    // the rule, so the page and its link preview cannot disagree about whether
    // a real community may be named.
    canNameSource: canNameSourcePublicly(relationshipStatus),
    topicName: text(fields.topicName),
    topicArtId: isTopicArtId(fields.topicArtId) ? fields.topicArtId : "",
    familyName: text(fields.familyName),
    heroImageUrl: text(fields.heroImageUrl) || null,
  };
}

/** The context for a visitor who arrived with no usable tracked link. */
export function globalContext(shareChannel: ShareChannel | null): WaitlistContext {
  return waitlistContextFrom(
    { waitlistMode: "global" },
    {
      sourceCode: null,
      demandSourceId: null,
      sourceLinkId: null,
      shareChannel,
      attributed: false,
    }
  );
}

// ─── Wording ─────────────────────────────────────────────────────────────────

const TAGLINE = "The operator makes the call, so you don't have to.";

/** Capitalise a topic without touching an already-capitalised name. */
function leadingCapital(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function bulletsFor(
  connectionType: ConnectionType
): WaitlistPresentation["bullets"] {
  const known = connectionType === "existing_connections";
  return [
    {
      id: "availability",
      // Type 1 must not put the visitor in the scheduler's seat, so this says
      // who decides rather than asking them when they are free.
      text: known
        ? "The Operator decides when it's time. Nothing to arrange between you."
        : "You pick when you're available — no searching for anyone.",
    },
    {
      id: "incoming",
      text: "The call comes to you. The Operator makes the connection.",
    },
    {
      id: "privacy",
      // In a group that already knows each other, everyone has everyone's
      // number — so the meaningful control is who you would rather not be put
      // through to, not whether numbers are shared.
      text: known
        ? "You choose who you'd rather not be connected with."
        : "Nobody exchanges phone numbers.",
    },
  ];
}

// ─── The two arguments ───────────────────────────────────────────────────────
//
// A page is selling one of two quite different things, and the wording is not
// interchangeable. For strangers the promise is that you never have to find
// anyone. For people who already know each other, finding each other was never
// the problem — remembering to actually call is.

/** Type 2: people who don't know each other but share something. */
function sharedInterestCopy(topic: string): { lead: string; body: string } {
  // Substituted as a whole clause rather than a bare noun: with no topic the
  // fallback replaces the "who share an interest in ___" construction instead
  // of filling its blank. Plural and singular differ only in agreement.
  const plural = topic
    ? `who share an interest in ${topic}`
    : "interested in The Operator Calling project";
  const singular = topic
    ? `who shares an interest in ${topic}`
    : "interested in The Operator Calling project";

  return {
    lead: `Enjoy voice calls with others ${plural}. Tell us when you're available, and The Operator will schedule a one-to-one call for you.`,
    body: `You don't need to search for people, send connection requests or arrange calls yourself. Tell us when you're available, and when someone else ${singular} is also available, The Operator will schedule a one-to-one call and ring you both when it's time.`,
  };
}

/**
 * Type 1: a year group, an old team. Family pages have their own wording below.
 *
 * The argument is not "we save you the admin". People in these groups can
 * already reach each other; what they have lost is the everyday reason to —
 * the shared job, the school run, the club night. So The Operator is the one
 * that decides when it is time, and the call arrives rather than being
 * arranged.
 *
 * That is why nothing here frames the visitor as the scheduler, mentions
 * overlapping availability, or reads like an appointment. Those phrasings turn
 * a warm, occasional thing into a standing commitment, which is the opposite
 * of what this audience is being offered.
 */
function existingConnectionsCopy(group: string): { lead: string; body: string } {
  return {
    lead: `Keep in contact with ${group}, and let The Operator decide when it's time to talk. It occasionally brings two members together for a one-to-one call, helping keep the connection strong.`,
    body: `When the everyday reasons for calling disappear, people can gradually drift apart. The Operator gives those connections a reason to talk again, occasionally bringing two members together for a one-to-one call. You stay in control, with privacy settings that let you choose who you do and who you don't want to be connected with. It helps keep relationships alive and strengthen the bond, rather than letting them dwindle into messages and social-media reactions.`,
  };
}

/**
 * A family page's own wording. Still Type 1 in substance — the call arrives
 * rather than being arranged — but written for families specifically, so it
 * names no one: the family's name is already the heading directly above.
 */
const FAMILY_COPY = {
  lead: "Keep in touch in a different way. Let The Operator bring family members together for one-to-one calls as and when the time suits.",
  body: "Families stay connected in all sorts of ways. The Operator adds something different: every so often, it pairs members and makes the call between them. It can pair together those who speak regularly, create a chance to catch up with someone you haven't spoken to for a while, you may even chat with family you never knew you had. You stay in control, with privacy settings that let you choose who you do and don't want to be connected with. It creates more opportunities to talk, helping keep family relationships active without anyone having to decide who should call whom. The app is for those that like to chat the old fashioned way, not by typing but by actual talking, if you want your phone to ring more often then this app is for you.",
  tagline: "The Operator makes the call, so you don't have to.",
  signoff: "The Operator app, for families, groups and communities",
};

// ─── What a link preview says ────────────────────────────────────────────────
//
// Deliberately not `lead`, which the preview used to repeat verbatim.
//
// A messaging app gives a description two lines and cuts the rest, and it
// prints that under a title and a card image it has already shown. So the job
// here is not to summarise the page: it is one sentence saying what this is,
// with the name the page is actually about inside it, short enough to arrive
// whole. The page's own opening paragraph is three times too long for that and
// loses its point mid-sentence.
//
// Built from the same names the page uses, so it cannot describe a different
// audience from the one on the other side of the link.

// The one exception to naming the audience: a family preview uses fixed
// wording chosen for it, since the family's name is already the title above.
const FAMILY_SOCIAL_DESCRIPTION =
  "The Operator app brings family members together through unexpected one-to-one calls.";

function socialDescriptionForKnownGroup(group: string): string {
  return `The Operator keeps ${group} in touch by occasionally bringing two members together for a private one-to-one call.`;
}

function socialDescriptionForInterest(topic: string): string {
  return topic
    ? `One-to-one voice calls with others who share an interest in ${topic}. Say when you're free and the call comes to you.`
    : "One-to-one voice calls with people who enjoy the same things you do. Say when you're free and the call comes to you.";
}

const GLOBAL_SOCIAL_DESCRIPTION =
  "One-to-one voice calls with people you haven't met. Say when you're free and the call comes to you.";

/**
 * Offered on every page that is not already about a family.
 *
 * Additive by design: it is a second interest recorded next to the first, and
 * ticking it must not reinterpret the group or topic the visitor arrived for.
 */
const FAMILY_PROMPT =
  "Would you also like to use The Operator to keep your family connected?";

// ─── The build ───────────────────────────────────────────────────────────────

/**
 * Everything the three surfaces render, derived from the resolved context.
 *
 * Note what the three modes do *not* share. Global says nothing about a shared
 * interest, because there isn't one — the fallback audience label ("people who
 * share this interest") must never reach a global page, which is the specific
 * bug this function exists to make impossible. Community leads with the topic
 * and the source. Family leads with the family's own name.
 */
export function buildWaitlistPresentation(
  context: WaitlistContext
): WaitlistPresentation {
  const common = {
    mode: context.mode,
    connectionType: context.connectionType,
    bullets: bulletsFor(context.connectionType),
    formHeading: "Register your interest",
    tagline: TAGLINE as string | null,
    signoff: null as string | null,
    // Asking a family page whether you would also like a family page is asking
    // something the visitor has already answered by being here.
    familyPrompt: context.mode === "family" ? null : FAMILY_PROMPT,
  };

  // The relationship-derived fine print is about a community we were linked
  // from. On a page with no such community it would be answering a question
  // nobody asked, in wording that names a link the visitor never followed.
  const NEUTRAL_DISCLAIMER =
    "The Operator is an independent service. Calls take place through The Operator, and nobody shares their phone number.";

  if (context.mode === "family") {
    // Falls back rather than printing an empty heading: a family source whose
    // name has not been filled in yet still has to render something truthful.
    const family = context.familyName || context.publicDisplayName || "your family";
    const heading = leadingCapital(family);
    return {
      ...common,
      eyebrow: "A private calling group",
      heading,
      lead: FAMILY_COPY.lead,
      body: FAMILY_COPY.body,
      tagline: FAMILY_COPY.tagline,
      signoff: FAMILY_COPY.signoff,
      disclaimer: NEUTRAL_DISCLAIMER,
      independenceNote: null,
      formIntro: `Register your interest in joining calls with ${family}.`,
      formFootnote:
        "Joining records your interest. We may email you about these calls. Your details are not shared with anyone outside The Operator.",
      successNote: `We'll keep your interest linked to ${family}. When the calling group is ready, we can let you know.`,
      organiserLabel:
        "I may be interested in helping organise or schedule these calls.",
      shareText: `Voice calls for ${family} on The Operator — you say when you're free and the call comes to you.`,
      interestLabel: family,
      hero: heroFor(context, heading),
      og: {
        title: heading,
        description: FAMILY_SOCIAL_DESCRIPTION,
      },
    };
  }

  if (context.mode === "community") {
    const descriptor = sourceDescriptor(context.platformId, context.sourceType);
    const eyebrow = sourceLine(
      descriptor,
      context.publicDisplayName,
      context.canNameSource
    );

    // The topic is what the page leads with, so it needs a real value before
    // the audience label's neutral fallback is allowed anywhere near it.
    const topic =
      context.topicName ||
      (context.audienceLabel === FALLBACK_AUDIENCE_LABEL
        ? ""
        : context.audienceLabel);
    const known = context.connectionType === "existing_connections";

    const heading = topic
      ? leadingCapital(topic)
      : known
        ? "Keeping your group in contact"
        : "Talking with people who share your interests";

    // The group's own name where there is one. "your group" rather than a
    // topic-shaped filler, because Type 1 sentences read "keep in touch
    // with ___" and a topic noun does not fit there.
    const group = topic || "your group";
    const { lead, body } = known
      ? existingConnectionsCopy(group)
      : sharedInterestCopy(topic);

    const label = topic || context.audienceLabel;

    return {
      ...common,
      eyebrow,
      heading,
      lead,
      body,
      disclaimer: context.disclaimer,
      independenceNote: independenceNote(context.relationshipStatus, descriptor),
      formIntro: known
        ? `Register your interest in keeping in contact with ${group}.`
        : `Register your interest in talking with people interested in ${label}.`,
      formFootnote: `Joining records your interest. We may email you about this Operator calling group. The ${descriptor} where you found this link does not receive your details. When enough people register, an Operator calling group may be created for this ${known ? "group" : "interest"}.`,
      successNote: known
        ? `We'll keep your interest linked to ${group}. When enough of the group have registered and a calling group is created, we can let you know.`
        : `We'll keep your interest linked to ${label}. If enough people are interested and a calling group is created, we can let you know.`,
      organiserLabel: context.groupId
        ? "I may be interested in helping organise or schedule calls for this group."
        : known
          ? "I may be interested in helping organise or schedule calls for this group."
          : "I may be interested in helping organise or schedule calls around this interest.",
      // Drops the "about ___" clause entirely with no topic, rather than
      // reaching for a filler noun — a share message naming no subject still
      // reads properly, which is not true of "voice calls about this topic".
      shareText: known
        ? `A way for ${group} to keep in contact by voice — The Operator occasionally brings two members together for a one-to-one call.`
        : topic
          ? `This might interest people who like one-to-one voice calls about ${topic}. You make yourself available and The Operator arranges the call.`
          : "This might interest people who like one-to-one voice calls. You make yourself available and The Operator arranges the call.",
      interestLabel: topic || context.audienceLabel,
      hero: heroFor(context, heading),
      og: {
        title: eyebrow ? `${heading} — ${eyebrow}` : heading,
        description: known
          ? socialDescriptionForKnownGroup(group)
          : socialDescriptionForInterest(topic),
      },
    };
  }

  // ─── Global ───────────────────────────────────────────────────────────────
  // No topic, no source, no shared-interest wording anywhere.
  const heading = "Like talking on the phone with new people?";
  const lead =
    "One-to-one voice calls with people you haven't met. You make yourself available and The Operator makes the call.";

  return {
    ...common,
    eyebrow: null,
    heading,
    lead,
    body:
      "You do not need to search for people, send connection requests or arrange the call yourself. Make yourself available and, when a suitable call is scheduled, The Operator makes the connection and the call comes to you.",
    disclaimer: NEUTRAL_DISCLAIMER,
    independenceNote: null,
    formIntro: "Register your interest in talking with new people by voice.",
    formFootnote:
      "Joining records your interest. We may email you about The Operator. Your details are not shared with anyone else.",
    successNote:
      "We'll let you know when calls open up. Nothing is scheduled until you say you're available.",
    organiserLabel:
      "I may be interested in helping organise or schedule calls.",
    shareText:
      "This might interest someone who'd rather talk than type. You make yourself available and The Operator arranges the call.",
    interestLabel: "talking with new people",
    hero: heroFor(context, heading),
    og: { title: heading, description: GLOBAL_SOCIAL_DESCRIPTION },
  };
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function heroFor(context: WaitlistContext, heading: string): WaitlistHero {
  // An uploaded image belongs to family mode only. A community source that once
  // had one and was switched back must not keep showing it.
  if (context.mode === "family" && context.heroImageUrl) {
    return { kind: "image", src: context.heroImageUrl, alt: heading };
  }

  if (context.mode === "community" && context.topicArtId) {
    return {
      kind: "art",
      src: topicArtDataUri(context.topicArtId),
      alt: "",
    };
  }

  return { kind: "brand", src: BRAND_ART_DATA_URI, alt: "" };
}

// ─── Admin preview ───────────────────────────────────────────────────────────

/**
 * What a demand source's waitlist page currently renders, from the row the
 * admin API returns.
 *
 * `overrides` carries unsaved edits, so a panel can preview a mode or an
 * artwork the record does not have yet. With none, this is the live page.
 *
 * The point of it being one function is `hero`: which of the uploaded image,
 * the curated artwork and the brand mark a source actually shows is decided by
 * heroFor and nothing else. Anywhere that answers that question by reading
 * waitlistMode itself will eventually answer it differently.
 */
export function demandSourcePresentation(
  source: DemandSourceRow,
  overrides: PublicSourceFields = {}
): WaitlistPresentation {
  return buildWaitlistPresentation(
    waitlistContextFrom(
      {
        platformId: source.platformId,
        sourceType: source.sourceType,
        relationshipStatus: source.relationshipStatus,
        publicDisplayName: source.publicDisplayName,
        publicAudienceLabel: source.publicAudienceLabel,
        topicName: source.topicName,
        groupId: source.groupId,
        waitlistMode: source.waitlistMode,
        connectionType: source.connectionType,
        topicArtId: source.topicArtId,
        familyName: source.familyName,
        heroImageUrl: source.heroImageUrl,
        ...overrides,
      },
      {
        sourceCode: source.links[0]?.sourceCode ?? null,
        demandSourceId: source.id,
        sourceLinkId: source.links[0]?.id ?? null,
        shareChannel: null,
        attributed: true,
      }
    )
  );
}

// ─── Open Graph image URL ────────────────────────────────────────────────────

/**
 * Absolute URL of the generated preview image for a tracked link.
 *
 * Absolute because crawlers do not resolve relative `og:image` values, and
 * carrying the source code because the image is built from the same context the
 * page is — pass the code, get that page's image.
 */
export function waitlistOgImageUrl(
  origin: string,
  sourceCode: string | null,
  version?: string
): string {
  const base = `${origin.replace(/\/+$/, "")}/api/og/waitlist`;
  const params = new URLSearchParams();
  if (sourceCode) params.set("s", urlSourceCode(sourceCode));
  if (version) params.set("v", version);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * A token that changes when the card would.
 *
 * Facebook and WhatsApp cache a preview against its image URL and re-fetch on
 * their own schedule, which for a URL that never changes is somewhere between
 * "eventually" and "never". Replacing a family photograph or picking different
 * artwork would leave the old card in circulation indefinitely — worse than a
 * plain miss, because the link then shows a picture the admin deliberately
 * took down.
 *
 * So the version is derived from exactly what the card is built out of. Change
 * the image, the artwork, the mode or the wording and the og:image URL changes
 * with it, which every scraper treats as a different image. Change anything
 * else and it does not, so an unrelated edit costs nobody a re-fetch.
 *
 * What it does NOT do is refresh an already-shared link. Facebook and WhatsApp
 * cache the *page* URL and the metadata they scraped from it, so a link posted
 * yesterday keeps yesterday's card — including yesterday's og:image address —
 * until they re-scrape, which is on their schedule and not ours. This only
 * guarantees that a re-scrape, whenever it happens, cannot be served a stale
 * image. Forcing one is a manual act: Facebook's Sharing Debugger has a Scrape
 * Again button, and for WhatsApp the practical answer is to share a link it has
 * not seen before.
 *
 * FNV-1a rather than a crypto hash: this is a cache key, not a signature, and
 * it has to be computable in the browser as well as on the server.
 */
export function waitlistOgImageVersion(p: WaitlistPresentation): string {
  const material = [
    p.mode,
    p.hero.kind,
    p.hero.src,
    p.og.title,
    p.og.description,
  // A separator no field can contain, so two different value sets cannot
  // concatenate into the same string.
  ].join("\u0000");

  let hash = 0x811c9dc5;
  for (let i = 0; i < material.length; i++) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
