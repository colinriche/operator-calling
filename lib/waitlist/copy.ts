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

// ─── Early access tester programme ───────────────────────────────────────────
//
// Deliberately plain about what it is. Someone agreeing to test unfinished
// software should not have to infer that from marketing language.

export const TESTER_HEADLINE = "Want calls sooner?";

export const TESTER_EXPLANATION =
  "Join early access as a tester and you can start having calls now, with people from across The Operator rather than only this group.";

export const TESTER_CAVEAT =
  "It is an early version, so you may come across unfinished parts, and we may ask you for feedback. You can pause or leave at any time.";

export const TESTER_CONSENT_LABEL =
  "Yes, I'd like to join the early access tester programme.";

/** Why signing in is required for the tester programme but not for interest. */
export const TESTER_LOGIN_REASON =
  "Testers are added to calling groups, so this part needs an account. Registering your interest above did not.";

/**
 * The organiser-interest checkbox label. Softer wording before a group exists,
 * since there is nothing yet to organise for.
 */
export function organiserCheckboxLabel(hasGroup: boolean): string {
  return hasGroup
    ? "I may be interested in helping organise or schedule calls for this group."
    : "I may be interested in helping organise or schedule calls around this interest.";
}

/** Default text pre-filled into share composers. */
export function defaultShareText(audienceLabel: string): string {
  return `This might interest people who like one-to-one voice calls around ${audienceLabel}. You make yourself available and The Operator arranges the call.`;
}
