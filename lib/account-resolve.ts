// Pure rules for matching a verified phone sign-in to an existing Operator
// profile. No Firebase imports, so they are unit-testable.
//
// Only possession proved through Firebase Phone Auth (the `phone_number` claim
// in a verified ID token) is evidence of ownership. The number stored on a
// profile is just a field: the website used to let anyone type one onto their
// own profile unverified, and other writers may have done the same. So a stored
// number may only select a profile when it cannot be a stranger's claim.

export interface ProfileCandidate {
  id: string;
  data: Record<string, unknown>;
}

/** App-created profiles carry a systemName; web-created profiles never did. */
export function isAppProfile(data: Record<string, unknown>): boolean {
  return typeof data.systemName === "string" && data.systemName.trim() !== "";
}

/**
 * The one profile a verified phone number may be matched to by its stored
 * number, or null.
 *
 * - Web-created profiles (no systemName) are ignored: that is where an
 *   unverified, typed number could have been stored.
 * - More than one app profile with the same number is ambiguous. Guessing would
 *   silently attach someone to the wrong account, so nothing is matched.
 */
export function pickPhoneMatch(candidates: readonly ProfileCandidate[]): ProfileCandidate | null {
  const appProfiles = candidates.filter((c) => isAppProfile(c.data));
  return appProfiles.length === 1 ? appProfiles[0] : null;
}
