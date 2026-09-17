import { describe, expect, it } from "vitest";
import {
  EMPTY_WAITLIST_DEFAULTS,
  parseImageChoice,
  sanitiseDefaults,
  sanitiseWording,
  wordingVariantFor,
  type WaitlistDefaults,
  type WaitlistWording,
} from "@/lib/waitlist/library";
import {
  BUILTIN_WORDING,
  buildWaitlistPresentation,
  globalContext,
  waitlistContextFrom,
  waitlistOgImageVersion,
  type PublicSourceFields,
} from "@/lib/waitlist/presentation";

// The image and wording library: what a page shows once an admin has chosen a
// picture, edited a default, or given a source wording of its own.

function contextFor(fields: PublicSourceFields, defaults?: WaitlistDefaults) {
  return waitlistContextFrom(
    fields,
    {
      sourceCode: "K7P4MX",
      demandSourceId: "src1",
      sourceLinkId: "link1",
      shareChannel: null,
      attributed: true,
    },
    defaults
  );
}

const WORDING: WaitlistWording = {
  heading: "Calling all {topic} players",
  lead: "Talk {topic} with someone new.",
  body: "The Operator rings you both.",
  bodyContinued: "",
  signoff: "",
  ogDescription: "Voice calls about {topic}.",
};

describe("parseImageChoice", () => {
  it("reads every kind of choice", () => {
    expect(parseImageChoice("default")).toEqual({ type: "default" });
    expect(parseImageChoice("own")).toEqual({ type: "own" });
    expect(parseImageChoice("brand")).toEqual({ type: "brand" });
    expect(parseImageChoice("builtin:operator-banner")).toEqual({
      type: "builtin",
      id: "operator-banner",
    });
    expect(parseImageChoice("art:cards")).toEqual({ type: "art", id: "cards" });
    expect(parseImageChoice("library:abc")).toEqual({ type: "library", id: "abc" });
  });

  it("rejects anything else", () => {
    for (const value of ["", "library:", "https://example.com/a.jpg", "x:y", 7, null]) {
      expect(parseImageChoice(value)).toBeNull();
    }
  });
});

describe("choosing a picture", () => {
  it("uses the built-in banner when nothing is chosen or stored", () => {
    const p = buildWaitlistPresentation(globalContext(null));
    expect(p.hero.kind).toBe("builtin");
    expect(p.hero.kind === "builtin" && p.hero.builtinId).toBe("operator-banner");
  });

  it("follows a changed default", () => {
    const defaults = { ...EMPTY_WAITLIST_DEFAULTS, imageChoice: "builtin:incoming-call" };
    const p = buildWaitlistPresentation(globalContext(null, defaults));
    expect(p.hero.kind === "builtin" && p.hero.builtinId).toBe("incoming-call");
  });

  it("uses a library image's copied URL", () => {
    const p = buildWaitlistPresentation(
      contextFor({
        waitlistMode: "community",
        topicName: "chess",
        imageChoice: "library:img1",
        imageChoiceUrl: "https://example.com/chess.jpg",
      })
    );
    expect(p.hero).toMatchObject({ kind: "image", src: "https://example.com/chess.jpg" });
  });

  it("lets an explicit default override a family's older photograph", () => {
    const fields = {
      waitlistMode: "family",
      familyName: "the Smiths",
      heroImageUrl: "https://example.com/smiths.jpg",
    };
    expect(buildWaitlistPresentation(contextFor(fields)).hero.kind).toBe("image");
    expect(
      buildWaitlistPresentation(contextFor({ ...fields, imageChoice: "default" })).hero.kind
    ).toBe("builtin");
  });

  it("never shows a family's own photograph once the page is not a family page", () => {
    const p = buildWaitlistPresentation(
      contextFor({
        waitlistMode: "community",
        imageChoice: "own",
        heroImageUrl: "https://example.com/smiths.jpg",
      })
    );
    expect(p.hero.kind).toBe("builtin");
  });

  it("changes the card's version when the picture changes", () => {
    const a = buildWaitlistPresentation(globalContext(null));
    const b = buildWaitlistPresentation(
      globalContext(null, { ...EMPTY_WAITLIST_DEFAULTS, imageChoice: "art:cards" })
    );
    expect(waitlistOgImageVersion(a)).not.toBe(waitlistOgImageVersion(b));
  });
});

describe("wording", () => {
  it("picks the variant from the page", () => {
    expect(wordingVariantFor("global", "shared_interest")).toBe("global");
    expect(wordingVariantFor("family", "shared_interest")).toBe("family");
    expect(wordingVariantFor("community", "shared_interest")).toBe("community_interest");
    expect(wordingVariantFor("community", "existing_connections")).toBe("community_known");
  });

  it("fills a source's own wording with its names", () => {
    const p = buildWaitlistPresentation(
      contextFor({ waitlistMode: "community", topicName: "chess", wording: WORDING })
    );
    expect(p.heading).toBe("Calling all chess players");
    expect(p.lead).toBe("Talk chess with someone new.");
    expect(p.og.description).toBe("Voice calls about chess.");
    expect(p.og.title.startsWith(p.heading)).toBe(true);
  });

  it("uses an edited default for every source without its own wording", () => {
    const defaults: WaitlistDefaults = {
      ...EMPTY_WAITLIST_DEFAULTS,
      wording: { community_interest: WORDING },
    };
    const p = buildWaitlistPresentation(
      contextFor({ waitlistMode: "community", topicName: "bridge" }, defaults)
    );
    expect(p.heading).toBe("Calling all bridge players");
  });

  it("leaves other variants on the built-in wording", () => {
    const defaults: WaitlistDefaults = {
      ...EMPTY_WAITLIST_DEFAULTS,
      wording: { community_interest: WORDING },
    };
    const p = buildWaitlistPresentation(globalContext(null, defaults));
    expect(p.heading).toBe(BUILTIN_WORDING.global.heading);
  });

  it("puts the family name into family wording, and drops empty family extras", () => {
    const p = buildWaitlistPresentation(
      contextFor({
        waitlistMode: "family",
        familyName: "the Okonkwo family",
        wording: { ...WORDING, heading: "{family}", lead: "Hello {family}." },
      })
    );
    expect(p.heading).toBe("The Okonkwo family");
    expect(p.lead).toBe("Hello the Okonkwo family.");
    expect(p.signoff).toBeNull();
    expect(p.bodyContinued).toBeNull();
  });

  it("does not print a bare placeholder when there is no topic", () => {
    const p = buildWaitlistPresentation(
      contextFor({ waitlistMode: "community", topicName: "", wording: WORDING })
    );
    expect(p.heading).not.toContain("{");
    expect(p.lead).toBe("Talk this interest with someone new.");
  });

  it("refuses wording with no heading or paragraphs", () => {
    expect(sanitiseWording({ ...WORDING, heading: "  " })).toBeNull();
    expect(sanitiseWording({ ...WORDING, lead: "" })).toBeNull();
    expect(sanitiseWording("nope")).toBeNull();
    expect(sanitiseWording({ ...WORDING, heading: " x " })?.heading).toBe("x");
  });

  it("discards malformed defaults rather than failing", () => {
    const d = sanitiseDefaults({
      imageChoice: "https://evil.example/x.jpg",
      wording: { global: { heading: "" }, family: WORDING, bogus: WORDING },
    });
    expect(d.imageChoice).toBe("");
    expect(Object.keys(d.wording)).toEqual(["family"]);
  });
});
