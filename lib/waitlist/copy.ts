// ─── Relationship-aware public wording ───────────────────────────────────────
//
// The disclaimer shown on the waitlist page is derived from the demand source's
// recorded relationshipStatus and nothing else. A tracked link is attribution
// only — it never implies the destination forum, group or its organisers have
// approved, adopted or partnered with The Operator.

import {
  FALLBACK_AUDIENCE_LABEL,
  type RelationshipStatus,
} from "./constants";

/**
 * The phrase dropped into "Register your interest in talking with people
 * interested in ___." Falls back to neutral wording when a source has no
 * label recorded, so we never invent a name for an audience.
 */
export function resolveAudienceLabel(label: string | null | undefined): string {
  const trimmed = (label ?? "").trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_AUDIENCE_LABEL;
}

/**
 * Disclaimer text for a relationship status. Anything unrecognised gets the
 * most conservative wording rather than the most flattering one.
 */
export function resolveDisclaimer(status: RelationshipStatus | string): string {
  switch (status) {
    case "organiser_interested":
    case "organiser_verified":
      return "The Operator is an independent service, being explored as a calling option for people interested in this topic or group. It is not integrated with that site.";
    case "officially_supported":
      return "The Operator is an independent service. The organisers are supporting or exploring it as a calling option, but it is not part of their site.";
    case "partnered":
      return "The Operator is working in partnership with the organisers of this group. It remains a separate service, not part of their site.";
    case "unverified":
    case "independent_interest":
    case "organiser_contacted":
    default:
      return "The Operator is an independent service and is not affiliated with the website, group or discussion where you found this link. Its owners and organisers have not approved, partnered with or integrated The Operator.";
  }
}

// ─── Naming the source in plain text ─────────────────────────────────────────
//
// Deliberately words, never logos. Reproducing a platform's mark next to an
// invitation implies that platform is behind it, and most brand guidelines say
// so explicitly. "from a Facebook group" says the same thing, is instantly
// recognisable, and claims nothing.

/** What kind of place this is, in the words a visitor would use. */
export function sourceDescriptor(
  platformId: string | null | undefined,
  sourceType: string | null | undefined
): string {
  const type = sourceType ?? "";

  switch (platformId) {
    case "reddit":
      return type === "post" || type === "comment" || type === "discussion"
        ? "Reddit thread"
        : "subreddit";
    case "facebook":
      if (type === "social_page") return "Facebook page";
      if (type === "post" || type === "comment") return "Facebook post";
      return "Facebook group";
    case "discord":
      return "Discord server";
    case "discourse":
    case "forum":
      if (type === "forum_section") return "forum section";
      if (type === "post" || type === "comment" || type === "discussion")
        return "forum thread";
      return "online forum";
    case "whatsapp":
      return "WhatsApp group";
    case "x":
      return type === "social_page" ? "profile on X" : "post on X";
    case "linkedin":
      return type === "group" ? "LinkedIn group" : "LinkedIn post";
    case "email":
      return "email";
    case "private_message":
      return "private message";
    default:
      if (type === "group") return "online group";
      if (type === "server") return "online server";
      if (type === "post" || type === "comment" || type === "discussion")
        return "online discussion";
      return "online community";
  }
}

/** "a"/"an" for the descriptors above — all of which are ordinary words. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

/**
 * The line printed directly under the topic: where this link came from.
 *
 * `named` is decided from relationshipStatus by the caller and never from the
 * query string. When it is false the community's own name never appears —
 * not on the page, not in the title, not in the image.
 */
export function sourceLine(
  descriptor: string,
  displayName: string,
  named: boolean
): string {
  const name = displayName.trim();
  return named && name
    ? `from ${name}, ${article(descriptor)} ${descriptor}`
    : `from ${article(descriptor)} ${descriptor}`;
}

/**
 * The short, prominent independence note for a community page — the one that
 * sits above the form rather than in the fine print.
 *
 * `resolveDisclaimer` below is still the full statement and still appears at the
 * foot of the page. This is the version somebody actually reads.
 */
export function independenceNote(
  status: RelationshipStatus | string,
  descriptor: string
): string {
  const where = `the ${descriptor} where you found this link`;

  switch (status) {
    case "partnered":
      return `The Operator works in partnership with the organisers of ${where}. It is still a separate service, not part of it.`;
    case "officially_supported":
      return `The Operator is an independent service. The organisers of ${where} support it as a calling option, but it is not part of it.`;
    case "organiser_verified":
    case "organiser_interested":
      return `The Operator is an independent service, being explored as a calling option by people in ${where}. It is not run by it or part of it.`;
    default:
      return `The Operator is an independent service. It is not run by, approved by or connected to ${where}.`;
  }
}

// ─── Early access tester programme ───────────────────────────────────────────
//
// Deliberately plain about what it is. Someone agreeing to test unfinished
// software should not have to infer that from marketing language.

export const TESTER_HEADLINE = "Want calls sooner?";

export const TESTER_EXPLANATION =
  "Join Early Access to help test The Operator app. You can take part in test calls without waiting for this group to become active.";

export const TESTER_CAVEAT =
  "It is an early version, so you may come across unfinished parts, and we may ask you for feedback. You can pause or leave at any time.";

export const TESTER_CONSENT_LABEL =
  "Yes, I'd like to join the early access tester programme.";

/**
 * Shown on the form itself, before submitting.
 *
 * Purely a heads-up. Early Access is an optional second step after joining, not
 * part of this submission — so this is deliberately a notice and not a
 * checkbox. Someone who wants calls sooner should know that exists before they
 * decide whether joining is worth it.
 */
export const TESTER_PREVIEW_HEADLINE = "Want to test The Operator app?";

export const TESTER_PREVIEW_BODY =
  "After joining the waitlist, you'll also have the option to get Early Access and help test The Operator app. You don't need to wait for this calling group to become active.";

/** Why signing in is required for the tester programme but not for interest. */
export const TESTER_LOGIN_REASON =
  "Testers are added to calling groups, so this part needs an account. Registering your interest above did not.";

// The organiser checkbox label and the default share text used to live here as
// standalone helpers. They are now built in lib/waitlist/presentation.ts along
// with everything else the page says, because both of them talked about a
// "shared interest" that only one of the three modes actually has.

// ─── Family hero image ───────────────────────────────────────────────────────
//
// The upload warning is worth being blunt about. A family photo on a waitlist
// page is not "shared with the family" — it is served from a public URL and
// copied into a link preview by every messaging app the link passes through.
// Someone choosing a picture of their children deserves to be told that before
// the file dialog, not in a tooltip afterwards.

export const HERO_IMAGE_WARNING_HEADLINE = "This image will be public";

export const HERO_IMAGE_WARNING_BODY =
  "Anyone with the link can see it — they do not need an account, and the link may be forwarded on. It is also copied into the link preview shown by WhatsApp, Facebook, Messages and anywhere else the link is pasted, and those previews can stay cached after the image is removed.";

export const HERO_IMAGE_WARNING_ADVICE =
  "Do not upload anything you would not put on a public web page. Photographs of children are best avoided.";

export const HERO_IMAGE_CONFIRM_LABEL =
  "I understand this image will be publicly visible to anyone with the link.";
