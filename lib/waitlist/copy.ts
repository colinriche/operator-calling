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
      return "The Operator is being explored as a separate calling option for people interested in this topic or group.";
    case "officially_supported":
      return "The organisers are supporting or exploring The Operator as a separate calling option.";
    case "partnered":
      return "The Operator is working in partnership with the organisers of this group.";
    case "unverified":
    case "independent_interest":
    case "organiser_contacted":
    default:
      return "The Operator is a separate service. This reference does not mean that the website, group or its organisers have approved or partnered with The Operator.";
  }
}

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
