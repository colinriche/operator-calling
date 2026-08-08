// ─── Email normalisation ─────────────────────────────────────────────────────
//
// Two levels, deliberately:
//
//   normaliseEmail  — trim + lowercase. What we store and display.
//   canonicalEmail  — the identity used for duplicate detection.
//
// Canonicalisation is conservative. Over-merging is not a harmless error: two
// genuinely different people would collapse into one record and the second
// person's registration would be silently swallowed, undercounting real demand.
// So provider-specific rules are applied ONLY to providers whose behaviour is
// documented, and everything else is left alone.
//
// Gmail is the one worth handling: it ignores dots in the local part and treats
// everything after a `+` as a tag, so a single mailbox yields unlimited
// addresses. That matters more now that a threshold auto-creates a group and
// schedules a call rather than merely suggesting one to a human.

/** Providers known to ignore dots and honour `+` tags in the local part. */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Everything Gmail delivers to one inbox resolves to a gmail.com address. */
const GMAIL_CANONICAL_DOMAIN = "gmail.com";

function split(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/**
 * Storage form: trimmed and lowercased.
 *
 * The local part is lowercased even though RFC 5321 permits it to be
 * case-sensitive, because effectively no mail provider treats it that way and
 * doing otherwise would let `Colin@` and `colin@` register twice.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Identity form, used for duplicate detection and for counting unique
 * registrations towards a threshold. Never displayed — the address someone
 * typed is what we show them and what we would email.
 */
export function canonicalEmail(email: string): string {
  const normalised = normaliseEmail(email);
  const parts = split(normalised);
  if (!parts) return normalised;

  const { local, domain } = parts;

  if (GMAIL_DOMAINS.has(domain)) {
    // Strip the +tag, then dots. Order matters: a tag may itself contain dots
    // that must not survive into the canonical local part.
    const untagged = local.split("+")[0] ?? "";
    const undotted = untagged.replace(/\./g, "");
    // An address that is nothing but a tag is malformed; fall back rather than
    // canonicalising every such address to the same empty local part.
    if (!undotted) return normalised;
    return `${undotted}@${GMAIL_CANONICAL_DOMAIN}`;
  }

  // Any other provider: assume nothing. Plenty treat `+` and `.` as ordinary
  // characters, and merging on them would reject real people.
  return normalised;
}
