import type {
  ConnectionType,
  DemandStatus,
  LinkStatus,
  RelationshipStatus,
  ShareChannel,
  SourceType,
  TesterStatus,
  TimezoneSource,
  WaitlistMode,
} from "./constants";
import type {
  SocialImages,
  SocialImageUrls,
  WaitlistDefaults,
  WaitlistWording,
} from "./library";
import type { TopicArtId } from "./topic-art";

// ─── Wire shapes ─────────────────────────────────────────────────────────────
//
// Plain, serialisable versions of the Firestore documents - dates as ISO
// strings - shared between the API routes and the admin panel.

export interface DemandSourceRow {
  id: string;
  platformId: string;
  sourceName: string;
  sourceType: SourceType | string;
  topicName: string;
  /** Append the topic to this source's tracked URLs, purely for readability. */
  includeTopicInUrl: boolean;
  sourceUrl: string;
  publicDisplayName: string;
  publicAudienceLabel: string;
  /** Optional line above the heading, on the page and the card. Admin-written. */
  publicEyebrow: string;
  publicDescription: string;
  /** Which of the three waitlist pages this source's links render. */
  waitlistMode: WaitlistMode | string;
  /** Whether these people already know each other. Drives the page's wording. */
  connectionType: ConnectionType | string;
  /** Chosen from the curated set; "" means fall back to the brand mark. */
  topicArtId: string;
  /** Family mode only - the heading the page leads with. */
  familyName: string;
  /** Public download URL of the uploaded hero image, or null. */
  heroImageUrl: string | null;
  /** Storage object path, kept so a replacement can delete the old file. */
  heroImagePath: string | null;
  heroImageUploadedAt: string | null;
  heroImageUploadedBy: string | null;
  /** The chosen picture. See parseImageChoice in lib/waitlist/library.ts. */
  imageChoice: string;
  /** The library image's URL, when imageChoice is one. */
  imageChoiceUrl: string | null;
  /** Link-preview pictures for particular networks. Absent means the page's. */
  socialImages: SocialImages;
  socialImageUrls: SocialImageUrls;
  /** This source's own copy of the main wording; null follows the default. */
  wording: WaitlistWording | null;
  /** The template the wording was last copied from, for display only. */
  wordingTemplateLabel: string | null;
  internalNotes: string;
  postingRules: string;
  relationshipStatus: RelationshipStatus | string;
  status: DemandStatus | string;
  /**
   * What the status was before archiving, so unarchiving restores it rather
   * than guessing. Null for sources archived before this was recorded, and
   * cleared again once one is restored.
   */
  statusBeforeArchive: DemandStatus | string | null;
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
  /** Drives the "posted here recently" warning in the composer. */
  lastPostedAt: string | null;
  outreachCount: number;
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

/**
 * A demand source that looks like one being created or edited. Lives here
 * rather than beside the detection code because the panels that must render it
 * are client components, and lib/waitlist/duplicate-sources.ts reaches
 * firebase-admin.
 */
export interface SimilarSourceRow {
  id: string;
  sourceName: string;
  platformId: string;
  sourceType: string;
  sourceUrl: string;
  status: DemandStatus | string;
  topicName: string;
  uniqueRegistrationCount: number;
  /** 0-1. 1 means the URLs match and it is certainly the same place. */
  score: number;
  reason: string;
  /** Same normalised URL - evidence rather than resemblance. */
  exactUrl: boolean;
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
// from the source code - nothing here is trusted from the browser.

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

  // ─── What the page is ──────────────────────────────────────────────────────
  mode: WaitlistMode;
  connectionType: ConnectionType;
  sourceType: SourceType | string | null;
  /** The community's own name. Only ever *shown* when `canNameSource`. */
  publicDisplayName: string;
  /** The optional line above the heading, exactly as an admin typed it. */
  publicEyebrow: string;
  /**
   * Decided on the server from relationshipStatus, so a page and its Open Graph
   * tags cannot disagree about whether a community may be named.
   */
  canNameSource: boolean;
  topicName: string;
  /** Whether a shared link carries the readable topic slug. */
  includeTopicInUrl: boolean;
  topicArtId: string;
  familyName: string;
  heroImageUrl: string | null;
  imageChoice: string;
  imageChoiceUrl: string | null;
  socialImages: SocialImages;
  socialImageUrls: SocialImageUrls;
  /** The source's own wording, or null to follow the default. */
  wording: WaitlistWording | null;
  /** The defaults in force when this was resolved. */
  defaults: WaitlistDefaults;
}

// ─── Presentation ────────────────────────────────────────────────────────────
//
// The single source of truth for everything a visitor or a link-preview crawler
// sees. Built once per request from the context by
// lib/waitlist/presentation.ts; the page, the form, the share row and the Open
// Graph image all read this same object and nothing else.

export type WaitlistHero =
  | { kind: "brand"; src: string; alt: string }
  /** A picture shipped with the site. See builtin-images.ts. */
  | { kind: "builtin"; src: string; alt: string; builtinId: string }
  | { kind: "art"; src: string; alt: string }
  | { kind: "image"; src: string; alt: string };

export interface WaitlistPresentation {
  mode: WaitlistMode;
  connectionType: ConnectionType;
  /**
   * The optional "…and your family too?" question, offered alongside whatever
   * the page is actually about. Null where the page is already a family page
   * and the question would be asking something already answered.
   *
   * Deliberately additive: answering it records a second, separate interest and
   * never reinterprets the group or topic the visitor came here for.
   */
  familyPrompt: string | null;
  /** Small line above the heading. The source, in community mode. */
  eyebrow: string | null;
  heading: string;
  /** Opening paragraph, reused verbatim as the Open Graph description. */
  lead: string;
  /** Longer explanation shown only on the page. */
  body: string;
  /** Family pages only: the second half of `body`, after the sign-off line. */
  bodyContinued: string | null;
  tagline: string | null;
  /** Strapline between `body` and `bodyContinued`. Family pages only. */
  signoff: string | null;
  bullets: Array<{ id: "availability" | "incoming" | "privacy"; text: string }>;
  /** Shown prominently, above the form. Null where it would be meaningless. */
  independenceNote: string | null;
  /** The existing relationship-derived fine print, kept at the foot. */
  disclaimer: string;
  formHeading: string;
  formIntro: string;
  /** Fine print directly under the submit button. */
  formFootnote: string;
  successNote: string;
  organiserLabel: string;
  shareText: string;
  /** Subject line for an emailed share, and the native share sheet's title. */
  shareSubject: string;
  /** Readable slug appended to shared links, or "" when the source opted out. */
  shareSlug: string;
  /**
   * What this registration is an interest *in*, in a form that can be dropped
   * into a sentence. Also what the confirmation email says, so the email and
   * the page a person joined from describe the same thing.
   */
  interestLabel: string;
  hero: WaitlistHero;
  og: {
    title: string;
    /**
     * The title sent to Facebook's link fetcher only. Facebook prints it under
     * a card that already carries the page's name, so repeating the name there
     * said the same thing twice; this one says what The Operator is. WhatsApp
     * and the rest keep `title`. Not part of the card's version.
     */
    facebookTitle: string;
    description: string;
  };
}

// ─── Registration ────────────────────────────────────────────────────────────

export interface RegistrationInput {
  email: string;
  displayName: string;
  interestedInOrganising: boolean;
  /**
   * They also want The Operator for their own family. A second interest
   * recorded alongside this registration - it never changes which demand source
   * the registration is attributed to.
   */
  familyInterest: boolean;
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
// field here would reopen the bypass - a scripted POST minting "active testers"
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
