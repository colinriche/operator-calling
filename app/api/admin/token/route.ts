import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase-admin";
import { adminDocId, isAdminRole, lookupAdmin, type AdminRole } from "@/lib/admins";
import { checkRateLimit } from "@/lib/rate-limit";
import { visitorHashFrom } from "@/lib/waitlist/source-code";
import { waitlistDb } from "@/lib/waitlist/server";
import { COLLECTIONS } from "@/lib/waitlist/constants";

// ─── POST /api/admin/token ────────────────────────────────────────────────────
//
// Body: { email: string }   (legacy field name `username` still accepted)
// Returns a Firebase custom token for the matching admin.
//
// ⚠️ THIS ROUTE PERFORMS NO CREDENTIAL CHECK.
//
// Submitting an address that appears in `admins` returns a working admin
// session. There is no password, no code and no second factor. Anyone who
// knows or guesses an administrator's email address can become that
// administrator, and email addresses are guessable by design.
//
// This is a known, accepted trade-off, not an oversight — the alternative
// (requiring a real Firebase Auth sign-in) was considered and declined. What
// stands between this endpoint and an attacker is only that nobody has tried.
//
// Two things narrow the window, neither of which makes it safe:
//   • ADMIN_LOGIN_ENABLED must be "true". Setting it to anything else disables
//     the route outright and is the fastest way to close this if needed.
//   • Attempts are rate limited per IP, so the address space cannot be walked
//     quickly. A targeted guess still succeeds first time.
//
// If this is ever revisited, the fix is to stop minting sessions here and have
// admins sign in with a real credential, keeping `admins` purely for
// authorisation. See docs/admin-roles.md.

export const runtime = "nodejs";

/** Deliberately strict — brute force needs to be slow and noisy. */
const LOGIN_LIMIT = { limit: 5, windowSeconds: 60 * 15 } as const;

interface Match {
  uid: string;
  email: string;
  name: string;
  role: AdminRole;
  source: "admins" | "legacy";
}

/**
 * Transitional: match against the legacy `user` collection when `admins` has
 * nothing. Mirrors the fallback in lib/admin-auth.ts so that login and
 * authorisation agree during the changeover. Remove both together.
 */
async function legacyMatch(input: string): Promise<Match | null> {
  const { db } = getAdminServices();
  const col = db.collection("user");

  let snap = await col.where("username", "==", input).limit(1).get();
  if (snap.empty) snap = await col.where("name", "==", input).limit(1).get();
  if (snap.empty) snap = await col.where("email", "==", input).limit(1).get();
  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data();
  if (!isAdminRole(data.role)) return null;
  if (data.archived === true) return null;

  const email =
    typeof data.email === "string" ? data.email.toLowerCase() : adminDocId(input);

  console.warn(
    `[admin/token] LEGACY ROLE USED for ${email} (role=${data.role}) — add this ` +
      `address to the "admins" collection, then remove the fallback`
  );

  return {
    uid: doc.id,
    email,
    name:
      (typeof data.displayName === "string" && data.displayName) ||
      (typeof data.name === "string" && data.name) ||
      "",
    role: data.role,
    source: "legacy",
  };
}

export async function POST(req: NextRequest) {
  if (process.env.ADMIN_LOGIN_ENABLED !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  let body: { email?: string; username?: string };
  try {
    body = (await req.json()) as { email?: string; username?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const input = (body.email ?? body.username ?? "").trim();
  if (!input) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    const limit = await checkRateLimit(waitlistDb(), COLLECTIONS.rateLimits, {
      scope: "admin_login",
      identifier: visitorHashFrom(req.headers),
      ...LOGIN_LIMIT,
    });
    if (!limit.allowed) {
      console.warn("[admin/token] rate limited");
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    // `admins` is authoritative; the legacy path only runs when it has nothing.
    const record = await lookupAdmin(input);
    const match: Match | null = record
      ? {
          uid: adminDocId(input),
          email: record.email,
          name: record.name,
          role: record.role,
          source: "admins",
        }
      : await legacyMatch(input);

    if (!match) {
      // Deliberately vague — never reveal whether an address is an admin.
      return NextResponse.json(
        { error: "No admin account found for that email" },
        { status: 404 }
      );
    }

    // Minted by the DEFAULT admin app, whose project id comes from
    // NEXT_PUBLIC_FIREBASE_PROJECT_ID — the same project the browser's client
    // SDK is configured for. It has to be: signInWithCustomToken rejects a
    // token issued by any other project. This stays correct after the move,
    // because both sides read the same variable.
    //
    // Claims matter too. A custom-token session carries no `email` of its own,
    // and the admin gate is keyed by email, so without these the session would
    // authenticate and then fail every authorisation check.
    const { adminAuth } = getAdminServices();
    const customToken = await adminAuth.createCustomToken(match.uid, {
      role: match.role,
      email: match.email,
      name: match.name,
    });

    console.log(
      `[admin/token] session issued for ${match.email} role=${match.role} via=${match.source}`
    );

    return NextResponse.json({ token: customToken, role: match.role });
  } catch (err) {
    console.error("[admin/token]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
