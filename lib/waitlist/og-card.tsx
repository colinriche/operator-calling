import { ImageResponse } from "next/og";
import { isJpeg, pngToJpeg } from "@/lib/waitlist/card-encode";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { FALLBACK_PNG } from "@/lib/waitlist/og-fallback";
import {
  readWaitlistCard,
  storeWaitlistCard,
  waitlistCardExists,
  waitlistCardPath,
} from "@/lib/waitlist/og-store";
import {
  buildWaitlistPresentation,
  cardNetwork,
  waitlistOgImageVersion,
} from "@/lib/waitlist/presentation";
import {
  isSocialNetwork,
  SOCIAL_NETWORK_IDS,
  type SocialNetwork,
} from "@/lib/waitlist/library";
import { resolveWaitlistContext, waitlistDb } from "@/lib/waitlist/server";
import { BUILTIN_CARDS } from "@/lib/waitlist/builtin-card-data";
import { imageSize, type ImageSize } from "@/lib/waitlist/image-size";
import { BRAND_ART_DATA_URI } from "@/lib/waitlist/topic-art";
import type { WaitlistPresentation } from "@/lib/waitlist/types";

// ─── Making the social card ──────────────────────────────────────────────────
//
// Server-only. Shared by the image endpoint, which serves a card, and the admin
// routes, which make one the moment a page changes. What the card is for, and
// the designs that failed before it, are on the endpoint:
// app/api/og/waitlist/route.tsx.
//
// Why the admin routes need it: the first scrape of a card that has not been
// made yet waits for a render — measured at up to 4.4s on a cold function, on
// top of the page itself. WhatsApp gave up on exactly that, showed a family
// link with no picture, and then remembered the link that way. Making the card
// when an admin saves means a link is not shared before its card exists.

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
// So: nothing is imported here that cannot be bundled. The size is now brought
// down by a pure-JavaScript JPEG encoder (lib/waitlist/card-encode.ts), which
// has no platform binary to resolve.
//
// The layout helps on its own. The picture occupies 434 of the 630 rows and the
// title band beneath it is flat colour, which measured 583KB for a realistic
// photograph against 2.0MB for the full-bleed design that preceded it.

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
async function inlineImage(
  url: string
): Promise<{ dataUri: string; size: ImageSize | null } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    // Well past any image the upload route accepts; a redirect to something
    // enormous should not be pulled into memory.
    if (buffer.byteLength > 8 * 1024 * 1024) return null;

    return {
      dataUri: `data:${type};base64,${buffer.toString("base64")}`,
      size: imageSize(buffer),
    };
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

/** Trim on a word boundary so a cropped title does not end mid-word. */
function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export interface WaitlistCard {
  bytes: Buffer;
  /** False for a fallback, which must not be pinned at the CDN. */
  cache: boolean;
}

/**
 * Where a code's card lives, resolved exactly as the page resolves it.
 *
 * The `v` in the endpoint's URL is not trusted for this — the path is keyed on
 * the version of the presentation actually resolved here, so a stale or
 * invented `v` cannot make one card be stored under another's address.
 */
async function locate(rawCode: string | null, rawNetwork: unknown = null) {
  const context = await resolveWaitlistContext(rawCode, null);
  const network = cardNetwork(context, isSocialNetwork(rawNetwork) ? rawNetwork : null);
  const p = buildWaitlistPresentation(context, network);
  const path = waitlistCardPath(context.sourceCode, waitlistOgImageVersion(p), network);
  return { p, path, context };
}

/**
 * The card for a code, and for a network when one has its own picture: the
 * stored file if there is one, else rendered and stored.
 */
export async function waitlistCard(
  rawCode: string | null,
  rawNetwork: unknown = null
): Promise<WaitlistCard> {
  try {
    const { p, path } = await locate(rawCode, rawNetwork);
    const stored = await readWaitlistCard(path);
    if (stored && isJpeg(stored)) return { bytes: stored, cache: true };
    return await render(p, path);
  } catch (err) {
    // Whatever failed — a font, satori, the source lookup — a scraper gets a
    // real image rather than a 500 with nothing in it. An empty body is the one
    // outcome that leaves every shared link with no picture at all.
    console.error("[og/waitlist] render failed, serving fallback:", err);
    return { bytes: FALLBACK_PNG, cache: false };
  }
}

/**
 * Make a code's card now if it does not exist yet. Never throws: a card that
 * could not be made in advance is still made by the first scrape, only slower.
 */
