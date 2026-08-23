import { describe, expect, it } from "vitest";
import { FALLBACK_AUDIENCE_LABEL } from "@/lib/waitlist/constants";
import {
  buildWaitlistPresentation,
  globalContext,
  resolveWaitlistMode,
  waitlistContextFrom,
  waitlistOgImageUrl,
  type PublicSourceFields,
} from "@/lib/waitlist/presentation";

// The point of lib/waitlist/presentation.ts is that the page and its link
// preview cannot disagree, because there is only one description of the page.
// These tests are mostly about that invariant: whatever a mode changes, it has
// to change in both places at once.

function contextFor(fields: PublicSourceFields, attributed = true) {
  return waitlistContextFrom(fields, {
    sourceCode: "K7P4MX",
    demandSourceId: "src1",
    sourceLinkId: "link1",
    shareChannel: null,
    attributed,
  });
}

const COMMUNITY: PublicSourceFields = {
  waitlistMode: "community",
  platformId: "facebook",
  sourceType: "group",
  topicName: "live poker",
  publicAudienceLabel: "live poker",
  publicDisplayName: "Poker Players UK",
  relationshipStatus: "unverified",
  topicArtId: "cards",
};

describe("the page and its Open Graph tags", () => {
  it("describes the page with the page's own words, in every mode", () => {
    const modes: PublicSourceFields[] = [
      { waitlistMode: "global" },
      COMMUNITY,
      { waitlistMode: "family", familyName: "the Okonkwo family" },
    ];

    for (const fields of modes) {
      const p = buildWaitlistPresentation(contextFor(fields));

      // The description is the opening paragraph verbatim, not a summary of it.
      expect(p.og.description).toBe(p.lead);
      // The title is the heading, optionally with the source line the page
      // prints directly above it — never anything invented for the preview.
      expect(p.og.title.startsWith(p.heading)).toBe(true);
      if (p.og.title !== p.heading) {
        expect(p.og.title).toBe(`${p.heading} — ${p.eyebrow}`);
      }
    }
  });
});

describe("global mode", () => {
  const p = buildWaitlistPresentation(globalContext(null));

  it("says nothing about a shared interest", () => {
    const everything = [
      p.heading,
      p.lead,
      p.body,
      p.formIntro,
      p.formFootnote,
      p.successNote,
      p.organiserLabel,
      p.shareText,
      p.og.title,
      p.og.description,
      p.disclaimer,
    ].join(" ");

    expect(everything).not.toContain(FALLBACK_AUDIENCE_LABEL);
    expect(everything.toLowerCase()).not.toContain("shared interest");
    expect(everything.toLowerCase()).not.toContain("this interest");
  });

  it("names no source, because there isn't one", () => {
    expect(p.eyebrow).toBeNull();
    expect(p.independenceNote).toBeNull();
    expect(p.hero.kind).toBe("brand");
  });

  it("does not carry the relationship disclaimer about a link nobody followed", () => {
    expect(p.disclaimer).not.toContain("where you found this link");
  });
});

describe("community mode", () => {
  it("leads with the topic and the source, and carries an independence note", () => {
    const p = buildWaitlistPresentation(contextFor(COMMUNITY));

    expect(p.heading).toBe("Live poker");
    expect(p.eyebrow).toBe("from a Facebook group");
    expect(p.independenceNote).toContain("independent");
    expect(p.hero.kind).toBe("art");
  });

  it("describes the source in plain words rather than a brand name", () => {
    const cases: Array<[string, string, string]> = [
      ["reddit", "subreddit", "from a subreddit"],
      ["discord", "server", "from a Discord server"],
      ["forum", "forum", "from an online forum"],
      ["whatsapp", "group", "from a WhatsApp group"],
      ["x", "post", "from a post on X"],
    ];

    for (const [platformId, sourceType, expected] of cases) {
      const p = buildWaitlistPresentation(
        contextFor({ ...COMMUNITY, platformId, sourceType })
      );
      expect(p.eyebrow).toBe(expected);
    }
  });

  it("falls back to a real heading when the source has no topic", () => {
    const p = buildWaitlistPresentation(
      contextFor({ ...COMMUNITY, topicName: "", publicAudienceLabel: "" })
    );

    // The neutral audience-label fallback is a form-sentence fragment. Printed
    // as a 36px heading it reads as a placeholder somebody forgot to fill in.
    expect(p.heading).not.toBe(FALLBACK_AUDIENCE_LABEL);
    expect(p.heading.length).toBeGreaterThan(0);
    expect(p.og.title).toContain(p.heading);
  });
});

