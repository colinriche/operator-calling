import { NextResponse } from "next/server";

// ─── POST /api/account/link - RETIRED ────────────────────────────────────────
//
// This used to merge a website account into an app account when the caller knew
// the app account's Support Code (systemName) and its email. Both are things
// other people can learn, so knowing them is not proof of ownership, and the
// merge deleted the website account's document and rewrote the app account's.
//
// Phone number is now the identity of an Operator account:
//   - signing in by phone resolves the app profile from the verified number
//     (/api/account/resolve), and
//   - Google/Apple are attached to that same Firebase user explicitly, from the
//     profile page, with linkWithPopup (components/dashboard/SignInMethods.tsx).
//
// Nothing is read or written here any more. Accounts that were already linked
// keep working untouched: `linkedWebUid` / `linkedWebUids` are still honoured by
// useAuth and /api/account/resolve. See docs/phone-first-auth.md.
//
// The route answers 410 rather than 404 so a stale browser tab or old client
// gets a clear explanation instead of a generic failure.

const RETIRED = {
  status: "retired",
  message:
    "Linking with a Support Code is no longer available. Sign in with your phone number to reach your Operator " +
    "account, then link Google or Apple from your profile.",
} as const;

export async function POST() {
  return NextResponse.json(RETIRED, { status: 410 });
}
