// ─── One description of the page, used everywhere ────────────────────────────
//
// The waitlist page renders three quite different things depending on the
// tracked link that led to it, and each of those has to appear identically in
// three places: the page, the Open Graph tags, and the generated preview image.
//
// Previously the page held its own hard-coded headline and `metadata` held its
// own hard-coded title, so the two were only ever the same by coincidence - and
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
} from "./copy";
import { builtinImage, FALLBACK_DEFAULT_IMAGE_CHOICE } from "./builtin-images";
import {
  EMPTY_WAITLIST_DEFAULTS,
  parseImageChoice,
  sanitiseSocialImages,
  sanitiseSocialImageUrls,
  sanitiseWording,
  wordingVariantFor,
  type ParsedImageChoice,
  type SocialNetwork,
  type WaitlistDefaults,
  type WaitlistWording,
  type WordingVariant,
} from "./library";
import { BRAND_ART_DATA_URI, isTopicArtId, topicArtDataUri } from "./topic-art";
import { topicSlug, urlSourceCode } from "./tracked-url";
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
  publicEyebrow?: unknown;
  topicName?: unknown;
  includeTopicInUrl?: unknown;
  waitlistMode?: unknown;
  connectionType?: unknown;
  topicArtId?: unknown;
  familyName?: unknown;
  heroImageUrl?: unknown;
  imageChoice?: unknown;
  imageChoiceUrl?: unknown;
  socialImages?: unknown;
  socialImageUrls?: unknown;
  wording?: unknown;
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
 * existed simply keep the page they already had - the community page when a
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
 * A family page is existing connections by definition - that is what a family
 * is - so it does not depend on the stored value being right. Everything else
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
  meta: ContextMeta,
  defaults: WaitlistDefaults = EMPTY_WAITLIST_DEFAULTS
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
    publicEyebrow: text(fields.publicEyebrow),
    // Decided once, here. Every consumer asks this flag rather than re-deriving
    // the rule, so the page and its link preview cannot disagree about whether
    // a real community may be named.
    canNameSource: canNameSourcePublicly(relationshipStatus),
    topicName: text(fields.topicName),
    includeTopicInUrl: fields.includeTopicInUrl === true,
    topicArtId: isTopicArtId(fields.topicArtId) ? fields.topicArtId : "",
    familyName: text(fields.familyName),
    heroImageUrl: text(fields.heroImageUrl) || null,
    imageChoice: parseImageChoice(fields.imageChoice) ? text(fields.imageChoice) : "",
    imageChoiceUrl: text(fields.imageChoiceUrl) || null,
    socialImages: sanitiseSocialImages(fields.socialImages),
    socialImageUrls: sanitiseSocialImageUrls(fields.socialImageUrls),
    wording: sanitiseWording(fields.wording),
    defaults,
  };
}

/** The context for a visitor who arrived with no usable tracked link. */
export function globalContext(
  shareChannel: ShareChannel | null,
  defaults: WaitlistDefaults = EMPTY_WAITLIST_DEFAULTS
): WaitlistContext {
  return waitlistContextFrom(
    { waitlistMode: "global" },
    {
      sourceCode: null,
      demandSourceId: null,
      sourceLinkId: null,
      shareChannel,
      attributed: false,
    },
    defaults
  );
}

// ─── Wording ─────────────────────────────────────────────────────────────────

const TAGLINE = "The Operator makes the call, so you don't have to.";

/**
 * The title Facebook's fetcher gets, and nobody else.
 *
 * Facebook stacks the card, the title and the description, and the card
 * already prints what this page is about in the band under the picture. A
 * title repeating it put the same words twice in two lines, so this one says
 * what The Operator is instead - the page's own name is in the picture above
 * it. Everyone else keeps the page's title, since their previews lean on it.
 */
