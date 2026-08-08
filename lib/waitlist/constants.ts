// ─── Waitlist / demand-source constants ──────────────────────────────────────
//
// Shared by the public waitlist page, the public API routes and the super-admin
// outreach panel. Everything here is safe to import from client components —
// no credentials, no privileged copy.

// ─── Platforms ───────────────────────────────────────────────────────────────
// Kept as a constant rather than a Firestore collection: the list is fixed and
// a collection buys nothing until these become editable.

export const PLATFORMS = [
  { id: "reddit", label: "Reddit" },
  { id: "facebook", label: "Facebook" },
  { id: "discord", label: "Discord" },
  { id: "discourse", label: "Discourse" },
  { id: "forum", label: "Other forum" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "email", label: "Email" },
  { id: "private_message", label: "Private message" },
  { id: "other", label: "Other" },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as readonly string[];

export function platformLabel(id: string): string {
  return PLATFORMS.find((p) => p.id === id)?.label ?? "Other";
}

// ─── Source types ────────────────────────────────────────────────────────────

export const SOURCE_TYPES = [
  { id: "subreddit", label: "Subreddit" },
  { id: "forum", label: "Forum" },
  { id: "forum_section", label: "Forum section" },
  { id: "group", label: "Group" },
  { id: "server", label: "Server" },
  { id: "social_page", label: "Social page" },
  { id: "discussion", label: "Discussion" },
  { id: "post", label: "Post" },
  { id: "comment", label: "Comment thread" },
  { id: "private_message", label: "Private message" },
  { id: "topic", label: "Topic" },
  { id: "general_audience", label: "General audience" },
  { id: "other", label: "Other" },
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number]["id"];

export const SOURCE_TYPE_IDS = SOURCE_TYPES.map((s) => s.id) as readonly string[];

// ─── Relationship status ─────────────────────────────────────────────────────
//
// Only ever changed by an authorised user. Never inferred from traffic,
// registrations or anything the browser sends.

export const RELATIONSHIP_STATUSES = [
  { id: "unverified", label: "Unverified" },
  { id: "independent_interest", label: "Independent interest" },
  { id: "organiser_contacted", label: "Organiser contacted" },
  { id: "organiser_interested", label: "Organiser interested" },
  { id: "organiser_verified", label: "Organiser verified" },
  { id: "officially_supported", label: "Officially supported" },
  { id: "partnered", label: "Partnered" },
] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number]["id"];

export const RELATIONSHIP_STATUS_IDS = RELATIONSHIP_STATUSES.map(
  (r) => r.id
) as readonly string[];

export const DEFAULT_RELATIONSHIP_STATUS: RelationshipStatus = "unverified";

// ─── Demand source status ────────────────────────────────────────────────────

export const DEMAND_STATUSES = [
  { id: "researching", label: "Researching" },
  { id: "active_waitlist", label: "Active waitlist" },
  { id: "threshold_reached", label: "Threshold reached" },
  { id: "under_review", label: "Under review" },
  { id: "approved_for_group", label: "Approved for group" },
  { id: "group_created", label: "Group created" },
  { id: "linked_to_existing_group", label: "Linked to existing group" },
  { id: "paused", label: "Paused" },
  { id: "rejected", label: "Rejected" },
  { id: "archived", label: "Archived" },
  { id: "do_not_contact", label: "Do not contact" },
] as const;

export type DemandStatus = (typeof DEMAND_STATUSES)[number]["id"];

export const DEMAND_STATUS_IDS = DEMAND_STATUSES.map((s) => s.id) as readonly string[];

/** Statuses where a tracked link should still show the audience-specific page. */
export const LIVE_DEMAND_STATUSES: readonly string[] = [
  "researching",
  "active_waitlist",
  "threshold_reached",
  "under_review",
  "approved_for_group",
  "group_created",
  "linked_to_existing_group",
];

// ─── Tracked link status ─────────────────────────────────────────────────────

export const LINK_STATUSES = ["active", "paused", "expired", "archived"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

// ─── Share channels ──────────────────────────────────────────────────────────

export const SHARE_CHANNELS = [
  "native",
  "facebook",
  "x",
  "reddit",
  "whatsapp",
  "linkedin",
  "email",
  "copy_link",
] as const;

export type ShareChannel = (typeof SHARE_CHANNELS)[number];

// ─── Early access tester programme ───────────────────────────────────────────
//
// Tracked entirely separately from community interest. Neither is inferred from
// the other, and leaving one never touches the other.

export const TESTER_STATUSES = [
  "none",
  "active",
  "paused",
  "left",
] as const;

export type TesterStatus = (typeof TESTER_STATUSES)[number];

/**
 * Bump whenever the tester consent wording changes materially. Stored with each
 * consent so it stays possible to say which version somebody actually agreed
 * to, rather than assuming it was the current one.
 */
export const TESTER_CONSENT_VERSION = "2026-08-08";

// ─── Community interest vs community membership ──────────────────────────────
//
// Three distinct things, deliberately not collapsed:
//
//   communityInterest        the historical fact that they registered, and the
//                            attribution that came with it. Never deleted.
//   communityInterestStatus  whether they still want to hear about this
//                            community.
//   groupMembership          their participation in the group, once one exists.
//
// Leaving a group is not withdrawing interest, and withdrawing interest does
// not erase the demand record their registration contributed to.

export const COMMUNITY_INTEREST_STATUSES = [
  "active",
  "paused",
  "withdrawn",
] as const;
export type CommunityInterestStatus =
  (typeof COMMUNITY_INTEREST_STATUSES)[number];

export const GROUP_MEMBERSHIP_STATUSES = [
  /** No group exists for this community yet. */
  "none",
  /** Group exists; they have no account, so they are admitted on sign-up. */
  "eligible",
  "member",
  /** Still a member, but not placed on calls. */
  "paused",
  /** Removed from the group. Attribution and demand record survive. */
  "left",
] as const;
export type GroupMembershipStatus =
  (typeof GROUP_MEMBERSHIP_STATUSES)[number];

/** Memberships that should be admitted or kept when a group activates. */
export const ADMITTABLE_MEMBERSHIPS: readonly string[] = [
  "none",
  "eligible",
  "member",
];

// ─── Time zone provenance ────────────────────────────────────────────────────

export const TIMEZONE_SOURCES = ["detected", "user_selected"] as const;
export type TimezoneSource = (typeof TIMEZONE_SOURCES)[number];

// ─── Demand threshold ────────────────────────────────────────────────────────

/**
 * Unique registrations a tracked community needs before its group is created.
 * Used when no global override exists in settings/waitlistDemand, and
 * overridable per source from the admin panel.
 */
export const DEFAULT_DEMAND_THRESHOLD = 20;

// ─── Public audience label ───────────────────────────────────────────────────

export const FALLBACK_AUDIENCE_LABEL = "people who share this interest";

// ─── Firestore collection names ──────────────────────────────────────────────

export const COLLECTIONS = {
  demandSources: "groupDemandSources",
  sourceLinks: "sourceLinks",
  waitlistEntries: "waitlistEntries",
  sourceVisits: "sourceVisits",
  shareEvents: "shareEvents",
  rateLimits: "rateLimits",
  settings: "settings",
} as const;

/** Doc id under `settings` holding the global threshold configuration. */
export const DEMAND_SETTINGS_DOC = "waitlistDemand";

/** demandSourceId used for registrations that arrived without a valid code. */
export const GENERAL_DEMAND_SOURCE_ID = "_general";
