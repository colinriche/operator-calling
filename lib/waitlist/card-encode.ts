// ─── Getting the card under WhatsApp's limit ─────────────────────────────────
//
// WhatsApp silently drops a preview image over roughly 600KB. satori only emits
// PNG, and PNG is lossless, so a card built on an uploaded family photograph
// measured 659KB and 998KB in production — no picture on WhatsApp — while every
// illustrated card sat under 65KB.
//
// Re-encoded as JPEG here, in pure JavaScript. The previous attempt used sharp,
// whose native binary Turbopack externalised under a hashed name that did not
// exist, and every card request returned a 500. pngjs and jpeg-js have no
// platform binary to resolve, so there is nothing for the bundler to lose.

import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/**
 * Tried in order, first one that fits.
 *
 * 85 was chosen against a limit nothing was near: a real photograph at
 * 1200×630 measures 61KB at 85 and 82KB at 92, a tenth of what WhatsApp will
 * take, and the card's picture is the whole point of it. Measured against a
 * lossless render of the same card, 92 more than halves the error of 85.
 *
 * The lower steps exist for the pathological case rather than any real card —
 * an image of pure noise reaches 1.4MB at 92 — so the limit is enforced rather
 * than assumed. Encoding twice costs a fraction of a second, once, on the
 * render that stores the card.
 */
const QUALITY_STEPS = [92, 86, 80, 74] as const;

/** Comfortably inside the ~600KB above which WhatsApp shows no picture. */
const MAX_BYTES = 520 * 1024;

/** JPEG files open with FF D8 FF. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * The rendered PNG as a JPEG.
 *
 * The card is opaque by construction — every pixel sits on the cream or ink
 * ground — so dropping the alpha channel loses nothing.
 */
export function pngToJpeg(png: Buffer): Buffer {
  const decoded = PNG.sync.read(png);
  const raw = { data: decoded.data, width: decoded.width, height: decoded.height };

  let encoded = Buffer.from(jpeg.encode(raw, QUALITY_STEPS[0]).data);
  for (const quality of QUALITY_STEPS.slice(1)) {
    if (encoded.byteLength <= MAX_BYTES) break;
    console.warn(
      `[card-encode] ${(encoded.byteLength / 1024).toFixed(0)}KB is over the limit; re-encoding at quality ${quality}`
    );
    encoded = Buffer.from(jpeg.encode(raw, quality).data);
  }
  return encoded;
}
