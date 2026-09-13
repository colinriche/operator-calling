import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { isJpeg, pngToJpeg } from "@/lib/waitlist/card-encode";

/** A card-sized PNG with photograph-like variation, not flat colour. */
function photoLikePng(): Buffer {
  const png = new PNG({ width: 1200, height: 630 });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      const grain = Math.floor(Math.random() * 40);
      png.data[i] = (x * 255) / png.width + grain;
      png.data[i + 1] = (y * 255) / png.height + grain;
      png.data[i + 2] = 120 + grain;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

// WhatsApp drops a preview image over roughly 600KB, and satori only emits PNG.
describe("the social card encoding", () => {
  it("turns the rendered PNG into a JPEG of the same size", () => {
    const card = pngToJpeg(photoLikePng());

    expect(isJpeg(card)).toBe(true);
    const decoded = jpeg.decode(card);
    expect(decoded.width).toBe(1200);
    expect(decoded.height).toBe(630);
  });

  it("comes out far smaller than the PNG it replaces", () => {
    const png = photoLikePng();
    const card = pngToJpeg(png);

    expect(card.byteLength).toBeLessThan(png.byteLength / 2);
    expect(card.byteLength).toBeLessThan(600 * 1024);
  });

  it("does not mistake a PNG for a JPEG", () => {
    expect(isJpeg(photoLikePng())).toBe(false);
  });
});
