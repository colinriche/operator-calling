import { randomInt, createHash } from "crypto";

// ─── Tracked source codes ────────────────────────────────────────────────────
//
// A source code is an attribution identifier, not an authentication token —
// but it must still be unguessable, because sequential codes would let anyone
// enumerate every audience we are quietly testing and inflate their counters.
//
// Alphabet drops the characters people misread or mistype when copying a code
// out of a forum post: 0/O, 1/I/L, plus lowercase entirely.

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

/** Cryptographically random 6-character code. ~30 bits of entropy. */
export function generateSourceCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * Shape check only — says nothing about whether the code exists. Used to
 * reject junk before it reaches Firestore.
 */
export function isValidSourceCodeFormat(code: unknown): code is string {
  if (typeof code !== "string") return false;
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Normalise a code from a URL: trim and uppercase before lookup. */
export function normaliseSourceCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return isValidSourceCodeFormat(code) ? code : null;
}

// ─── Hashing ─────────────────────────────────────────────────────────────────
//
// Visitor IPs are hashed, never stored raw (§33 asks us to avoid collecting IP
// addresses). The hash is only used for unique-visit dedupe and rate limiting.
//
// Salt material comes from a server-only secret already present in the
// environment, so the hashes are not brute-forceable from the small IPv4 space
// by anyone who obtains the database. WAITLIST_HASH_SALT overrides it if you
// would rather set a dedicated value.

function salt(): string {
  return (
    process.env.WAITLIST_HASH_SALT ||
    process.env.FIREBASE_PRIVATE_KEY_STAGING ||
    process.env.FIREBASE_PRIVATE_KEY ||
    "operator-waitlist-fallback-salt"
  );
}

export function hashValue(value: string): string {
  return createHash("sha256").update(`${salt()}::${value}`).digest("hex");
}

/** Short hash for use inside deterministic document ids. */
export function shortHash(value: string): string {
  return hashValue(value).slice(0, 32);
}

/**
 * Best-effort client IP behind Vercel's proxy. Returns "unknown" rather than
 * throwing — a missing header should degrade rate limiting, not break signup.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Hashed visitor identifier — the only form an IP is ever persisted in. */
export function visitorHashFrom(headers: Headers): string {
  return shortHash(clientIpFrom(headers));
}

/** Lowercased, trimmed email used for duplicate detection. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
