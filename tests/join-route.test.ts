import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { buildTrackedUrl } from "../lib/waitlist/tracked-url";

const root = join(__dirname, "..");

describe("/join route", () => {
  it("is the page, and /waitlist no longer is", () => {
    expect(existsSync(join(root, "app/join/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app/waitlist/page.tsx"))).toBe(false);
  });

  it("has the manage and tester pages under /join, and none under /waitlist", () => {
    expect(existsSync(join(root, "app/join/manage/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app/join/tester/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app/waitlist"))).toBe(false);
  });

  it("builds new tracked links on /join", () => {
    expect(buildTrackedUrl("https://operatorcalling.com", "K7P4MX")).toBe(
      "https://operatorcalling.com/join?s=k7p4mx"
    );
  });
});

describe("/waitlist redirect", () => {
  it("is a single permanent redirect to /join, for the exact path only", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual([
      { source: "/waitlist", destination: "/join", permanent: true },
    ]);
  });

  // Next appends the incoming query string to a redirect destination unless the
  // destination names its own. A destination with a "?" would replace it.
  it("does not set its own query, so the s source parameter passes through", async () => {
    const [rule] = await nextConfig.redirects!();
    expect(rule.destination).not.toContain("?");
  });
});