// Whether a real community may be named is decided once, from its recorded
// relationship status. A page that may not name it must not name it in the
// title or the preview image either — which is only guaranteed because all
// three are built from this one object.
describe("naming the community", () => {
  const named = ["organiser_verified", "officially_supported", "partnered"];
  const unnamed = [
    "unverified",
    "independent_interest",
    "organiser_contacted",
    "organiser_interested",
    "something_new_nobody_added_here",
  ];

  it("names it only where the relationship supports it", () => {
    for (const relationshipStatus of named) {
      const p = buildWaitlistPresentation(
        contextFor({ ...COMMUNITY, relationshipStatus })
      );
      expect(p.eyebrow).toBe("from Poker Players UK, a Facebook group");
      expect(p.og.title).toContain("Poker Players UK");
    }
  });

  it("never leaks the name anywhere else when it may not be named", () => {
    for (const relationshipStatus of unnamed) {
      const p = buildWaitlistPresentation(
        contextFor({ ...COMMUNITY, relationshipStatus })
      );

      const everything = [
        p.eyebrow,
        p.heading,
        p.lead,
        p.body,
        p.formIntro,
        p.formFootnote,
        p.successNote,
        p.shareText,
        p.independenceNote,
        p.disclaimer,
        p.og.title,
        p.og.description,
      ].join(" ");

      expect(everything).not.toContain("Poker Players UK");
    }
  });
});

describe("family mode", () => {
  const fields: PublicSourceFields = {
    waitlistMode: "family",
    familyName: "the Okonkwo family",
    heroImageUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=t",
  };

  it("leads with the family name and the uploaded image", () => {
    const p = buildWaitlistPresentation(contextFor(fields));

    expect(p.heading).toBe("The Okonkwo family");
    expect(p.og.title).toBe("The Okonkwo family");
    expect(p.hero).toMatchObject({ kind: "image", src: fields.heroImageUrl });
    expect(p.lead).toContain("the Okonkwo family");
  });

  it("renders without an image, and without a hole where one would be", () => {
    const p = buildWaitlistPresentation(
      contextFor({ ...fields, heroImageUrl: "" })
    );
    expect(p.hero.kind).toBe("brand");
    expect(p.hero.src.length).toBeGreaterThan(0);
  });

  it("does not show an image left behind by a source that changed mode", () => {
    const p = buildWaitlistPresentation(
      contextFor({ ...COMMUNITY, heroImageUrl: fields.heroImageUrl })
    );
    expect(p.hero.kind).not.toBe("image");
  });

  it("says nothing about a group or discussion the visitor never came from", () => {
    const p = buildWaitlistPresentation(contextFor(fields));
    expect(p.independenceNote).toBeNull();
    expect(p.disclaimer).not.toContain("where you found this link");
  });
});

// Sources created before modes existed have no `waitlistMode` at all. They must
// keep rendering the page they have always rendered.
describe("mode resolution", () => {
  it("keeps existing sources on the page they already had", () => {
    expect(resolveWaitlistMode(undefined, true)).toBe("community");
    expect(resolveWaitlistMode(undefined, false)).toBe("global");
    expect(resolveWaitlistMode("", true)).toBe("community");
    expect(resolveWaitlistMode("nonsense", true)).toBe("community");
  });

  it("honours a mode that was actually chosen", () => {
    expect(resolveWaitlistMode("family", true)).toBe("family");
    expect(resolveWaitlistMode("global", true)).toBe("global");
    expect(resolveWaitlistMode(" community ", false)).toBe("community");
  });
});

