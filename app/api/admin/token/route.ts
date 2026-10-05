import { NextResponse } from "next/server";

// ─── POST /api/admin/token - RETIRED ──────────────────────────────────────────
//
// This route used to mint an admin session from an email address alone: no
// password, no code, no second factor. Anyone who knew or guessed an
// administrator's address could become that administrator.
//
// It is gone, not disabled behind a flag: there is no longer any code here that
// can create a session. Administrators sign in with a real credential (Google or
// phone) at /login like everyone else, and what they may do is decided by their
// record in the `admins` collection (lib/admins.ts, lib/admin-auth.ts).
//
// `ADMIN_LOGIN_ENABLED` is no longer read anywhere and can be removed from the
// environment.

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Admin sessions are no longer issued here. Sign in at /login." },
    { status: 410 }
  );
}
