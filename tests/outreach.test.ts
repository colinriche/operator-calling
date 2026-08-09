import { describe, expect, it } from "vitest";
import {
  composeWithLink,
  findDiscouragedPhrases,
  normaliseDestinationUrl,
} from "@/lib/waitlist/outreach";

// The duplicate-destination warning is only as good as this normalisation. If
// two links to the same thread produce different keys, the warning silently
// never fires — which is worse than not having it, because it reads as checked.
describe("normaliseDestinationUrl", () => {
  it("treats the same thread as one destination regardless of noise", () => {
    const canonical = "reddit.com/r/phonecalls/comments/abc123/weekly_thread";
    for (const variant of [
      "https://reddit.com/r/phonecalls/comments/abc123/weekly_thread",
      "https://www.reddit.com/r/phonecalls/comments/abc123/weekly_thread/",
      "http://www.reddit.com/r/phonecalls/comments/abc123/weekly_thread?utm_source=share",
      "https://REDDIT.com/r/phonecalls/comments/abc123/weekly_thread#comment-1",
      "www.reddit.com/r/phonecalls/comments/abc123/weekly_thread",
      "  https://www.reddit.com/r/phonecalls/comments/abc123/weekly_thread  ",
    ]) {
      expect(normaliseDestinationUrl(variant)).toBe(canonical);
    }
  });

  it("keeps genuinely different destinations apart", () => {
    expect(normaliseDestinationUrl("https://reddit.com/r/a/comments/1")).not.toBe(
      normaliseDestinationUrl("https://reddit.com/r/a/comments/2")
    );
  });

  it("survives input that is not a valid URL", () => {
    expect(normaliseDestinationUrl("not a url")).toBe("not a url");
    expect(normaliseDestinationUrl("")).toBe("");
  });
});

// Appending the link twice is the specific failure the spec calls out.
describe("composeWithLink", () => {
  const link = "https://operatorcalling.com/waitlist?s=K7P4MX";

  it("appends the link when it is absent", () => {
    expect(composeWithLink("Have a look at this.", link)).toBe(
      `Have a look at this.\n\n${link}`
    );
  });

  it("does not append when the writer already pasted it", () => {
    const text = `Have a look: ${link}`;
    expect(composeWithLink(text, link)).toBe(text);
  });

  it("does not append when it was pasted without the protocol", () => {
    const text = "Have a look: operatorcalling.com/waitlist?s=K7P4MX";
    expect(composeWithLink(text, link)).toBe(text);
  });

  it("returns just the link when there is no text", () => {
    expect(composeWithLink("   ", link)).toBe(link);
  });
});

describe("findDiscouragedPhrases", () => {
  it("flags marketing wording regardless of case", () => {
    expect(
      findDiscouragedPhrases("We Are Excited To Announce our revolutionary app")
    ).toEqual(expect.arrayContaining(["we are excited to announce", "revolutionary"]));
  });

  it("leaves ordinary wording alone", () => {
    expect(
      findDiscouragedPhrases(
        "This might be useful for people who prefer actually talking."
      )
    ).toEqual([]);
  });
});
