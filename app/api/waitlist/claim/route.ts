import { NextRequest, NextResponse } from "next/server";
import { verifyIdTokenAnyProject } from "@/lib/firebase-admin";
import { claimGroupsForAccount } from "@/lib/waitlist/activation";

// POST /api/waitlist/claim
//
// Links a signed-in account into any community group it had already registered
// interest in before having an account.
//
// A group activates on demonstrated demand, which mostly comes from people
// without accounts. When one of them signs up later, they should land in the
// group without having to find it — the interest was already expressed.
//
// Matching is on the verified email from the ID token, never on anything the
// caller sends, so nobody can claim a stranger's registration.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const identity = await verifyIdTokenAnyProject(idToken);
    if (!identity) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const result = await claimGroupsForAccount(identity.uid, identity.email);
    return NextResponse.json({ joined: result.joined });
  } catch (err) {
    console.error("[waitlist/claim]", err);
    // Never surface this to a user mid sign-in — it is a background nicety.
    return NextResponse.json({ joined: [] });
  }
}
