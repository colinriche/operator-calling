import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageSize } from "@/lib/waitlist/image-size";

// The card fits an uploaded picture by its proportions, so a wrong size here is
// a cropped or squashed card. Checked against real files shipped with the site.

const file = (path: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", path)));

describe("imageSize", () => {
  it("reads a JPEG", () => {
    expect(imageSize(file("og-default.jpg"))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(file("waitlist/incoming-call-hero.jpg"))).toEqual({ width: 1200, height: 900 });
  });

  it("reads a WebP", () => {
    const size = imageSize(file("waitlist/banner-hero.webp"));
    expect(size?.width).toBe(1200);
    // The banner is 1914×822 scaled to 1200 wide.
    expect(size?.height).toBeGreaterThanOrEqual(514);
    expect(size?.height).toBeLessThanOrEqual(516);
  });

  it("reads a PNG header", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 1914);
    new DataView(png.buffer).setUint32(20, 822);
    expect(imageSize(png)).toEqual({ width: 1914, height: 822 });
  });

  it("returns null for anything else", () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(imageSize(new Uint8Array(0))).toBeNull();
  });
});