export async function warmWaitlistCard(rawCode: string | null): Promise<void> {
  try {
    const { p, path, context } = await locate(rawCode);
    if (!(await waitlistCardExists(path))) await render(p, path);

    // Then every network that has a picture of its own. The rest share the
    // card just made.
    for (const id of SOCIAL_NETWORK_IDS) {
      const network = cardNetwork(context, id as SocialNetwork);
      if (!network) continue;
      const forNetwork = buildWaitlistPresentation(context, network);
      const networkPath = waitlistCardPath(
        context.sourceCode,
        waitlistOgImageVersion(forNetwork),
        network
      );
      if (!(await waitlistCardExists(networkPath))) await render(forNetwork, networkPath);
    }
  } catch (err) {
    console.error(`[og/waitlist] could not make the card in advance for ${rawCode}:`, err);
  }
}

/**
 * Make the card behind every active link to a source. One after another rather
 * than all at once: each render holds a full-size bitmap, and a source rarely
 * has more than a couple of links.
 */
export async function warmWaitlistCardsForSource(sourceId: string): Promise<void> {
  try {
    const links = await waitlistDb()
      .collection(COLLECTIONS.sourceLinks)
      .where("demandSourceId", "==", sourceId)
      .get();
    for (const link of links.docs) {
      const data = link.data();
      if (data.status !== "active") continue;
      if (typeof data.sourceCode === "string" && data.sourceCode) {
        await warmWaitlistCard(data.sourceCode);
      }
    }
  } catch (err) {
    console.error(`[og/waitlist] could not list the links to warm for ${sourceId}:`, err);
  }
}

async function render(p: WaitlistPresentation, path: string): Promise<WaitlistCard> {
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
  const photograph = p.hero.kind === "image" ? (uploaded?.dataUri ?? null) : null;
  const builtinCard =
    p.hero.kind === "builtin" ? (BUILTIN_CARDS[p.hero.builtinId] ?? null) : null;
  const src =
    builtinCard ??
    photograph ??
    (p.hero.kind === "image" ? BRAND_ART_DATA_URI : p.hero.src);

  // Two treatments, because the two kinds of picture want opposite things.
  //
  // An uploaded picture is never cropped at the sides. Filling the frame
  // regardless used to cut the ends off any wide picture — the words on a
  // banner, the people at a photograph's edges. So it is fitted to the card's
  // full width: a banner wider than the strip keeps every edge on cream bands,
  // and a landscape photograph loses a little of its top and bottom, evenly.
  //
  // A portrait picture is the exception. At full width only a slice of its
  // middle would show, so past 1.5× the strip's height it is fitted to the
  // height instead, whole, on dark bands.
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
  //
  // A built-in picture is neither: its strip is already composed at exactly the
  // visual area's size, so it is drawn edge to edge like a photograph. It comes
  // from the embedded strip, since the page's src is a relative path satori
  // cannot load.
  const isPhotograph = photograph !== null || builtinCard !== null;
  // Full width, at the picture's own proportions. Unknown proportions (a header
  // the reader does not understand) are contained instead, which cannot crop.
  const uploadedSize = photograph ? (uploaded?.size ?? null) : null;
  const fullWidthHeight = uploadedSize
    ? Math.round(WIDTH * (uploadedSize.height / uploadedSize.width))
    : VISUAL_HEIGHT;
  const isPortrait = fullWidthHeight > VISUAL_HEIGHT * 1.5;
  const photoWidth =
    uploadedSize && isPortrait
      ? Math.round(VISUAL_HEIGHT * (uploadedSize.width / uploadedSize.height))
      : WIDTH;
  const photoHeight = isPortrait ? VISUAL_HEIGHT : fullWidthHeight;
  const isWide = photograph !== null && photoHeight < VISUAL_HEIGHT;
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
            backgroundColor: isWide ? CREAM : isPhotograph ? INK : SAND,
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            width={photograph ? photoWidth : isPhotograph ? WIDTH : artWidth}
            height={photograph ? photoHeight : isPhotograph ? VISUAL_HEIGHT : artHeight}
            style={{
              width: photograph ? photoWidth : isPhotograph ? WIDTH : artWidth,
              height: photograph ? photoHeight : isPhotograph ? VISUAL_HEIGHT : artHeight,
              flexShrink: 0,
              objectFit: photograph && !uploadedSize ? "contain" : "cover",
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
    return { bytes: FALLBACK_PNG, cache: false };
  }

  // JPEG, or WhatsApp drops a photograph card for being too big. If the encode
  // fails the PNG is served, since a large image beats no image — but neither
  // stored nor cached, so the next scrape tries the encode again rather than
  // pinning a card WhatsApp will refuse.
  let card: Buffer;
  try {
    card = pngToJpeg(png);
  } catch (err) {
    console.error("[og/waitlist] JPEG encode failed, serving PNG:", err);
    return { bytes: png, cache: false };
  }

  // Stored for next time, and — more to the point — so the page can hand
  // Facebook the file's own URL instead of this endpoint.
  await storeWaitlistCard(path, card);

  return { bytes: card, cache: true };
}
