import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { buildWaitlistPresentation } from "@/lib/waitlist/presentation";
import { resolveWaitlistContext } from "@/lib/waitlist/server";
import { BRAND_ART_DATA_URI } from "@/lib/waitlist/topic-art";

// ─── The link preview image ──────────────────────────────────────────────────
//
// GET /api/og/waitlist?s=CODE&v=TOKEN — the image a messaging app shows when
// this tracked link is pasted.
//
// It resolves the source exactly as the page does and renders from the same
// presentation object, so the preview cannot describe a different page from the
// one behind the link. In particular the community-naming rule is applied once,
// in presentation.ts: a source that may not be named on the page cannot be
// named here either.
//
// `v` is read by nobody. It is a cache key — see waitlistOgImageVersion — so a
// replaced photograph or a different artwork produces a URL the scrapers have
// not already cached.
//
// A file-convention `opengraph-image.tsx` would have been simpler, but those do
// not receive search params — and the source code is a search param, so every
// tracked link would have produced the same generic image.
//
// ─── Why this is a picture and not a poster ──────────────────────────────────
//
// This used to print the heading and the opening paragraph down the left-hand
// two thirds with the hero squeezed into a 440px strip. Both of those strings
// are already shown by the platform, directly under the card, in its own type:
// Facebook rendered the sentence twice and WhatsApp shrank the whole thing to a
// thumbnail where the embedded copy was unreadable and the actual photograph
// was a sliver.
//
// So the card carries no page copy at all now. The image is the image, edge to
// edge, with a small wordmark over it — recognisable at 1200px and still
// recognisable at 80. The words are the platform's job and it does them.

export const runtime = "nodejs";

// 1.91:1, the ratio every major crawler crops to.
const WIDTH = 1200;
const HEIGHT = 630;

const CREAM = "#FBF7EF";
/** The field every piece of topic artwork is drawn on. */
const SAND = "#F3E7D0";
const GOLD = "#D89A2C";
const INK = "#332D27";

/**
 * Fonts are fetched rather than bundled, because next/font keeps its files
 * where satori cannot reach them. A failure here costs the brand typeface and
 * nothing else — the image still renders in satori's default face, which is a
 * far better outcome than a 500 and no preview at all.
 */
async function loadFont(
  family: string,
  weight: number
): Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" } | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`,
      { cache: "force-cache", signal: AbortSignal.timeout(3000) }
    ).then((r) => r.text());

    // Without a browser User-Agent the API answers with TrueType, which is what
    // satori wants.
    const url = css.match(/src: url\((https:[^)]+)\) format\('truetype'\)/)?.[1];
    if (!url) return null;

    const data = await fetch(url, {
      cache: "force-cache",
      signal: AbortSignal.timeout(3000),
    }).then((r) => r.arrayBuffer());

    return { name: family, data, weight: weight as 400 | 700, style: "normal" };
  } catch {
    return null;
  }
}

/**
 * Inline an uploaded hero image.
 *
 * satori can fetch a remote image itself, but a slow or missing Storage object
 * would then take the whole preview down. Fetching it here means a failure
 * degrades to the brand mark instead.
 */
async function inlineImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    // Well past any image the upload route accepts; a redirect to something
    // enormous should not be pulled into memory.
    if (buffer.byteLength > 8 * 1024 * 1024) return null;

    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const context = await resolveWaitlistContext(
    req.nextUrl.searchParams.get("s"),
    null
  );
  const p = buildWaitlistPresentation(context);

  const [wordmarkFont, labelFont, uploaded] = await Promise.all([
    loadFont("Sora", 700),
    loadFont("Inter", 400),
    p.hero.kind === "image" ? inlineImage(p.hero.src) : Promise.resolve(null),
  ]);

  const fonts = [wordmarkFont, labelFont].filter((f) => f !== null);
  const headingFamily = wordmarkFont ? "Sora" : undefined;
  const bodyFamily = labelFont ? "Inter" : undefined;

  // An uploaded image that could not be fetched falls back to the brand mark
  // rather than a blank panel.
  const photograph = p.hero.kind === "image" ? uploaded : null;
  const src = photograph ?? (p.hero.kind === "image" ? BRAND_ART_DATA_URI : p.hero.src);

  // Two treatments, because the two kinds of picture want opposite things.
  //
  // A photograph is cropped: it fills the frame, which is what makes a family
  // card recognisable at thumbnail size, and losing its edges costs nothing.
  //
  // An illustration is not. Every piece is a composed 400×300 scene, and
  // cropping a third of its height to fill 1200×630 would cut through the
  // drawing. It is sized to the full height instead and centred, and because
  // every scene is drawn on the same SAND field the bands either side read as
  // part of the artwork rather than as letterboxing.
  const isPhotograph = photograph !== null;
  const artWidth = Math.round(HEIGHT * (400 / 300));

  const label =
    p.mode === "family"
      ? "A private calling group"
      : "One-to-one voice calls";

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isPhotograph ? INK : SAND,
          fontFamily: bodyFamily,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={isPhotograph ? WIDTH : artWidth}
          height={HEIGHT}
          style={{
            width: isPhotograph ? WIDTH : artWidth,
            height: HEIGHT,
            objectFit: "cover",
          }}
        />

        {/* A scrim, so the wordmark stays legible over a dark photograph and a
            pale one alike. Only over the bottom sixth — anything more and it
            starts dimming the picture the card is for. */}
        <div
          style={{
            position: "absolute",
            display: "flex",
            left: 0,
            right: 0,
            bottom: 0,
            height: 190,
            backgroundImage:
              "linear-gradient(to top, rgba(20,16,12,0.72) 0%, rgba(20,16,12,0.38) 45%, rgba(20,16,12,0) 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            left: 56,
            bottom: 48,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: GOLD,
              }}
            />
            <div
              style={{
                fontFamily: headingFamily,
                fontSize: 34,
                color: CREAM,
                letterSpacing: -0.4,
              }}
            >
              The Operator
            </div>
          </div>
          {/* The one piece of text on the card. Not the title or the
              description — the platform prints both of those underneath. */}
          <div
            style={{
              fontSize: 22,
              color: "rgba(251,247,239,0.82)",
              marginTop: 8,
              marginLeft: 48,
            }}
          >
            {label}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: {
        // A scraper fetches this twice — once to build the composer preview and
        // again when the post is submitted — and the second fetch has a tighter
        // budget than the first. Five minutes was short enough that the second
        // one could land on a cold render; a day, revalidated in the
        // background, means it almost never does.
        //
        // Long caching is safe here because the URL carries `v`: an admin who
        // changes the picture changes the address, so nothing has to expire for
        // the new card to appear.
        "cache-control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
