// ─── The social card as a real file ──────────────────────────────────────────
//
// Server-only: reads and writes Storage through the Admin SDK.
//
// Facebook accepted the dynamically rendered card in its composer and then
// showed a blank attachment once the post was published. Measured against
// production, the endpoint had three problems that only the second fetch would
// ever hit:
//
//   Range request   200 OK with a Content-Range header and a 1024-byte body.
//                   A client that asks for a range and is answered 200 has been
//                   told it holds the entire entity — so it decodes a truncated
//                   PNG and renders nothing. The slicing happens at the CDN
//                   edge, above the handler, so no amount of code in the route
//                   can answer 206 instead.
//   HEAD            always a cache miss, and a full 2s render whose body is
//                   then thrown away.
//   cold GET        1.8-4.5s. Vercel's cache is per-PoP, so the composer warms
//                   one edge and the publish-time fetch, arriving from other
//                   infrastructure, pays the render again.
//
// The same three requests against a Firebase Storage object: 206 with
// Accept-Ranges, a real HEAD, and a CDN hit. So the card is rendered once and
// stored, and the page points Facebook at the file rather than at a renderer
// wearing a .png costume.
//
// Objects are keyed by the version token, which is derived from what the card
// is made of — so a source accumulates one file per genuine change, and the
// previous one is deleted on upload rather than left behind.

import { createHash } from "node:crypto";
import { getAdminBucket } from "@/lib/firebase-admin";

const PREFIX = "waitlist-og";

/** Sources are foldered by code; the global card has no code of its own. */
function folder(sourceCode: string | null): string {
  const code = (sourceCode ?? "").trim().toLowerCase();
  return `${PREFIX}/${/^[a-z0-9]{1,16}$/.test(code) ? code : "_global"}`;
}

export function waitlistCardPath(
  sourceCode: string | null,
  version: string,
  network: string | null = null
): string {
  const safe = /^[a-z0-9]{1,16}$/.test(version) ? version : "0";
  // A network's own card lives in its own subfolder, so storing one network's
  // new card only replaces that network's old one — see storeWaitlistCard.
  const sub = network && /^[a-z]{1,16}$/.test(network) ? `/${network}` : "";
  // .jpg: the card is stored as JPEG to stay under WhatsApp's size limit. The
  // extension also keeps these paths clear of the oversized .png cards that
  // came before, which are deleted as each source's new card is stored.
  return `${folder(sourceCode)}${sub}/${safe}.jpg`;
}

/**
 * The download token, derived rather than random.
 *
 * A Firebase download URL needs the token that was written into the object's
 * metadata. Generating a random one per upload would mean the page could not
 * name the URL without first reading the object back; deriving it from the path
 * lets generateMetadata build the address with no I/O at all, and still gives a
 * value nobody can guess from the outside.
 *
 * It is not a secret. The card is public by construction — it is the picture on
 * a link preview — and the token exists to make the object addressable without
 * touching the shared Storage ruleset, exactly as the hero-image route uses it.
 */
function tokenFor(path: string): string {
  return createHash("sha256").update(`waitlist-og:${path}`).digest("hex").slice(0, 32);
}

export function waitlistCardUrl(bucketName: string, path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${tokenFor(path)}`;
}

/** The public URL this source and version resolves to, without any I/O. */
export function waitlistCardUrlFor(
  bucketName: string,
  sourceCode: string | null,
  version: string
): string {
  return waitlistCardUrl(bucketName, waitlistCardPath(sourceCode, version));
}

export function cardBucketName(): string {
  return getAdminBucket().name;
}

/** Whether the card has been rendered and stored already. */
export async function waitlistCardExists(path: string): Promise<boolean> {
  try {
    const [exists] = await getAdminBucket().file(path).exists();
    return exists;
  } catch (err) {
    console.error("[og-store] exists check failed:", err);
    return false;
  }
}

/** The stored bytes, or null. Lets the route skip a render it has already done. */
export async function readWaitlistCard(path: string): Promise<Buffer | null> {
  try {
    const file = getAdminBucket().file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [bytes] = await file.download();
    return bytes;
  } catch (err) {
    console.error("[og-store] read failed:", err);
    return null;
  }
}

/**
 * Store a rendered card, and drop the versions it replaces.
 *
 * Failure is logged and swallowed: the caller already holds the bytes and can
 * serve them. Not being able to cache a card is a slow card, not a broken one.
 */
export async function storeWaitlistCard(
  path: string,
  bytes: Buffer
): Promise<boolean> {
  try {
    const bucket = getAdminBucket();
    await bucket.file(path).save(bytes, {
      contentType: "image/jpeg",
      metadata: {
        contentType: "image/jpeg",
        // A year: the path already carries the version, so these bytes can
        // never legitimately change. A new card is a new address.
        cacheControl: "public, max-age=31536000, immutable",
        metadata: { firebaseStorageDownloadTokens: tokenFor(path) },
      },
    });

    // Only the current version survives. Without this every edit to a family
    // name would leave another 1MB card behind for good.
    //
    // Only files directly in this folder: a prefix listing is recursive, and
    // the networks' own cards sit in subfolders beneath the page's card.
    // Deleting those would leave a network's preview pointing at nothing.
    const prefix = `${path.slice(0, path.lastIndexOf("/"))}/`;
    const [stale] = await bucket.getFiles({ prefix });
    await Promise.all(
      stale
        .filter((f) => f.name !== path && !f.name.slice(prefix.length).includes("/"))
        .map((f) => f.delete({ ignoreNotFound: true }).catch(() => undefined))
    );
    return true;
  } catch (err) {
    console.error("[og-store] store failed:", err);
    return false;
  }
}
