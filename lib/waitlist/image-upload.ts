import { randomUUID } from "node:crypto";
import { getAdminBucket } from "@/lib/firebase-admin";

// ─── Storing an uploaded waitlist image ──────────────────────────────────────
//
// Server-only. Shared by the family hero upload and the image library, so both
// check the bytes the same way and store them the same way.

export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The real type of the bytes, not the type the browser claimed.
 *
 * A declared content-type is caller-supplied. Storing whatever arrives under an
 * image/* label and then serving it from a public URL is how an "image upload"
 * quietly becomes file hosting.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Save bytes under `folder` with a random name and return the object path and
 * a public download URL.
 *
 * A random name per upload rather than a stable one: replacing an image must
 * produce a new URL, or every crawler that cached the old preview would keep
 * serving the picture that was taken down.
 */
export async function storePublicImage(
  folder: string,
  bytes: Uint8Array | Buffer,
  contentType: string
): Promise<{ path: string; url: string }> {
  const bucket = getAdminBucket();
  const path = `${folder}/${randomUUID()}.${IMAGE_EXTENSIONS[contentType]}`;
  const downloadToken = randomUUID();

  await bucket.file(path).save(Buffer.from(bytes), {
    contentType,
    metadata: {
      contentType,
      cacheControl: "public, max-age=3600",
      // The download token is what makes the object readable without a signed
      // request, and without touching the shared Storage ruleset.
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });

  return {
    path,
    url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`,
  };
}
