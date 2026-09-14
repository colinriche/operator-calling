import type { NextRequest } from "next/server";
import { isJpeg } from "@/lib/waitlist/card-encode";
import { waitlistCard } from "@/lib/waitlist/og-card";

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
// ─── How it is made ───────────────────────────────────────────────────────────
//
// In lib/waitlist/og-card.tsx — including why it is a JPEG and why nothing
// native runs there — shared with the admin routes that make the card in
// advance.

export const runtime = "nodejs";

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
      "content-type": isJpeg(bytes) ? "image/jpeg" : "image/png",
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

export async function GET(req: NextRequest) {
  // waitlistCard never throws: a failure comes back as the fallback image,
  // marked not to be cached.
  const { bytes, cache } = await waitlistCard(req.nextUrl.searchParams.get("s"));
  return imageResponse(bytes, { cache });
}
