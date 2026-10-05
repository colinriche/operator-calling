import { describe, expect, it } from "vitest";
import { BUILTIN_CARDS } from "@/lib/waitlist/builtin-card-data";
import { builtinImage, WHATSAPP_DEFAULT_IMAGE_CHOICE } from "@/lib/waitlist/builtin-images";
import {
  builtInNetworkImageChoice,
  EMPTY_WAITLIST_DEFAULTS,
  sanitiseDefaults,
  sanitiseSocialImages,
  socialNetworkFromUserAgent,
  suggestedNetworks,
} from "@/lib/waitlist/library";
import {
  buildWaitlistPresentation,
  cardNetwork,
  globalContext,
  waitlistContextFrom,
  waitlistOgImageUrl,
  waitlistOgImageVersion,
  type PublicSourceFields,
} from "@/lib/waitlist/presentation";

// A different link-preview picture per network: nothing set means the page's
// picture everywhere, and a network only changes once someone chooses for it.

function contextFor(fields: PublicSourceFields, defaults = EMPTY_WAITLIST_DEFAULTS) {
  return waitlistContextFrom(
    { waitlistMode: "community", topicName: "chess", ...fields },
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

describe("recognising a preview fetcher", () => {
  it.each([
    ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "facebook"],
    ["WhatsApp/2.23.20.0 A", "whatsapp"],
    ["Twitterbot/1.0", "x"],
    ["LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)", "linkedin"],
    ["Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)", "reddit"],
    ["Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "discord"],
    ["TelegramBot (like TwitterBot)", "telegram"],
    ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "slack"],
    // iMessage claims to be both; it is served Facebook's picture.
    ["Mozilla/5.0 (Macintosh) facebookexternalhit/1.1 Facebot Twitterbot/1.0", "facebook"],
  ])("%s", (agent, network) => {
    expect(socialNetworkFromUserAgent(agent)).toBe(network);
  });

  it("treats a browser as no network", () => {
    expect(
      socialNetworkFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")
    ).toBeNull();
  });
});

describe("per-network pictures", () => {
  // WhatsApp is the exception throughout this file: it has a picture of its
  // own before anybody chooses one. See "WhatsApp's own picture" below.
  it("uses the page's picture on every network until one is chosen", () => {
    const context = contextFor({ imageChoice: "art:cards" });
    const page = buildWaitlistPresentation(context);
    for (const network of ["facebook", "x", "reddit"] as const) {
      expect(buildWaitlistPresentation(context, network).hero.src).toBe(page.hero.src);
      expect(cardNetwork(context, network)).toBeNull();
    }
  });

  it("changes only the network that was given its own picture", () => {
    const context = contextFor({
      imageChoice: "art:cards",
      socialImages: { whatsapp: "builtin:incoming-call" },
    });
    const page = buildWaitlistPresentation(context);
    const whatsapp = buildWaitlistPresentation(context, "whatsapp");

    expect(whatsapp.hero.kind === "builtin" && whatsapp.hero.builtinId).toBe("incoming-call");
    expect(buildWaitlistPresentation(context, "facebook").hero.src).toBe(page.hero.src);
    expect(cardNetwork(context, "whatsapp")).toBe("whatsapp");
    expect(cardNetwork(context, "facebook")).toBeNull();
    // A different picture is a different card, so a different address.
    expect(waitlistOgImageVersion(whatsapp)).not.toBe(waitlistOgImageVersion(page));
  });

  it("never changes the page itself", () => {
    const context = contextFor({
      imageChoice: "art:cards",
      socialImages: { facebook: "builtin:incoming-call" },
    });
    expect(buildWaitlistPresentation(context).hero.kind).toBe("art");
  });

  it("uses a library image's copied URL for a network", () => {
    const context = contextFor({
      socialImages: { x: "library:img1" },
      socialImageUrls: { x: "https://example.com/x.jpg" },
    });
    expect(buildWaitlistPresentation(context, "x").hero.src).toBe("https://example.com/x.jpg");
  });

  it("applies the default's per-network picture to pages using the default", () => {
    const defaults = {
      ...EMPTY_WAITLIST_DEFAULTS,
      socialImages: { facebook: "builtin:incoming-call" },
    };
    const onDefault = globalContext(null, defaults);
    expect(cardNetwork(onDefault, "facebook")).toBe("facebook");

    // A page with its own picture keeps it on every network that has not been
    // given one of its own.
    const ownPicture = contextFor({ imageChoice: "art:cards" }, defaults);
    expect(cardNetwork(ownPicture, "facebook")).toBeNull();
  });

  it("ignores unknown networks and invalid choices", () => {
    expect(
      sanitiseSocialImages({
        whatsapp: "builtin:incoming-call",
        myspace: "builtin:incoming-call",
        x: "https://evil.example/a.jpg",
      })
    ).toEqual({ whatsapp: "builtin:incoming-call" });
  });

  it("does not let the defaults point a network at 'default' or a family photo", () => {
    expect(
      sanitiseDefaults({ socialImages: { x: "default", facebook: "own", reddit: "art:cards" } })
        .socialImages
    ).toEqual({ reddit: "art:cards" });
  });

  it("puts the network in the card URL only when it has its own card", () => {
    expect(waitlistOgImageUrl("https://operatorcalling.com", "K7P4MX", "abc", "whatsapp")).toBe(
      "https://operatorcalling.com/api/og/waitlist?s=k7p4mx&n=whatsapp&v=abc"
    );
    expect(waitlistOgImageUrl("https://operatorcalling.com", "K7P4MX", "abc", null)).toBe(
      "https://operatorcalling.com/api/og/waitlist?s=k7p4mx&v=abc"
    );
  });

  it("offers the source's own platform first", () => {
    expect(suggestedNetworks("reddit")).toEqual(["reddit", "whatsapp", "facebook"]);
    expect(suggestedNetworks("email")).toEqual(["whatsapp", "facebook"]);
  });
});

// ─── WhatsApp ────────────────────────────────────────────────────────────────
//
// The one network with a picture before anyone picks one: the call buttons,
// everywhere except a family page. See WHATSAPP_DEFAULT_IMAGE_CHOICE.

describe("WhatsApp's own picture", () => {
  function familyContext(fields: PublicSourceFields = {}) {
    return contextFor({
      waitlistMode: "family",
      familyName: "Okonjo",
      connectionType: "existing_connections",
      ...fields,
    });
  }

  it("replaces the page's picture on a community page", () => {
    const context = contextFor({ imageChoice: "art:cards" });
    const whatsapp = buildWaitlistPresentation(context, "whatsapp");

    expect(whatsapp.hero.kind === "builtin" && whatsapp.hero.builtinId).toBe("call-buttons");
    expect(cardNetwork(context, "whatsapp")).toBe("whatsapp");
    // The page, and every other network, are untouched.
    expect(buildWaitlistPresentation(context).hero.kind).toBe("art");
    expect(cardNetwork(context, "facebook")).toBeNull();
  });

  it("replaces the default picture on a global page", () => {
    const context = globalContext(null);
    const whatsapp = buildWaitlistPresentation(context, "whatsapp");

    expect(whatsapp.hero.kind === "builtin" && whatsapp.hero.builtinId).toBe("call-buttons");
    expect(cardNetwork(context, "whatsapp")).toBe("whatsapp");
  });

  it("leaves a family page alone", () => {
    const withPhoto = familyContext({ heroImageUrl: "https://example.com/okonjos.jpg" });
    expect(buildWaitlistPresentation(withPhoto, "whatsapp").hero.src).toBe(
      "https://example.com/okonjos.jpg"
    );
    expect(cardNetwork(withPhoto, "whatsapp")).toBeNull();

    // Including a family that has not uploaded one, which shows the default.
    const noPhoto = familyContext();
    const page = buildWaitlistPresentation(noPhoto);
    expect(buildWaitlistPresentation(noPhoto, "whatsapp").hero.src).toBe(page.hero.src);
    expect(cardNetwork(noPhoto, "whatsapp")).toBeNull();
  });

  it("gives way to a picture chosen for WhatsApp on the source", () => {
    const context = contextFor({
      imageChoice: "art:cards",
      socialImages: { whatsapp: "builtin:incoming-call" },
    });
    const whatsapp = buildWaitlistPresentation(context, "whatsapp");
    expect(whatsapp.hero.kind === "builtin" && whatsapp.hero.builtinId).toBe("incoming-call");
  });

  it("gives way to a WhatsApp picture on the site-wide defaults", () => {
    const context = contextFor(
      { imageChoice: "art:cards" },
      { ...EMPTY_WAITLIST_DEFAULTS, socialImages: { whatsapp: "builtin:incoming-call" } }
    );
    const whatsapp = buildWaitlistPresentation(context, "whatsapp");
    expect(whatsapp.hero.kind === "builtin" && whatsapp.hero.builtinId).toBe("incoming-call");
  });

  it("steps aside when WhatsApp is set to the default", () => {
    // "default" on a network means the default as it applies to that network,
    // and is the way to ask for the default rather than the built-in picture.
    const context = contextFor(
      { imageChoice: "art:cards", socialImages: { whatsapp: "default" } },
      { ...EMPTY_WAITLIST_DEFAULTS, imageChoice: "builtin:incoming-call" }
    );
    const whatsapp = buildWaitlistPresentation(context, "whatsapp");
    expect(whatsapp.hero.kind === "builtin" && whatsapp.hero.builtinId).toBe("incoming-call");
  });

  it("ships a card strip for the picture it points at", () => {
    const choice = builtInNetworkImageChoice("whatsapp", "community");
    expect(choice).toBe(WHATSAPP_DEFAULT_IMAGE_CHOICE);
    const id = choice.slice("builtin:".length);
    expect(builtinImage(id)).not.toBeNull();
    expect(BUILTIN_CARDS[id]?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("has nothing to say about any other network", () => {
    for (const network of ["facebook", "x", "linkedin", "reddit", "discord", "telegram", "slack"] as const) {
      expect(builtInNetworkImageChoice(network, "community")).toBe("");
    }
    expect(builtInNetworkImageChoice("whatsapp", "family")).toBe("");
    // The site-wide defaults have no mode of their own.
    expect(builtInNetworkImageChoice("whatsapp", null)).toBe(WHATSAPP_DEFAULT_IMAGE_CHOICE);
  });
});
