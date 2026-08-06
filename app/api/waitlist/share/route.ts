import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, WAITLIST_LIMITS } from "@/lib/rate-limit";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import {
  normaliseShareChannel,
  recordShareClick,
  waitlistDb,
} from "@/lib/waitlist/server";
import { normaliseSourceCode, visitorHashFrom } from "@/lib/waitlist/source-code";

// POST /api/waitlist/share — records that a share button was pressed.
//
// A click is an intent signal only. We never learn whether the visitor
// actually posted anything, so this is counted separately from registrations
// and never contributes to demand. No share content is stored.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const channel = normaliseShareChannel(body.shareChannel);
  const sourceCode = normaliseSourceCode(body.sourceCode);
  if (!channel) return NextResponse.json({ recorded: false });

  try {
    const db = waitlistDb();
    const limit = await checkRateLimit(db, COLLECTIONS.rateLimits, {
      scope: "waitlist_share",
      identifier: visitorHashFrom(req.headers),
      ...WAITLIST_LIMITS.share,
    });
    if (!limit.allowed) return NextResponse.json({ recorded: false });

    await recordShareClick(sourceCode ?? "", channel);
    return NextResponse.json({ recorded: true });
  } catch (err) {
    console.error("[waitlist/share]", err);
    return NextResponse.json({ recorded: false });
  }
}