// Two audiences, two arguments. Describing a group of former colleagues as
// "others who share an interest" describes something they did not sign up for,
// and describing strangers as people you already know is a false promise —
// so neither vocabulary may leak into the other's page.
describe("connection type", () => {
  const KNOWN: PublicSourceFields = {
    ...COMMUNITY,
    connectionType: "existing_connections",
    topicName: "St Mary's class of 1998",
  };

  it("sells keeping a connection alive, not meeting people", () => {
    const p = buildWaitlistPresentation(contextFor(KNOWN));

    expect(p.lead).toContain("Keep in contact with St Mary's class of 1998");
    expect(p.lead).toContain("let The Operator decide when it's time to talk");
    expect(p.body).toContain("When the everyday reasons for calling disappear");
    expect(p.body).toContain(
      "privacy settings that let you choose who you don't want to be connected with"
    );
    expect(p.body).toContain(
      "rather than letting them dwindle into messages and social-media reactions"
    );

    const everything = [p.lead, p.body, p.formIntro, p.successNote, p.shareText].join(" ");
    expect(everything).not.toContain("share an interest");
    expect(everything).not.toContain("search for people");
  });

  // The Operator decides when it is time. Wording that hands the visitor the
  // diary, or that reads like a standing appointment, turns an occasional and
  // welcome thing into an obligation — so these phrasings are barred outright
  // rather than left to whoever edits the copy next.
  it("never makes an existing-connections page sound like an appointment", () => {
    for (const fields of [
      KNOWN,
      { ...KNOWN, topicName: "" },
      { waitlistMode: "family", familyName: "the Okonkwo family" },
    ]) {
      const p = buildWaitlistPresentation(contextFor(fields));
      const everything = [
        p.lead,
        p.body,
        p.formIntro,
        p.formFootnote,
        p.successNote,
        p.shareText,
        p.organiserLabel,
        ...p.bullets.map((b) => b.text),
      ]
        .join(" ")
        .toLowerCase();

      for (const banned of [
        "arrange every call yourself",
        "remember to make the call",
        "people who already know each other",
        "schedule a call between you",
        "proper voice call",
        "when your availability overlaps",
        "appointment",
        "meeting",
      ]) {
        expect(everything).not.toContain(banned);
      }
    }
  });

  it("sells not having to find anyone to people who don't know each other", () => {
    const p = buildWaitlistPresentation(contextFor(COMMUNITY));

    expect(p.lead).toContain("share an interest in live poker");
    expect(p.body).toContain("You don't need to search for people");

    const everything = [p.lead, p.body, p.formIntro, p.successNote, p.shareText].join(" ");
    expect(everything).not.toContain("Keep in contact");
    expect(everything).not.toContain("already know each other");
    // The approved shared-interest wording is unchanged and must stay that way.
    expect(p.lead).toBe(
      "Enjoy voice calls with others who share an interest in live poker. Tell us when you're available, and The Operator will schedule a one-to-one call for you."
    );
  });

  it("treats a family as people who already know each other, whatever is stored", () => {
    const p = buildWaitlistPresentation(
      contextFor({
        waitlistMode: "family",
        familyName: "the Okonkwo family",
        // Wrong on the record, and it must not be able to make a family page
        // address a family as strangers with a shared interest.
        connectionType: "shared_interest",
      })
    );

    expect(p.connectionType).toBe("existing_connections");
    expect(p.lead).toContain("Keep in contact with the Okonkwo family");
    expect(p.lead).not.toContain("share an interest");
  });

  it("falls back to the weaker claim, never the stronger one", () => {
    for (const stored of [undefined, "", "nonsense", "friends"]) {
      const p = buildWaitlistPresentation(
        contextFor({ ...COMMUNITY, connectionType: stored })
      );
      expect(p.connectionType).toBe("shared_interest");
      expect(p.lead).not.toContain("Keep in contact");
    }
  });

  it("still mirrors the page in the preview for both types", () => {
    for (const fields of [COMMUNITY, KNOWN]) {
      const p = buildWaitlistPresentation(contextFor(fields));
      expect(p.og.description).toBe(p.lead);
    }
  });
});

// A second, additive interest. It must never be mistaken for the thing they
// actually came to register for.
describe("the family prompt", () => {
  it("is offered on pages that are not already about a family", () => {
    for (const fields of [
      COMMUNITY,
      { ...COMMUNITY, connectionType: "existing_connections" },
      { waitlistMode: "global" },
    ]) {
      const p = buildWaitlistPresentation(contextFor(fields));
      expect(p.familyPrompt).toBe(
        "Would you also like to use The Operator to keep your family connected?"
      );
    }
  });

  it("is not offered on a family page, which has already asked", () => {
    const p = buildWaitlistPresentation(
      contextFor({ waitlistMode: "family", familyName: "the Okonkwo family" })
    );
    expect(p.familyPrompt).toBeNull();
  });

  it("does not change what the registration is for", () => {
    const p = buildWaitlistPresentation(contextFor(COMMUNITY));
    // The prompt is an extra question on the page, not a redefinition of the
    // audience — the interest label still names the topic they arrived for.
    expect(p.interestLabel).toBe("live poker");
  });
});

describe("the preview image URL", () => {
  it("is absolute and carries the source code", () => {
    expect(waitlistOgImageUrl("https://operatorcalling.com", "K7P4MX")).toBe(
      "https://operatorcalling.com/api/og/waitlist?s=K7P4MX"
    );
    expect(waitlistOgImageUrl("https://operatorcalling.com/", null)).toBe(
      "https://operatorcalling.com/api/og/waitlist"
    );
  });
});
