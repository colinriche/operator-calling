/**
 * Server-only helpers for the QR invite API routes.
 * Not imported by client components.
 */

/**
 * Given a raw token string (which may be a JWT), return the Firestore document
 * ID to use for the qr_tokens collection.
 *
 * The mobile app encodes a JWT whose payload contains `tokenId` — that UUID is
 * the actual Firestore doc key. If the token is not a JWT or has no tokenId,
 * fall back to using the raw token directly.
 */
export function resolveTokenDocId(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return token;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf-8")) as Record<string, unknown>;
    if (typeof payload.tokenId === "string" && payload.tokenId.length > 0) {
      return payload.tokenId;
    }
  } catch {
    // Not a valid JWT — use the token as-is
  }
  return token;
}

/**
 * Returns the JWT `exp` claim in milliseconds, or null if not a JWT / no exp.
 */
export function getJwtExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf-8")) as Record<string, unknown>;
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {
    // ignore
  }
  return null;
}