const FACEBOOK_TITLE = "The Operator - making the call for you";

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
        : "You pick when you're available - no searching for anyone.",
    },
    {
      id: "incoming",
      text: "The call comes to you. The Operator makes the connection.",
    },
    {
      id: "privacy",
      // In a group that already knows each other, everyone has everyone's
      // number - so the meaningful control is who you would rather not be put
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
// the problem - remembering to actually call is.
//
// Type 2, shared interest: people who don't know each other but share
// something.
//
// Type 1, existing connections: a year group, an old team. The argument is not
// "we save you the admin". People in these groups can already reach each
// other; what they have lost is the everyday reason to - the shared job, the
// school run, the club night. So The Operator is the one that decides when it
// is time, and the call arrives rather than being arranged. That is why nothing
// in it frames the visitor as the scheduler, mentions overlapping availability,
// or reads like an appointment.
//
// Family pages are still Type 1 in substance, but written for families
// specifically, so the text names no one: the family's name is the heading.
//
// ─── What a link preview says ────────────────────────────────────────────────
//
// `ogDescription` is deliberately not the opening paragraph, which the preview
// used to repeat verbatim. A messaging app gives a description two lines and
// prints it under a title and a card it has already shown, so the job is one
// sentence saying what this is.
//
// It no longer names the topic. The card already prints it, in the band under
// the picture, and Facebook stacks the card, the title and the description on
// top of each other - so a topic in all three arrived three times in as many
// lines. The default is general on purpose: the card says which group this is,
// and the description says what The Operator does. A source that wants its own
// name in the description can still put {topic}, {group} or {family} there.
//
// ─── Built-in wording ────────────────────────────────────────────────────────
//
// The text every page used before wording was editable, written with the
// placeholders an admin edits with. Admins can replace any variant's default
// (settings/waitlistDefaults) or give a source its own copy; this is what is
// shown when neither exists, and what "reset to built-in" goes back to.

export const BUILTIN_WORDING: Record<WordingVariant, WaitlistWording> = {
  global: {
    heading: "Like talking on the phone with new people?",
    lead: "One-to-one voice calls with people you haven't met. You make yourself available and The Operator makes the call.",
    body: "You do not need to search for people, send connection requests or arrange the call yourself. Make yourself available and, when a suitable call is scheduled, The Operator makes the connection and the call comes to you.",
    bodyContinued: "",
    signoff: "",
    ogDescription:
      "One-to-one voice calls with people you haven't met. Say when you're free and the call comes to you.",
    shareText:
      "This might interest someone who'd rather talk than type. You make yourself available and The Operator arranges the call.",
  },
  community_interest: {
    heading: "{topic}",
    lead: "Enjoy voice calls with others who share an interest in {topic}. Tell us when you're available, and The Operator will schedule a one-to-one call for you.",
    body: "You don't need to search for people, send connection requests or arrange calls yourself. Tell us when you're available, and when someone else who shares an interest in {topic} is also available, The Operator will schedule a one-to-one call and ring you both when it's time.",
    bodyContinued: "",
    signoff: "",
    ogDescription:
      "One-to-one voice calls with people who enjoy the same things you do. Say when you're free and the call comes to you.",
    shareText:
      "This might interest people who like one-to-one voice calls about {topic}. You make yourself available and The Operator arranges the call.",
  },
  community_known: {
    heading: "{group}",
    lead: "Keep in contact with {group}, and let The Operator decide when it's time to talk. It occasionally brings two members together for a one-to-one call, helping keep the connection strong.",
    body: "When the everyday reasons for calling disappear, people can gradually drift apart. The Operator gives those connections a reason to talk again, occasionally bringing two members together for a one-to-one call. You stay in control, with privacy settings that let you choose who you do and who you don't want to be connected with. It helps keep relationships alive and strengthen the bond, rather than letting them dwindle into messages and social-media reactions.",
    bodyContinued: "",
    signoff: "",
    ogDescription:
      "The Operator keeps a group in touch by occasionally bringing two of its members together for a private one-to-one call.",
    shareText:
      "A way for {group} to keep in contact by voice - The Operator occasionally brings two members together for a one-to-one call.",
  },
  family: {
    heading: "{family}",
    lead: "Keep in touch in a different way. Let The Operator bring family members together for one-to-one calls as and when the time suits.",
    body: "Families stay connected in all sorts of ways. The Operator adds something different: every so often, it pairs members and makes the call between them. It can pair together those who speak regularly, create a chance to catch up with someone you haven't spoken to for a while, you may even chat with family you never knew you had.",
    bodyContinued:
      "You stay in control, with privacy settings that let you choose who you do and don't want to be connected with. It creates more opportunities to talk, helping keep family relationships active without anyone having to decide who should call whom. The app is for those that like to chat the old fashioned way, not by typing but by actual talking, if you want your phone to ring more often then this app is for you.",
    signoff: "The Operator app, for families, groups and communities",
    ogDescription:
      "The Operator app brings family members together through unexpected one-to-one calls.",
    shareText:
      "Voice calls for {family} on The Operator - you say when you're free and the call comes to you.",
  },
};

/** The default wording for a variant: an admin's edit if there is one. */
export function defaultWording(
  variant: WordingVariant,
  defaults: WaitlistDefaults
): WaitlistWording {
  return defaults.wording[variant] ?? BUILTIN_WORDING[variant];
}

interface WordingValues {
  /** "" when the source has no topic. */
  topic: string;
  group: string;
  family: string;
}

/** Headings used when a heading is only a placeholder with nothing to fill it. */
const EMPTY_TOPIC_HEADINGS: Partial<Record<WordingVariant, string>> = {
  community_interest: "Talking with people who share your interests",
  community_known: "Keeping your group in contact",
};

/**
 * Put the page's names into a piece of wording.
 *
 * Built so the built-in text renders exactly as it did before it was editable.
 * With no topic, "who share(s) an interest in {topic}" is replaced as a whole
 * clause rather than having its blank filled with a filler noun, and a heading
 * that is nothing but the placeholder falls back to a real sentence.
 */
function fillWording(
  wording: WaitlistWording,
  variant: WordingVariant,
  values: WordingValues
): WaitlistWording {
  const fill = (value: string) => {
    let out = value;
    if (!values.topic) {
      out = out.replace(
        /who shares? an interest in \{topic\}/g,
        "interested in The Operator Calling project"
      );
      // "voice calls about ___" drops the clause rather than naming a filler
      // subject, so a share message with no topic still reads properly.
      out = out.replace(/ about \{topic\}/g, "");
    }
    return out
      .replace(/\{topic\}/g, values.topic || "this interest")
      .replace(/\{group\}/g, values.group)
      .replace(/\{family\}/g, values.family);
  };

  const emptyHeading = EMPTY_TOPIC_HEADINGS[variant];
  const heading =
    emptyHeading && !values.topic && /^\{(topic|group)\}$/.test(wording.heading.trim())
      ? emptyHeading
      : leadingCapital(fill(wording.heading));

  return {
    heading,
    lead: fill(wording.lead),
    body: fill(wording.body),
    bodyContinued: fill(wording.bodyContinued),
    signoff: fill(wording.signoff),
    ogDescription: fill(wording.ogDescription),
    // Empty means nobody has written one: wording saved before the share
    // message was editable, or a field cleared. Either way the built-in stands
    // in, rather than a share button carrying nothing.
    shareText: fill(wording.shareText || BUILTIN_WORDING[variant].shareText),
  };
}

/** The wording a page renders: its own copy, else the default, filled in. */
function wordingFor(
  context: WaitlistContext,
  values: WordingValues
): WaitlistWording {
  const variant = wordingVariantFor(context.mode, context.connectionType);
  return fillWording(
    context.wording ?? defaultWording(variant, context.defaults),
    variant,
    values
  );
}

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
 * interest, because there isn't one - the fallback audience label ("people who
 * share this interest") must never reach a global page, which is the specific
 * bug this function exists to make impossible. Community leads with the topic
 * and the source. Family leads with the family's own name.
 */
export function buildWaitlistPresentation(
  context: WaitlistContext,
  /**
   * The network whose link preview this is for. Changes only the picture, and
   * only where one was chosen for that network; the page itself passes none.
   */
  network: SocialNetwork | null = null
): WaitlistPresentation {
  const common = {
    mode: context.mode,
    connectionType: context.connectionType,
    bullets: bulletsFor(context.connectionType),
    formHeading: "Register your interest",
    tagline: TAGLINE as string | null,
    signoff: null as string | null,
    bodyContinued: null as string | null,
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
    const w = wordingFor(context, { topic: family, group: family, family });
    const heading = w.heading;
    return {
      ...common,
      // An admin's own line, else what a family page is.
      eyebrow: context.publicEyebrow || "A private calling group",
      heading,
      lead: w.lead,
      body: w.body,
      bodyContinued: w.bodyContinued || null,
      signoff: w.signoff || null,
      disclaimer: NEUTRAL_DISCLAIMER,
      independenceNote: null,
      formIntro: `Register your interest in joining calls with ${family}.`,
      formFootnote:
        "Joining records your interest. We may email you about these calls. Your details are not shared with anyone outside The Operator.",
      successNote: `We'll keep your interest linked to ${family}. When the calling group is ready, we can let you know.`,
      organiserLabel:
        "I may be interested in helping organise or schedule these calls.",
      shareText: w.shareText,
      shareSubject: `${heading} on The Operator`,
      shareSlug: shareSlugFor(context, family),
      interestLabel: family,
      hero: heroFor(context, heading, network),
      og: {
        title: heading,
        facebookTitle: FACEBOOK_TITLE,
        description: w.ogDescription,
      },
    };
  }

  if (context.mode === "community") {
    // Whatever an admin typed, and nothing otherwise. This line used to be
    // built from the platform - "from a Facebook group" - which named a
    // company that had no part in the page.
    const eyebrow = context.publicEyebrow || null;

    // The topic is what the page leads with, so it needs a real value before
    // the audience label's neutral fallback is allowed anywhere near it.
    const topic =
      context.topicName ||
      (context.audienceLabel === FALLBACK_AUDIENCE_LABEL
        ? ""
        : context.audienceLabel);
    const known = context.connectionType === "existing_connections";

    // The group's own name where there is one. "your group" rather than a
    // topic-shaped filler, because Type 1 sentences read "keep in touch
    // with ___" and a topic noun does not fit there.
    const group = topic || "your group";
    const w = wordingFor(context, {
      topic,
      group,
      family: context.familyName || group,
    });
    const { heading, lead, body } = w;

    const label = topic || context.audienceLabel;

    return {
      ...common,
      eyebrow,
      heading,
      lead,
      body,
      disclaimer: context.disclaimer,
      independenceNote: independenceNote(context.relationshipStatus),
      formIntro: known
        ? `Register your interest in keeping in contact with ${group}.`
        : `Register your interest in talking with people interested in ${label}.`,
      formFootnote: `Joining records your interest. We may email you about this Operator calling group. The group or discussion where you found this link does not receive your details. When enough people register, an Operator calling group may be created for this ${known ? "group" : "interest"}.`,
      successNote: known
        ? `We'll keep your interest linked to ${group}. When enough of the group have registered and a calling group is created, we can let you know.`
        : `We'll keep your interest linked to ${label}. If enough people are interested and a calling group is created, we can let you know.`,
      organiserLabel: context.groupId
        ? "I may be interested in helping organise or schedule calls for this group."
        : known
          ? "I may be interested in helping organise or schedule calls for this group."
          : "I may be interested in helping organise or schedule calls around this interest.",
      // Drops the "about ___" clause entirely with no topic, rather than
      // reaching for a filler noun - a share message naming no subject still
      // reads properly, which is not true of "voice calls about this topic".
      shareText: w.shareText,
      shareSubject: `${heading} on The Operator`,
      shareSlug: shareSlugFor(context, topic),
      interestLabel: topic || context.audienceLabel,
      hero: heroFor(context, heading, network),
      og: {
        title: eyebrow ? `${heading} - ${eyebrow}` : heading,
        facebookTitle: FACEBOOK_TITLE,
        description: w.ogDescription,
      },
    };
  }

  // ─── Global ───────────────────────────────────────────────────────────────
  // No topic, no source, no shared-interest wording anywhere.
  const w = wordingFor(context, {
    topic: "",
    group: "your group",
    family: "your family",
  });
  const heading = w.heading;

  return {
    ...common,
    eyebrow: context.publicEyebrow || null,
    heading,
    lead: w.lead,
    body: w.body,
    disclaimer: NEUTRAL_DISCLAIMER,
    independenceNote: null,
    formIntro: "Register your interest in talking with new people by voice.",
    formFootnote:
      "Joining records your interest. We may email you about The Operator. Your details are not shared with anyone else.",
    successNote:
      "We'll let you know when calls open up. Nothing is scheduled until you say you're available.",
    organiserLabel:
      "I may be interested in helping organise or schedule calls.",
    shareText: w.shareText,
    // The global heading is a question, which reads badly as a subject line.
    shareSubject: "Thought this might interest you",
    shareSlug: "",
    interestLabel: "talking with new people",
    hero: heroFor(context, heading, network),
    og: {
      title: heading,
      facebookTitle: FACEBOOK_TITLE,
      description: w.ogDescription,
    },
  };
}

/**
 * The readable slug a shared link carries, or "" for none.
 *
 * The same opt-in the admin panel's copyable link uses, so a source that was
 * deliberately kept anonymous in its URLs stays that way when a visitor shares
 * it. The page ignores the slug either way - see lib/waitlist/tracked-url.ts.
 */
function shareSlugFor(context: WaitlistContext, subject: string): string {
  if (!context.sourceCode || !context.includeTopicInUrl) return "";
  return topicSlug(subject);
}

// ─── Hero ────────────────────────────────────────────────────────────────────

/**
 * The choice a source is effectively making, for a picker to highlight.
 *
 * An unset choice is not "default" when the source still shows what it showed
 * before the library existed. Mirrors heroFor, so the tile a picker highlights
 * is the picture the page shows.
 */
export function effectiveImageChoice(fields: {
  imageChoice: string;
  waitlistMode: string;
  heroImageUrl: string | null;
  topicArtId: string;
}): string {
  if (parseImageChoice(fields.imageChoice)) return fields.imageChoice;
  const mode = resolveWaitlistMode(fields.waitlistMode, true);
  if (mode === "family" && fields.heroImageUrl) return "own";
  if (mode === "community" && isTopicArtId(fields.topicArtId)) {
    return `art:${fields.topicArtId}`;
  }
  return "default";
}

/**
 * Which picture a page shows.
 *
 * An explicit choice wins. With none, a source keeps what it showed before the
 * library existed - a family's photograph, a community's artwork - and
 * everything else gets the default.
 */
function heroFor(
  context: WaitlistContext,
  heading: string,
  network: SocialNetwork | null
): WaitlistHero {
  // A picture chosen for this network wins over the page's. "default" means
  // the default as it applies to this network.
  if (network) {
    const override = parseImageChoice(context.socialImages[network]);
    if (override?.type === "default") return defaultHero(context, heading, network);
    if (override) {
      const hero = heroFromChoice(
        override,
        context.socialImageUrls[network] ?? null,
        context,
        heading
      );
      if (hero) return hero;
    }
  }

  const chosen = parseImageChoice(context.imageChoice);
  if (chosen && chosen.type !== "default") {
    const hero = heroFromChoice(chosen, context.imageChoiceUrl, context, heading);
    if (hero) return hero;
  }

  if (!chosen) {
    // An uploaded image belongs to family mode only. A community source that
    // once had one and was switched back must not keep showing it.
    if (context.mode === "family" && context.heroImageUrl) {
      return { kind: "image", src: context.heroImageUrl, alt: heading };
    }
    if (context.mode === "community" && context.topicArtId) {
      return { kind: "art", src: topicArtDataUri(context.topicArtId), alt: "" };
    }
  }

  return defaultHero(context, heading, network);
}

function defaultHero(
  context: WaitlistContext,
  heading: string,
  network: SocialNetwork | null
): WaitlistHero {
  // The default's own picture for this network, where one was set.
  if (network) {
    const forNetwork = parseImageChoice(context.defaults.socialImages[network]);
    if (forNetwork && forNetwork.type !== "default" && forNetwork.type !== "own") {
      const hero = heroFromChoice(
        forNetwork,
        context.defaults.socialImageUrls[network] ?? null,
        context,
        heading
      );
      if (hero) return hero;
    }
  }

  const stored = parseImageChoice(context.defaults.imageChoice);
  if (stored && stored.type !== "default" && stored.type !== "own") {
    const hero = heroFromChoice(stored, context.defaults.imageChoiceUrl, context, heading);
    if (hero) return hero;
  }
  const fallback = parseImageChoice(FALLBACK_DEFAULT_IMAGE_CHOICE);
  return (
    (fallback && heroFromChoice(fallback, null, context, heading)) || {
      kind: "brand",
      src: BRAND_ART_DATA_URI,
      alt: "",
    }
  );
}

/** A choice as a picture, or null when it no longer points at one. */
function heroFromChoice(
  choice: ParsedImageChoice,
  url: string | null,
  context: WaitlistContext,
  heading: string
): WaitlistHero | null {
  switch (choice.type) {
    case "builtin": {
      const image = builtinImage(choice.id);
      return image
        ? { kind: "builtin", src: image.pageSrc, alt: image.alt, builtinId: image.id }
        : null;
    }
    case "art":
      return isTopicArtId(choice.id)
        ? { kind: "art", src: topicArtDataUri(choice.id), alt: "" }
        : null;
    case "library":
      return url ? { kind: "image", src: url, alt: heading } : null;
    case "own":
      // Private to its family: never shown once the page is not a family page.
      return context.mode === "family" && context.heroImageUrl
        ? { kind: "image", src: context.heroImageUrl, alt: heading }
        : null;
    case "brand":
      return { kind: "brand", src: BRAND_ART_DATA_URI, alt: "" };
    default:
      return null;
  }
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
  overrides: PublicSourceFields = {},
  defaults: WaitlistDefaults = EMPTY_WAITLIST_DEFAULTS
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
        publicEyebrow: source.publicEyebrow,
        includeTopicInUrl: source.includeTopicInUrl,
        groupId: source.groupId,
        waitlistMode: source.waitlistMode,
        connectionType: source.connectionType,
        topicArtId: source.topicArtId,
        familyName: source.familyName,
        heroImageUrl: source.heroImageUrl,
        imageChoice: source.imageChoice,
        imageChoiceUrl: source.imageChoiceUrl,
        socialImages: source.socialImages,
        socialImageUrls: source.socialImageUrls,
        wording: source.wording,
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
 * The network a card is for, or null when that network's card would be the
 * page's own card.
 *
 * Deliberately collapsed: a network with no picture of its own shares the
 * page's card - its address, its stored file, its cache - rather than getting
 * an identical copy under a different name. The page, the image route and the
 * warm-up all ask this, so they agree on which file a network is served.
 */
export function cardNetwork(
  context: WaitlistContext,
  network: SocialNetwork | null
): SocialNetwork | null {
  if (!network) return null;
  const page = buildWaitlistPresentation(context);
  const forNetwork = buildWaitlistPresentation(context, network);
  return forNetwork.hero.src === page.hero.src ? null : network;
}

/**
 * Absolute URL of the generated preview image for a tracked link.
 *
 * Absolute because crawlers do not resolve relative `og:image` values, and
 * carrying the source code because the image is built from the same context the
 * page is - pass the code, get that page's image.
 */
export function waitlistOgImageUrl(
  origin: string,
  sourceCode: string | null,
  version?: string,
  network?: SocialNetwork | null
): string {
  const base = `${origin.replace(/\/+$/, "")}/api/og/waitlist`;
  const params = new URLSearchParams();
  if (sourceCode) params.set("s", urlSourceCode(sourceCode));
  if (network) params.set("n", network);
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
 * artwork would leave the old card in circulation indefinitely - worse than a
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
 * yesterday keeps yesterday's card - including yesterday's og:image address -
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
    // The encoding. Moving from PNG to JPEG had to move every address, or the
    // edge would keep serving the oversized PNG under the old one for a day.
    "jpeg",
    // How uploads are fitted. Cards stored before pictures stopped being
    // cropped at the sides must not be served again under the same address.
    "fit-width",
    // The encoder's quality, so cards stored at the softer setting are made
    // again rather than served from their old address.
    "q92",
    p.mode,
    p.hero.kind,
    p.hero.src,
    p.eyebrow ?? "",
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
