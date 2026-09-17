// ─── Pixel dimensions from an image's header ─────────────────────────────────
//
// For the social card, which has to know whether a picture is wider than its
// frame before it can decide how to fit it. Pure JavaScript and header-only: an
// image codec is what once took the card endpoint down (see og-card.tsx).

export interface ImageSize {
  width: number;
  height: number;
}

export function imageSize(bytes: Uint8Array): ImageSize | null {
  // PNG: IHDR is always the first chunk, width and height at bytes 16–23.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return valid(view.getUint32(16), view.getUint32(20));
  }

  // JPEG: walk the segments to the first start-of-frame marker.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // Padding and standalone markers carry no length.
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return valid(width, height);
      }
      if (length < 2) return null;
      offset += 2 + length;
    }
    return null;
  }

  // WebP: RIFF container, three encodings.
  if (
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X") {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return valid(width, height);
    }
    if (chunk === "VP8 ") {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      return valid(width, height);
    }
    if (chunk === "VP8L") {
      const b = bytes.slice(21, 25);
      const width = 1 + (b[0] | ((b[1] & 0x3f) << 8));
      const height = 1 + (((b[1] >> 6) | (b[2] << 2) | ((b[3] & 0x0f) << 10)) & 0x3fff);
      return valid(width, height);
    }
  }

  return null;
}

function valid(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}
