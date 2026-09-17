import { describe, expect, it } from "vitest";
import { csvCell, demandSourcesToCsv, toCsv } from "@/lib/waitlist/csv";
import { demandSourcePresentation } from "@/lib/waitlist/presentation";
import {
  blockingDuplicates,
  findSimilarDemandSources,
} from "@/lib/waitlist/duplicate-sources";
import type { DemandSourceRow } from "@/lib/waitlist/types";

// No Firestore here, per this project's testing rule — the duplicate scan takes
// its collection through the db argument, so a stub holding plain objects
// exercises the real scoring code without reaching a database.

function stubDb(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  const snap = {
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  };
  return {
    collection: () => ({ limit: () => ({ get: async () => snap }) }),
  } as never;
}

function source(over: Partial<DemandSourceRow> = {}): DemandSourceRow {
  return {
    id: "src1",
    platformId: "reddit",
    sourceName: "r/phonecalls",
    sourceType: "subreddit",
    topicName: "",
    includeTopicInUrl: false,
    sourceUrl: "",
    publicDisplayName: "",
    publicAudienceLabel: "",
    publicDescription: "",
    waitlistMode: "community",
    connectionType: "shared_interest",
    topicArtId: "",
    familyName: "",
    heroImageUrl: null,
    heroImagePath: null,
    heroImageUploadedAt: null,
    heroImageUploadedBy: null,
    imageChoice: "",
    imageChoiceUrl: null,
    socialImages: {},
    socialImageUrls: {},
    wording: null,
    wordingTemplateLabel: null,
    internalNotes: "",
    postingRules: "",
    relationshipStatus: "unverified",
    status: "active_waitlist",
    statusBeforeArchive: null,
    groupId: null,
    demandThreshold: null,
    effectiveThreshold: 20,
    totalVisitCount: 0,
    uniqueVisitCount: 0,
    signupCount: 0,
    uniqueRegistrationCount: 0,
    organiserInterestCount: 0,
    testerCount: 0,
    activeMemberCount: 0,
    pendingMemberCount: 0,
    reviewRequiredAfterCreate: false,
    autoCreatedGroupAt: null,
    callsEnabled: false,
    callsPausedReason: null,
    lastPostedAt: null,
    outreachCount: 0,
    shareClickCount: 0,
    conversionRate: 0,
    thresholdReachedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: null,
    createdBy: null,
    updatedAt: null,
    links: [],
    ...over,
  };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

describe("csvCell", () => {
  it("survives the things admins actually type", () => {
    expect(csvCell('He said "no"')).toBe('"He said ""no"""');
    expect(csvCell("one, two")).toBe('"one, two"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    // Absent is written as a bare empty field, not a quoted empty string.
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    // Zero is a value, and must not be mistaken for absent.
    expect(csvCell(0)).toBe('"0"');
  });

  // A note beginning with `=` or `-` is a formula to Sheets, not text. This is
  // the whole reason csvCell is not just a quote-and-escape.
  it("neutralises anything a spreadsheet would run as a formula", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe(`"'=SUM(A1:A9)"`);
    expect(csvCell("-- do not contact")).toBe(`"'-- do not contact"`);
    expect(csvCell("+44 7700 900000")).toBe(`"'+44 7700 900000"`);
    expect(csvCell("@organiser")).toBe(`"'@organiser"`);
    // Ordinary text is left exactly alone.
    expect(csvCell("r/phonecalls")).toBe('"r/phonecalls"');
  });
});

describe("toCsv", () => {
  it("uses CRLF, because Excel still wants it", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe('"a","b"\r\n"c","d"');
  });
});

