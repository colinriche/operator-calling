import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, WAITLIST_LIMITS } from "@/lib/rate-limit";
import { COLLECTIONS, type TimezoneSource } from "@/lib/waitlist/constants";
import { SCHEDULE_ZONE, isValidTimezone } from "@/lib/waitlist/timezone";
import {
  isValidCountryCode,
  isValidLanguageCode,
} from "@/lib/waitlist/locales";
import { registerWaitlistEntry, waitlistDb } from "@/lib/waitlist/server";
import { visitorHashFrom } from "@/lib/waitlist/source-code";

// POST /api/waitlist/register — public, unauthenticated waitlist signup.
//
// Attribution is resolved from the source code on the server; platform,
// audience label, group and relationship status sent by the browser are
// ignored entirely.

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Honeypot: a field no human sees. Respond as if it succeeded so a bot gets
  // no signal that it was filtered.
  if (str(body.website, 200)) {
    return NextResponse.json({ success: true, created: false });
  }

  const email = str(body.email, 320);
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const country = body.country;
  if (!isValidCountryCode(country)) {
    return NextResponse.json(
      { error: "Select your country." },
      { status: 400 }
    );
  }

  const englishFirstLanguage = body.englishFirstLanguage !== false;
  let firstLanguage: string | null = null;
  if (!englishFirstLanguage) {
    if (!isValidLanguageCode(body.firstLanguage)) {
      return NextResponse.json(
        { error: "Select your first language." },
        { status: 400 }
      );
    }
    firstLanguage = body.firstLanguage;
  }

  // Time zone affects display only, so an unrecognised one is not worth failing
  // a signup over — fall back to the schedule zone and record that we chose it.
  const timezone = isValidTimezone(body.timezone) ? body.timezone : SCHEDULE_ZONE;
  const timezoneSource: TimezoneSource =
    body.timezoneSource === "user_selected" ? "user_selected" : "detected";

  try {
    const db = waitlistDb();
    const limit = await checkRateLimit(db, COLLECTIONS.rateLimits, {
      scope: "waitlist_register",
      identifier: visitorHashFrom(req.headers),
      ...WAITLIST_LIMITS.register,
    });

    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again shortly." },
        { status: 429 }
      );
    }

    const result = await registerWaitlistEntry({
      email,
      displayName: str(body.displayName, 80),
      interestedInOrganising: body.interestedInOrganising === true,
      country,
      englishFirstLanguage,
      firstLanguage,
      sourceCode: typeof body.sourceCode === "string" ? body.sourceCode : null,
      shareChannel:
        typeof body.shareChannel === "string" ? body.shareChannel : null,
      landingPage: str(body.landingPage, 500),
      referrer: str(body.referrer, 500),
      joinTesterProgramme: body.joinTesterProgramme === true,
      timezone,
      timezoneSource,
    });

    // A duplicate looks identical to a first-time signup from the outside —
    // the visitor gets a normal confirmation either way.
    return NextResponse.json({
      success: true,
      created: result.created,
      audienceLabel: result.audienceLabel,
      interestedInOrganising: result.interestedInOrganising,
      communityInterest: result.communityInterest,
      testerStatus: result.testerStatus,
      manageToken: result.manageToken,
      timezone: result.timezone,
    });
  } catch (err) {
    console.error("[waitlist/register]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
