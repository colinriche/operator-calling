import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, WAITLIST_LIMITS } from "@/lib/rate-limit";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import {
  normaliseShareChannel,
  recordVisit,
  waitlistDb,
} from "@/lib/waitlist/server";
import { normaliseSourceCode, visitorHashFrom } from "@/lib/waitlist/source-code";

// POST /api/waitlist/visit — records a visit to a tracked waitlist link.
//
// Fired from the client rather than during the server render so that bots and
// link-preview crawlers, which do not execute JavaScript, stay out of the
// counts. Admin previews pass preview=1 and are skipped before this is called.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sourceCode = normaliseSourceCode(body.sourceCode);
  if (!sourceCode) {
    // Nothing to attribute — not an error worth surfacing.
    return NextResponse.json({ recorded: false });
  }

  try {
    const db = waitlistDb();
    const limit = await checkRateLimit(db, COLLECTIONS.rateLimits, {
      scope: "waitlist_visit",
      identifier: visitorHashFrom(req.headers),
      ...WAITLIST_LIMITS.visit,
    });
    if (!limit.allowed) return NextResponse.json({ recorded: false });

    await recordVisit({
      sourceCode,
      visitorHash: visitorHashFrom(req.headers),
      shareChannel: normaliseShareChannel(body.shareChannel),
      landingPage:
        typeof body.landingPage === "string" ? body.landingPage : "",
      referrer: typeof body.referrer === "string" ? body.referrer : "",
    });

    return NextResponse.json({ recorded: true });
  } catch (err) {
    console.error("[waitlist/visit]", err);
    // Never let analytics failure surface to a visitor.
    return NextResponse.json({ recorded: false });
  }
}