describe("demandSourcesToCsv", () => {
  it("leads with the database id, so a row is always traceable to a record", () => {
    const csv = demandSourcesToCsv([source({ id: "abc123" })]);
    const [header, first] = csv.split("\r\n");
    expect(header.startsWith('"ID","Source name"')).toBe(true);
    expect(first.startsWith('"abc123","r/phonecalls"')).toBe(true);
  });

  it("writes one row per source and nothing else", () => {
    const csv = demandSourcesToCsv([source({ id: "a" }), source({ id: "b" })]);
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  // Blank means "no override, use the default". Zero would mean "no
  // registrations needed", which is a different and wrong claim.
  it("leaves an absent threshold override blank rather than zero", () => {
    const withNone = demandSourcesToCsv([source({ demandThreshold: null })]);
    const withOne = demandSourcesToCsv([source({ demandThreshold: 35 })]);
    expect(withNone).toContain('"","20"');
    expect(withOne).toContain('"35","20"');
  });
});

// ─── Duplicate detection ─────────────────────────────────────────────────────

const existing = [
  {
    id: "existing1",
    data: {
      sourceName: "r/phonecalls",
      sourceUrl: "https://www.reddit.com/r/phonecalls/",
      topicName: "phone calls",
      status: "active_waitlist",
      platformId: "reddit",
      uniqueRegistrationCount: 12,
    },
  },
  {
    id: "existing2",
    data: {
      sourceName: "Yorkshire Terrier Owners",
      sourceUrl: "https://facebook.com/groups/yorkies",
      topicName: "dogs",
      status: "archived",
      platformId: "facebook",
    },
  },
];

describe("findSimilarDemandSources", () => {
  it("treats the same thread reached differently as the same place", async () => {
    const matches = await findSimilarDemandSources(stubDb(existing), {
      sourceName: "Phone calls subreddit",
      topicName: "",
      audienceLabel: "",
      // Different case, no www, a trailing slash and tracking noise.
      sourceUrl: "http://REDDIT.com/r/phonecalls?utm_source=share",
    });
    expect(matches[0].id).toBe("existing1");
    expect(matches[0].exactUrl).toBe(true);
    expect(matches[0].score).toBe(1);
    expect(blockingDuplicates(matches)).toHaveLength(1);
  });

  it("catches a renamed source by its name and topic alone", async () => {
    const matches = await findSimilarDemandSources(stubDb(existing), {
      sourceName: "Yorkshire Terrier Owners UK",
      topicName: "dogs",
      audienceLabel: "",
      sourceUrl: "",
    });
    expect(matches[0].id).toBe("existing2");
    expect(matches[0].exactUrl).toBe(false);
    expect(blockingDuplicates(matches).length).toBeGreaterThan(0);
  });

  // Archiving a source and then adding it again is the likeliest route to two
  // records for one place, so an archived match has to still be reported.
  it("reports archived sources rather than hiding them", async () => {
    const matches = await findSimilarDemandSources(stubDb(existing), {
      sourceName: "Yorkshire Terrier Owners",
      topicName: "",
      audienceLabel: "",
      sourceUrl: "https://www.facebook.com/groups/yorkies",
    });
    expect(matches[0].status).toBe("archived");
    expect(matches[0].exactUrl).toBe(true);
  });

  it("never matches the row being edited against itself", async () => {
    const matches = await findSimilarDemandSources(stubDb(existing), {
      sourceName: "r/phonecalls",
      topicName: "phone calls",
      audienceLabel: "",
      sourceUrl: "https://reddit.com/r/phonecalls",
      excludeId: "existing1",
    });
    expect(matches.some((m) => m.id === "existing1")).toBe(false);
  });

  it("leaves genuinely unrelated sources alone", async () => {
    const matches = await findSimilarDemandSources(stubDb(existing), {
      sourceName: "Cornish sea swimming",
      topicName: "swimming",
      audienceLabel: "",
      sourceUrl: "https://example.com/swim",
    });
    expect(blockingDuplicates(matches)).toHaveLength(0);
  });

  it("has nothing to say about a source with no name and no URL", async () => {
    const matches = await findSimilarDemandSources(stubDb(existing), {
      sourceName: "",
      topicName: "",
      audienceLabel: "",
      sourceUrl: "",
    });
    expect(matches).toHaveLength(0);
  });
});

// ─── Which image a source actually shows ─────────────────────────────────────
//
// The spreadsheet's single image icon reads this rather than waitlistMode, so
// these cases are what decides whether it offers an upload, an artwork or
// nothing at all.

describe("demandSourcePresentation hero", () => {
  it("shows an uploaded image only on a family page", () => {
    const hero = demandSourcePresentation(
      source({ waitlistMode: "family", heroImageUrl: "https://example.com/a.jpg" })
    ).hero;
    expect(hero.kind).toBe("image");
    expect(hero.src).toBe("https://example.com/a.jpg");
  });

  it("falls back to the default image on a family page with no upload", () => {
    expect(
      demandSourcePresentation(source({ waitlistMode: "family" })).hero.kind
    ).toBe("builtin");
  });

  it("shows the chosen artwork on a community page", () => {
    const hero = demandSourcePresentation(
      source({ waitlistMode: "community", topicArtId: "cards" })
    ).hero;
    expect(hero.kind).toBe("art");
    expect(hero.src.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  // The case the icon exists to get right: a source that was once a family page
  // still carries heroImageUrl, and its community page deliberately ignores it.
  // An icon reading the field directly would offer to edit an invisible photo.
  it("ignores a leftover upload once the page is a community page", () => {
    expect(
      demandSourcePresentation(
        source({
          waitlistMode: "community",
          topicArtId: "",
          heroImageUrl: "https://example.com/old.jpg",
        })
      ).hero.kind
    ).toBe("builtin");
  });

  it("shows neither on a global page, whatever the record holds", () => {
    expect(
      demandSourcePresentation(
        source({
          waitlistMode: "global",
          topicArtId: "cards",
          heroImageUrl: "https://example.com/a.jpg",
        })
      ).hero.kind
    ).toBe("builtin");
  });
});
