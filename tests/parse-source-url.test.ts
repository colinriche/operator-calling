import { describe, expect, it } from "vitest";
import {
  applySourceUrlInference,
  deriveCommunityUrl,
  inferSourceFromUrl,
} from "@/lib/waitlist/parse-source-url";

describe("inferSourceFromUrl", () => {
  it("fills Reddit subreddit fields from the path", () => {
    expect(inferSourceFromUrl("https://www.reddit.com/r/CasualConversation")).toEqual({
      platformId: "reddit",
      sourceType: "subreddit",
      sourceName: "CasualConversation",
    });
  });

  it("treats a Reddit comments URL as a post", () => {
    expect(
      inferSourceFromUrl(
        "https://reddit.com/r/phonecalls/comments/abc123/hello_there/"
      )
    ).toEqual({
      platformId: "reddit",
      sourceType: "post",
      sourceName: "hello_there",
    });
  });

  it("fills a Facebook group with a readable slug, but not a numeric id", () => {
    expect(
      inferSourceFromUrl("https://www.facebook.com/groups/YorkshireTerrierOwners")
    ).toEqual({
      platformId: "facebook",
      sourceType: "group",
      sourceName: "YorkshireTerrierOwners",
    });
    expect(inferSourceFromUrl("https://www.facebook.com/groups/123456789012345")).toEqual({
      platformId: "facebook",
      sourceType: "group",
    });
  });

  it("derives a YouTube channel handle and leaves UC ids nameless", () => {
    expect(inferSourceFromUrl("https://www.youtube.com/@mkbhd")).toEqual({
      platformId: "youtube",
      sourceType: "channel",
      sourceName: "mkbhd",
    });
    expect(inferSourceFromUrl("https://youtube.com/c/LinusTechTips")).toEqual({
      platformId: "youtube",
      sourceType: "channel",
      sourceName: "LinusTechTips",
    });
    expect(
      inferSourceFromUrl("https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ")
    ).toEqual({
      platformId: "youtube",
      sourceType: "channel",
    });
  });

  it("recognises Discord, X, Instagram, TikTok, LinkedIn, Telegram and WhatsApp", () => {
    expect(inferSourceFromUrl("https://discord.gg/python")).toEqual({
      platformId: "discord",
      sourceType: "server",
      sourceName: "python",
    });
    expect(inferSourceFromUrl("https://x.com/OpenAI/status/123")).toEqual({
      platformId: "x",
      sourceType: "post",
      sourceName: "OpenAI",
    });
    expect(inferSourceFromUrl("https://www.instagram.com/natgeo/")).toEqual({
      platformId: "instagram",
      sourceType: "social_page",
      sourceName: "natgeo",
    });
    expect(inferSourceFromUrl("https://www.tiktok.com/@khaby.lame")).toEqual({
      platformId: "tiktok",
      sourceType: "social_page",
      sourceName: "khaby.lame",
    });
    expect(inferSourceFromUrl("https://www.linkedin.com/company/microsoft")).toEqual({
      platformId: "linkedin",
      sourceType: "social_page",
      sourceName: "microsoft",
    });
    expect(inferSourceFromUrl("https://t.me/telegram")).toEqual({
      platformId: "telegram",
      sourceType: "channel",
      sourceName: "telegram",
    });
    expect(inferSourceFromUrl("https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv")).toEqual({
      platformId: "whatsapp",
      sourceType: "group",
    });
  });

  it("says nothing useful about a bare or unrecognised URL", () => {
    expect(inferSourceFromUrl("https://facebook.com")).toEqual({
      platformId: "facebook",
    });
    expect(inferSourceFromUrl("not a url")).toEqual({});
    expect(inferSourceFromUrl("")).toEqual({});
  });
});

describe("applySourceUrlInference", () => {
  it("fills unlocked fields and leaves locked ones alone", () => {
    const form = {
      sourceName: "",
      platformId: "reddit",
      sourceType: "subreddit",
      sourceUrl: "https://facebook.com/groups/yorkies",
    };
    const inferred = inferSourceFromUrl(form.sourceUrl);
    expect(
      applySourceUrlInference(form, inferred, new Set())
    ).toMatchObject({
      platformId: "facebook",
      sourceType: "group",
      sourceName: "yorkies",
    });
    expect(
      applySourceUrlInference(form, inferred, new Set(["sourceName", "platformId"]))
    ).toMatchObject({
      platformId: "reddit",
      sourceType: "group",
      sourceName: "",
    });
  });
});

describe("deriveCommunityUrl", () => {
  it("strips a Reddit post URL down to its subreddit", () => {
    const post = "https://www.reddit.com/r/AppIdeas/comments/abc123/my_idea/";
    expect(deriveCommunityUrl(post)).toEqual({
      platformId: "reddit",
      sourceType: "subreddit",
      sourceName: "AppIdeas",
      communityUrl: "reddit.com/r/AppIdeas",
      postUrl: post,
    });
  });

  it("strips a Reddit short share link down to its subreddit", () => {
    expect(
      deriveCommunityUrl("https://reddit.com/r/AppIdeas/s/xyz789")
    ).toMatchObject({
      platformId: "reddit",
      sourceType: "subreddit",
      sourceName: "AppIdeas",
      communityUrl: "reddit.com/r/AppIdeas",
    });
  });

  it("leaves a bare subreddit URL as its own community", () => {
    expect(deriveCommunityUrl("https://reddit.com/r/AppIdeas")).toMatchObject({
      communityUrl: "reddit.com/r/AppIdeas",
    });
  });

  it("strips a Facebook group post down to the group", () => {
    expect(
      deriveCommunityUrl(
        "https://www.facebook.com/groups/YorkshireTerrierOwners/posts/998877"
      )
    ).toMatchObject({
      platformId: "facebook",
      sourceType: "group",
      sourceName: "YorkshireTerrierOwners",
      communityUrl: "facebook.com/groups/YorkshireTerrierOwners",
    });
  });

  it("strips an X status down to the profile", () => {
    expect(
      deriveCommunityUrl("https://x.com/somehandle/status/123456")
    ).toMatchObject({
      platformId: "x",
      sourceType: "social_page",
      sourceName: "somehandle",
      communityUrl: "x.com/somehandle",
    });
  });

  it("returns null for a video link with no encoded community", () => {
    expect(deriveCommunityUrl("https://www.youtube.com/watch?v=abc123")).toBeNull();
  });

  it("returns null for a host it does not know", () => {
    expect(deriveCommunityUrl("https://example-forum.test/thread/42")).toBeNull();
  });

  it("returns null for a bare, unparseable string", () => {
    expect(deriveCommunityUrl("not a url at all")).toBeNull();
  });
});
