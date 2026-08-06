import type { Firestore } from "firebase-admin/firestore";

// ─── Firestore-backed rate limiting ──────────────────────────────────────────
//
// In-memory counters are useless on Vercel: each serverless invocation may get
// a fresh instance, so a limiter that lives in module scope resets constantly
// and an attacker just keeps hitting a cold lambda. Storing the window in
// Firestore costs a transaction per request but actually holds across
// instances.
//
// Buckets are fixed windows rather than sliding — cheaper, and precise enough
// for "stop someone scripting 10,000 fake signups".

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number;
  /** When the current window resets. */
  resetAt: Date;
}

export interface RateLimitOptions {
  /** Logical bucket name, e.g. "waitlist_register". */
  scope: string;
  /** Caller identity within the scope — already hashed if derived from an IP. */
  identifier: string;
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Consume one unit from a bucket. Fails open: if Firestore errors we allow the
 * request rather than taking the public form offline. Abuse protection is not
 * worth a hard outage on the signup path.
 */
export async function checkRateLimit(
  db: Firestore,
  collectionName: string,
  { scope, identifier, limit, windowSeconds }: RateLimitOptions
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = new Date(windowStart + windowMs);

  // Window start is part of the id, so an expired bucket is simply a different
  // document — no cleanup pass needed to expire old counters.
  const docId = `${scope}__${identifier}__${windowStart}`;
  const ref = db.collection(collectionName).doc(docId);

  try {
    const count = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0;
      const next = current + 1;
      if (next > limit) return next;

      tx.set(
        ref,
        {
          count: next,
          scope,
          windowStart: new Date(windowStart),
          expiresAt: resetAt,
        },
        { merge: true }
      );
      return next;
    });

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch (err) {
    console.error(`[rate-limit] ${scope} check failed, allowing request:`, err);
    return { allowed: true, remaining: limit, resetAt };
  }
}

/** Limits for the public waitlist endpoints, per hashed IP. */
export const WAITLIST_LIMITS = {
  register: { limit: 5, windowSeconds: 60 * 10 },
  visit: { limit: 60, windowSeconds: 60 * 10 },
  share: { limit: 30, windowSeconds: 60 * 10 },
} as const;
