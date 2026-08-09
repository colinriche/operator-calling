import type {
  DemandStatus,
  LinkStatus,
  RelationshipStatus,
  ShareChannel,
  SourceType,
  TesterStatus,
  TimezoneSource,
} from "./constants";

// ─── Wire shapes ─────────────────────────────────────────────────────────────
//
// Plain, serialisable versions of the Firestore documents — dates as ISO
// strings — shared between the API routes and the admin panel.

export interface DemandSourceRow {
  id: string;
  platformId: string;
  sourceName: string;
  sourceType: SourceType | string;
  topicName: string;
  sourceUrl: string;
  publicDisplayName: string;
  publicAudienceLabel: string;
  publicDescription: string;
  internalNotes: string;
  postingRules: string;
  relationshipStatus: RelationshipStatus | string;
  status: DemandStatus | string;
  groupId: string | null;
  /** Per-source override; null means "use the global default". */
  demandThreshold: number | null;
  /** Threshold actually in force, after applying the global default. */
  effectiveThreshold: number;
  totalVisitCount: number;
  uniqueVisitCount: number;
  signupCount: number;
  /**
   * Registrations that actually exist, counted from documents rather than the
   * incrementing counter. This is what the threshold is judged on.
   */
  uniqueRegistrationCount: number;
  organiserInterestCount: number;
  /** Registrations from this source who also joined the tester programme. */
  testerCount: number;
  /** Registrants who have an account and are in the group. */
  activeMemberCount: number;
  /** Registrants with no account yet, admitted automatically when they sign up. */
  pendingMemberCount: number;
  /** Set when the group was created automatically and still wants a look. */
  reviewRequiredAfterCreate: boolean;
  autoCreatedGroupAt: string | null;
  /** Whether the linked group is currently running its scheduled calls. */
  callsEnabled: boolean;
  /** Why calls are off, when they are. */
  callsPausedReason: string | null;
  shareClickCount: number;
  /** Unique visits → signups, 0 when there are no visits yet. */
  conversionRate: number;
  thresholdReachedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
  /** Tracked links pointing at this source. */
  links: SourceLinkRow[];
}

export interface SourceLinkRow {
  id: string;
  sourceCode: string;
  platformId: string;
  demandSourceId: string;
  outreachId: string | null;
  groupId: string | null;
  formType: string;
  status: LinkStatus | string;
  label: string;
  trackedUrl: string;
  createdAt: string | null;
  createdBy: string | null;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  totalVisitCount: number;
  uniqueVisitCount: number;
  signupCount: number;
  organiserInterestCount: number;
  shareClickCount: number;
}

// ─── Resolved public context ─────────────────────────────────────────────────
//
// What the waitlist page renders from. Every field is resolved on the server
// from the source code — nothing here is trusted from the browser.

export interface WaitlistContext {
  /** Null when the visitor arrived with no code, or an unusable one. */
  sourceCode: string | null;
  demandSourceId: string | null;
  sourceLinkId: string | null;
  platformId: string | null;
  groupId: string | null;
  /** Already falls back to neutral wording when the source has no label. */
  audienceLabel: string;
  disclaimer: string;
  relationshipStatus: RelationshipStatus | string;
  /** True when a real, live tracked source backs this page. */
  attributed: boolean;
  shareChannel: ShareChannel | null;
}

// ─── Registration ────────────────────────────────────────────────────────────

export interface RegistrationInput {
  email: string;
  displayName: string;
  interestedInOrganising: boolean;
  country: string;
  englishFirstLanguage: boolean;
  firstLanguage: string | null;
  sourceCode: string | null;
  shareChannel: string | null;
  landingPage: string;
  referrer: string;
  /** IANA zone, browser-detected or chosen by the user. */
  timezone: string;
  timezoneSource: TimezoneSource;
}

// Deliberately absent: any way to join the tester programme.
//
// Tester activation requires a verified account, so it cannot be expressed
// through an unauthenticated registration. It happens only via
// POST /api/waitlist/tester, which demands a Firebase ID token. Re-adding a
// field here would reopen the bypass — a scripted POST minting "active testers"
// who never authenticated and never consented.

export interface RegistrationResult {
  /** False when the email had already registered for this source. */
  created: boolean;
  /** True when a duplicate submission upgraded organiser interest. */
  organiserUpgraded: boolean;
  audienceLabel: string;
  interestedInOrganising: boolean;
  /** True when this registration carries interest in a specific community. */
  communityInterest: boolean;
  testerStatus: TesterStatus;
  /** Secret URL token so they can manage this registration without an account. */
  manageToken: string;
  timezone: string;
}
