// Pure helpers for "Continue with Apple". No Firebase imports, so they are
// unit-testable and safe to use anywhere.
//
// What is different about Apple, and why this file exists:
//
// 1. Hide My Email. A person can choose not to share their address; Apple then
//    gives us a private relay address (xxxx@privaterelay.appleid.com) that
//    forwards to them. It is a real, stable, per-person address, but it will
//    never equal the address they use elsewhere, so it must NOT be used to guess
//    that they already have an account. Identity is the Firebase uid (and the
//    `apple.com` provider id), never the email.
//
// 2. Name and email only arrive on the FIRST authorisation. On every later
//    sign-in Apple sends neither, so a missing name must never overwrite a stored
//    one, and a new account may legitimately have no name at all.
//
// 3. Mail sent to a relay address is only delivered if our sending domain is
//    registered with Apple (docs/apple-signin.md). The profile is flagged so that
//    sending code can tell.

export const APPLE_PROVIDER_ID = "apple.com";
export const PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com";

/** True for an Apple "Hide My Email" relay address. */
export function isPrivateRelayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  return at !== -1 && email.slice(at + 1).trim().toLowerCase() === PRIVATE_RELAY_DOMAIN;
}

export interface AppleIdentity {
  email: string | null;
  /** The address is Apple's relay, not the person's own. */
  isPrivateRelay: boolean;
  /** Empty when Apple did not send one (always, after the first sign-in). */
  name: string;
}

interface AppleUserLike {
  email?: string | null;
  displayName?: string | null;
}

/**
 * What we know about an Apple sign-in. `profile` is Firebase's
 * additionalUserInfo.profile, which carries Apple's own `is_private_email` claim
 * ("true" as a string or a boolean, depending on the SDK path).
 */
export function appleIdentity(
  user: AppleUserLike,
  profile?: Record<string, unknown> | null
): AppleIdentity {
  const claim = profile?.is_private_email;
  const claimedPrivate = claim === true || claim === "true";
  const email = user.email?.trim() ? user.email.trim() : null;
  return {
    email,
    isPrivateRelay: claimedPrivate || isPrivateRelayEmail(email),
    name: (user.displayName ?? "").trim(),
  };
}

/**
 * The email, if any, worth looking up an existing account by. A relay address
 * is never one: it cannot match an account made with the person's own address.
 */
export function emailForAccountMatching(identity: AppleIdentity): string | null {
  return identity.email && !identity.isPrivateRelay ? identity.email : null;
}

/** Profile fields for a brand new account made with Apple. */
export function appleProfileFields(identity: AppleIdentity): Record<string, unknown> {
  return {
    authProvider: APPLE_PROVIDER_ID,
    ...(identity.email ? { email: identity.email } : {}),
    ...(identity.isPrivateRelay ? { emailIsPrivateRelay: true } : {}),
    ...(identity.name ? { displayName: identity.name, name: identity.name } : {}),
  };
}

/**
 * The email to show a person for confirmation. Says plainly when it is Apple's
 * relay, so a relay address does not look like a mistake.
 */
export function describeAppleEmail(identity: AppleIdentity): string {
  if (!identity.email) return "No email address shared";
  return identity.isPrivateRelay ? `${identity.email} (Apple private relay)` : identity.email;
}

/** Apple-specific sign-in failures, in plain words. Null means "use the generic message". */
export function appleErrorMessage(code: string, email?: string | null): string | null {
  switch (code) {
    case "auth/account-exists-with-different-credential":
      return email
        ? `An account for ${email} already exists with a different sign-in method, most likely Google. Sign in with that method instead.`
        : "An account with this email already exists with a different sign-in method, most likely Google. Sign in with that method instead.";
    case "auth/operation-not-allowed":
      return "Sign in with Apple isn't switched on for this site yet. Please use another sign-in method.";
    case "auth/popup-blocked":
      return "Your browser blocked the Apple sign-in window. Allow pop-ups for this site and try again.";
    case "auth/web-storage-unsupported":
      return "Your browser is blocking storage that sign-in needs. Allow cookies for this site and try again.";
    default:
      return null;
  }
}
