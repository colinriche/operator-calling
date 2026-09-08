import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { FALLBACK_PNG } from "@/lib/waitlist/og-fallback";
import {
  readWaitlistCard,
  storeWaitlistCard,
  waitlistCardPath,
} from "@/lib/waitlist/og-store";
import {
  buildWaitlistPresentation,
  waitlistOgImageVersion,
} from "@/lib/waitlist/presentation";
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
// ─── What this card is, and what it learned the hard way ─────────────────────
//
// Two failed designs got it here, and both failures were about what the
// platforms actually do rather than what the Open Graph spec says.
//
// The first printed the heading *and* the opening paragraph down two thirds of
// the card, with the picture in a 440px strip. Facebook then printed the same
// sentence again underneath, and WhatsApp shrank the whole thing to a thumbnail
// in which the embedded copy was unreadable.
//
// The second removed all of it. That was too far in the other direction:
// Facebook does not reliably print og:title under the card — in testing it
// showed the domain — so a wordless picture arrived with no idea what it was.
//
// So: the picture dominates, and the title rides in a solid band beneath it.
// The paragraph stays out; the platform has the description in metadata and
// prints it when it wants to. Facebook gets a title it cannot fail to show,
// because the title is part of the image.
//
// ─── Why this is a PNG, and why nothing native runs here ─────────────────────
//
// A previous version re-encoded the rendered PNG to JPEG through sharp, to get
// under the ~600KB above which WhatsApp declines to show a preview image at
// all. It took the endpoint down completely.
//
// sharp is a native module. Turbopack externalised it under a hashed specifier
// and emitted, in the deployed chunk:
//
//   t.exports = e.x("sharp-20c6a5da84e2135f", () => require("sharp-20c6a5da84e2135f"))
//
// Nothing by that name exists, `e.x` is a plain thunk call with no manifest
// behind it, and the require therefore threw during module evaluation — before
// the handler, and before any try/catch inside it. Every request returned 500
// with a zero-byte body; Facebook reported only "could not be processed as an
// image". Adding sharp to serverExternalPackages did not change the emitted
// specifier.
//
// So: nothing is imported here that cannot be bundled. Getting the file size
// down is worth doing, but with a pure-JavaScript encoder that has no platform
// binary to resolve — not by reaching for a native module again.
//
// The layout helps on its own. The picture occupies 434 of the 630 rows and the
// title band beneath it is flat colour, which measured 583KB for a realistic
// photograph against 2.0MB for the full-bleed design that preceded it.

export const runtime = "nodejs";

// 1.91:1, the ratio every major crawler crops to.
const WIDTH = 1200;
const HEIGHT = 630;

/**
 * The picture gets the top two thirds, the title the rest. Enough of the card
 * to read the name at a glance in Facebook's large preview, not so much that
 * the photograph stops being the thing you recognise.
 */
const BAND_HEIGHT = 196;
const VISUAL_HEIGHT = HEIGHT - BAND_HEIGHT;

const CREAM = "#FBF7EF";
/** The field every piece of topic artwork is drawn on. */
const SAND = "#F3E7D0";
const GOLD = "#D89A2C";
const INK = "#332D27";
const MUTED = "#6B6259";

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
 *
 * No resizing: that needs an image codec, and an image codec here is what broke
 * the endpoint. satori scales it into the frame instead.
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

/** PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A. */
function isPng(bytes: Buffer): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

/**
 * One place that builds the response, so the declared type is read off the
 * bytes rather than asserted alongside them.
 *
 * A header claiming image/jpeg over PNG bytes is exactly the sort of mismatch
 * that makes a scraper reject a card while every other check looks fine, and it
 * is only avoidable by never writing the two independently.
 */
function imageResponse(bytes: Buffer, { cache }: { cache: boolean }): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(bytes.byteLength),
      // A scraper fetches this twice — once to build the composer preview and
      // again when the post is submitted — and the second fetch has a tighter
      // budget than the first. Five minutes was short enough that the second
      // one could land on a cold render; a day, revalidated in the background,
      // means it almost never does.
      //
      // Long caching is safe here because the URL carries `v`: an admin who
      // changes the picture changes the address, so nothing has to expire for
      // the new card to appear.
      //
      // The fallback is never cached. It is served because something broke, and
      // pinning it at the CDN for a day would turn a transient failure into a
      // day of blank cards long after the cause was fixed.
      "cache-control": cache
        ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=0, must-revalidate",
    },
  });
}

/** Trim on a word boundary so a cropped title does not end mid-word. */
function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export async function GET(req: NextRequest) {
  try {
    return await render(req);
  } catch (err) {
    // Whatever failed — a font, satori, the source lookup — a scraper gets a
    // real image rather than a 500 with nothing in it. An empty body is the one
    // outcome that leaves every shared link with no picture at all.
    console.error("[og/waitlist] render failed, serving fallback:", err);
    return imageResponse(FALLBACK_PNG, { cache: false });
  }
}

