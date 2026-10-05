// Pure rules for phone-first sign-in and explicit Google/Apple linking. No
// Firebase imports, so they are unit-testable and safe anywhere.
//
// The model: a phone number is the identity of an Operator account. Google and
// Apple are only ever *additional* ways into an account that was first proved
// with a phone code, and they are attached to that same Firebase Auth UID with
// linkWithPopup. An email address is never evidence that two accounts belong to
// the same person.

export const PHONE_PROVIDER_ID = "phone";
export const GOOGLE_PROVIDER_ID = "google.com";
export const APPLE_PROVIDER_ID = "apple.com";

export type FederatedProviderId = typeof GOOGLE_PROVIDER_ID | typeof APPLE_PROVIDER_ID;

export function hasPhoneProvider(providerIds: readonly string[]): boolean {
  return providerIds.includes(PHONE_PROVIDER_ID);
}

export type FederatedSignInDecision =
  /** The phone is attached to this UID, so Google/Apple was linked on purpose. */
  | "allow_linked"
  /** An older website-only Google/Apple account with a profile. Kept working, not merged. */
  | "allow_legacy"
  /**
   * No phone and no profile: either Firebase just created this user, or an earlier
   * attempt did and its cleanup failed. Either way it is not an Operator account.
   */
  | "reject_unlinked";

/**
 * What to do after a Google/Apple popup succeeded.
 *
 * `isNewUser` comes from Firebase (getAdditionalUserInfo): true means this very
 * sign-in created the Auth user, i.e. nobody linked it to anything. That is
 * the case that would otherwise produce a second Operator account.
 *
 * `hasProfile` is whether /api/account/resolve found an Operator profile for
 * this user. Without it, a user left behind by a failed cleanup would look like
 * an old account on the next attempt and be let in.
 */
export function decideFederatedSignIn(input: {
  isNewUser: boolean;
  providerIds: readonly string[];
  hasProfile: boolean;
}): FederatedSignInDecision {
  if (hasPhoneProvider(input.providerIds)) return "allow_linked";
  if (input.isNewUser || !input.hasProfile) return "reject_unlinked";
  return "allow_legacy";
}

export const PHONE_FIRST_MESSAGE =
  "That Google or Apple account isn't linked to an Operator account yet. Sign in with your phone number first, " +
  "then link Google or Apple from your profile (Dashboard, Profile, Sign-in methods).";

/** Only an account already proved by phone may attach a federated provider. */
export function canLinkFederatedProvider(providerIds: readonly string[]): boolean {
  return hasPhoneProvider(providerIds);
}

/** Plain-words messages for linking failures. Null means "use the generic message". */
export function linkErrorMessage(code: string, providerLabel = "That account"): string | null {
  switch (code) {
    case "auth/credential-already-in-use":
    case "auth/email-already-in-use":
      return (
        `${providerLabel} is already used by a different Operator account, so it can't be linked here. ` +
        "Accounts are never merged automatically. Sign in with the method that account uses, or contact support."
      );
    case "auth/provider-already-linked":
      return `${providerLabel} is already linked to this account.`;
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Linking was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
    case "auth/requires-recent-login":
      return "For your security, sign in again with your phone number, then retry.";
    case "auth/operation-not-allowed":
      return `${providerLabel} sign-in isn't switched on for this site yet.`;
    default:
      return null;
  }
}

/** A user created this recently, with nothing attached, is safe to delete as a leftover. */
export const LEFTOVER_MAX_AGE_MS = 15 * 60 * 1000;

export function isRecentlyCreated(creationTime: string | undefined, now: number = Date.now()): boolean {
  const created = creationTime ? Date.parse(creationTime) : NaN;
  return Number.isFinite(created) && now - created >= 0 && now - created <= LEFTOVER_MAX_AGE_MS;
}
