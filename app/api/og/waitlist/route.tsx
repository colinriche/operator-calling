import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { buildWaitlistPresentation } from "@/lib/waitlist/presentation";
import { resolveWaitlistContext } from "@/lib/waitlist/server";

// ─── The link preview image ──────────────────────────────────────────────────
//
// GET /api/og/waitlist?s=CODE — the image a messaging app shows when this
// tracked link is pasted.
//
// It resolves the source exactly as the page does and renders from the same
// presentation object, so the preview cannot describe a different page from the
// one behind the link. In particular the community-naming rule is applied once,
// in presentation.ts: a source that may not be named on the page cannot be
// named here either.
//
// A file-convention `opengraph-image.tsx` would have been simpler, but those do
// not receive search params — and the source code is a search param, so every
// tracked link would have produced the same generic image.

export const runtime = "nodejs";

// 1.91:1, the ratio every major crawler crops to.
const WIDTH = 1200;
const HEIGHT = 630;

const CREAM = "#FBF7EF";
const GOLD = "#D89A2C";
const TEAL = "#2F5468";
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
 * degrades to the artwork panel instead.
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

/** Trim on a word boundary so a cropped heading does not end mid-word. */
function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export async function GET(req: NextRequest) {
  const context = await resolveWaitlistContext(
    req.nextUrl.searchParams.get("s"),
    null
  );
  const p = buildWaitlistPresentation(context);

  const [heading, body, hero] = await Promise.all([
    loadFont("Sora", 700),
    loadFont("Inter", 400),
    p.hero.kind === "image" ? inlineImage(p.hero.src) : Promise.resolve(null),
  ]);

  // An uploaded image that could not be fetched falls back to the brand mark
  // rather than a blank panel.
  const heroSrc = p.hero.kind === "image" ? hero : p.hero.src;

  const fonts = [heading, body].filter((f) => f !== null);
  const headingFamily = heading ? "Sora" : undefined;
  const bodyFamily = body ? "Inter" : undefined;

  const title = clamp(p.og.title, 90);
  const description = clamp(p.og.description, 190);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: CREAM,
          fontFamily: bodyFamily,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: "72px 56px 72px 72px",
          }}
        >
          {/* The wordmark, matching the header the page itself carries. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 36,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: GOLD,
              }}
            />
            <div
              style={{
                fontFamily: headingFamily,
                fontSize: 26,
                color: INK,
                letterSpacing: -0.2,
              }}
            >
              The Operator
            </div>
          </div>

          {p.eyebrow && (
            <div
              style={{
                fontFamily: headingFamily,
                fontSize: 26,
                color: GOLD,
                marginBottom: 14,
              }}
            >
              {clamp(p.eyebrow, 60)}
            </div>
          )}

          <div
            style={{
              fontFamily: headingFamily,
              fontSize: title.length > 42 ? 54 : 68,
              lineHeight: 1.1,
              color: INK,
              letterSpacing: -1.5,
              marginBottom: 24,
            }}
          >
            {title}
          </div>

          <div style={{ fontSize: 28, lineHeight: 1.45, color: MUTED }}>
            {description}
          </div>
        </div>

        {/* Mirrors the hero at the top of the page. Landscape puts it beside
            the words rather than above them; it is the same image. */}
        <div
          style={{
            display: "flex",
            width: 440,
            height: "100%",
            borderLeft: `2px solid rgba(51,45,39,0.08)`,
            backgroundColor: TEAL,
          }}
        >
          {heroSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroSrc}
              alt=""
              width={440}
              height={HEIGHT}
              style={{ width: 440, height: HEIGHT, objectFit: "cover" }}
            />
          )}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: {
        // Long enough that a burst of previews costs one render, short enough
        // that an admin editing a family name sees it change the same day.
        "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
      },
    }
  );
}
