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
 * High enough that the 62px title in the band stays crisp; a photograph at
 * 1200×630 still lands at around a tenth of the limit.
 */
const QUALITY = 85;

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
  const encoded = jpeg.encode(
    { data: decoded.data, width: decoded.width, height: decoded.height },
    QUALITY
  );
  return Buffer.from(encoded.data);
}
