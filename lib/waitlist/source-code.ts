import { randomInt, randomBytes, createHash } from "crypto";
import { adminCredentials } from "../firebase-env";

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

// ─── Manage tokens ───────────────────────────────────────────────────────────
//
// A bearer credential letting someone with no account manage their own
// registration — pause, leave, change time zone. Anyone holding it can act as
// that person, so it is long, random, and never placed in a URL we ask them to
// share.

/** 32 bytes of entropy, URL-safe. */
export function generateManageToken(): string {
  return randomBytes(32).toString("base64url");
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

// The private key is read through adminCredentials() so that a deployment using
// the environment-scoped FIREBASE_PRIVATE_KEY_{PROD,DEV} names still finds salt
// material — reading FIREBASE_PRIVATE_KEY directly would silently fall through
// to the shared constant and make every hash guessable.
function salt(): string {
  return (
    process.env.WAITLIST_HASH_SALT ||
    adminCredentials().privateKey ||
    "operator-waitlist-fallback-salt"
  );
}

export function hashValue(value: string): string {
  return createHash("sha256").update(`${salt()}::${value}`).digest("hex");
}

/** Short salted hash — visitor identity, rate-limit buckets. */
export function shortHash(value: string): string {
  return hashValue(value).slice(0, 32);
}

/**
 * Unsalted hash, for deterministic document ids only.
 *
 * Duplicate detection keys a waitlist entry on hash(email), so that id has to
 * stay identical forever: if the salt ever rotated, the same address would
 * resolve to a new document and re-register as fresh demand. Salting buys
 * nothing here anyway — the entry stores the plaintext email alongside it, so
 * anyone who can read the id can already read the address.
 */
export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
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

// Email normalisation lives in ./email — it needs provider-specific rules that
// have nothing to do with source codes or hashing.