async function render(req: NextRequest): Promise<Response> {
  const context = await resolveWaitlistContext(
    req.nextUrl.searchParams.get("s"),
    null
  );
  const p = buildWaitlistPresentation(context);

  // Rendered once per version, then read back. The `v` in the URL is not
  // trusted for this — the path is keyed on the version of the presentation
  // actually resolved here, so a stale or invented `v` cannot make one card be
  // stored under another's address.
  const path = waitlistCardPath(context.sourceCode, waitlistOgImageVersion(p));

  const stored = await readWaitlistCard(path);
  if (stored && isPng(stored)) return imageResponse(stored, { cache: true });

  const [headingFont, bodyFont, uploaded] = await Promise.all([
    loadFont("Sora", 700),
    loadFont("Inter", 400),
    p.hero.kind === "image" ? inlineImage(p.hero.src) : Promise.resolve(null),
  ]);

  const fonts = [headingFont, bodyFont].filter((f) => f !== null);
  const headingFamily = headingFont ? "Sora" : undefined;
  const bodyFamily = bodyFont ? "Inter" : undefined;

  // An uploaded image that could not be fetched falls back to the brand mark
  // rather than a blank panel.
  const photograph = p.hero.kind === "image" ? uploaded : null;
  const src = photograph ?? (p.hero.kind === "image" ? BRAND_ART_DATA_URI : p.hero.src);

  // Two treatments, because the two kinds of picture want opposite things.
  //
  // A photograph is cropped to fill the frame — losing its edges costs nothing,
  // and inlineImage has already done the crop, on the subject.
  //
  // An illustration is not cropped to the frame. Every piece is a composed
  // 400×300 scene, and squeezing it into a 1200×434 letterbox would cut
  // straight through the drawing.
  //
  // It is drawn oversized and centred instead: at this height the subject
  // fills the card properly, and the ~17% trimmed off the top and bottom is
  // the scene's own margin — the discs in topic-art.ts, never the subject.
  // Because every scene is drawn on the same SAND field, the bands either side
  // read as part of the artwork rather than as letterboxing.
  const isPhotograph = photograph !== null;
  const artHeight = 520;
  const artWidth = Math.round(artHeight * (400 / 300));

  // p.heading, not p.og.title: the latter appends the source line, which is
  // provenance for the metadata rather than a name to set in 56px type.
  const title = clamp(p.heading, 64);
  const label = p.mode === "family" ? "A private calling group" : "One-to-one voice calls";

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: CREAM,
          fontFamily: bodyFamily,
        }}
      >
        <div
          style={{
            display: "flex",
            width: WIDTH,
            height: VISUAL_HEIGHT,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isPhotograph ? INK : SAND,
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            width={isPhotograph ? WIDTH : artWidth}
            height={isPhotograph ? VISUAL_HEIGHT : artHeight}
            style={{
              width: isPhotograph ? WIDTH : artWidth,
              height: isPhotograph ? VISUAL_HEIGHT : artHeight,
              objectFit: "cover",
            }}
          />
        </div>

        {/* The title band. Solid rather than a gradient over the picture: at
            WhatsApp thumbnail size a scrim turns into mud, and a hard edge
            keeps the two halves legible at every scale. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: WIDTH,
            height: BAND_HEIGHT,
            padding: "0 56px",
            borderTop: `4px solid ${GOLD}`,
          }}
        >
          <div
            style={{
              fontFamily: headingFamily,
              // Two sizes rather than a formula: a long family name has to fit
              // on one line, and everything else should be as large as it can.
              fontSize: title.length > 30 ? 50 : 62,
              lineHeight: 1.12,
              color: INK,
              letterSpacing: -1.2,
            }}
          >
            {title}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: GOLD,
              }}
            />
            {/* One string, not text plus an expression: satori counts those as
                two child nodes and rejects any div with more than one unless it
                carries an explicit display. */}
            <div style={{ fontSize: 22, color: MUTED }}>
              {`The Operator · ${label}`}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      ...(fonts.length > 0 ? { fonts } : {}),
    }
  );

  // The body is consumed to completion here, once, and served as bytes. The
  // ImageResponse's own stream and headers are not passed through: mixing a
  // half-read stream with headers written by hand is how a response ends up
  // truncated while still looking correct from the outside.
  const png = Buffer.from(await image.arrayBuffer());

  // Checked rather than assumed. If satori ever hands back something that is
  // not a PNG, serving it under an image content type would produce exactly the
  // "corrupted or invalid format" that started all this.
  if (!isPng(png)) {
    console.error(
      `[og/waitlist] renderer returned ${png.byteLength} bytes that are not a PNG; serving fallback`
    );
    return imageResponse(FALLBACK_PNG, { cache: false });
  }

  // Stored for next time, and — more to the point — so the page can hand
  // Facebook the file's own URL instead of this endpoint.
  await storeWaitlistCard(path, png);

  return imageResponse(png, { cache: true });
}
