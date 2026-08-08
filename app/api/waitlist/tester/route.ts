import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdTokenAnyProject } from "@/lib/firebase-admin";
import {
  COLLECTIONS,
  TESTER_CONSENT_VERSION,
} from "@/lib/waitlist/constants";
import { waitlistDb } from "@/lib/waitlist/server";
import { isValidTimezone } from "@/lib/waitlist/timezone";

// Early access tester programme.
//
// Unlike registering interest, this requires an account: testers are added to
// calling groups, and group membership is keyed on a Firebase uid. The manage
// token identifies WHICH registration is being upgraded; the ID token proves
// WHO is doing it. Both are required — the token alone must not be enough to
// attach a stranger's account to someone else's registration.

export const runtime = "nodejs";

async function findByToken(token: string) {
  const db = waitlistDb();
  const snap = await db
    .collection(COLLECTIONS.waitlistEntries)
    .where("manageToken", "==", token)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

// ─── GET — what the tester page needs to render ──────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const doc = await findByToken(token);
    if (!doc) {
      return NextResponse.json({ error: "Link not recognised" }, { status: 404 });
    }

    const data = doc.data();
    // Only what the page needs. The full email is never echoed back from a
    // bearer token — a leaked link should not also disclose the address.
    const email = (data.email ?? "") as string;
    const [local, domain] = email.split("@");
    const maskedEmail =
      local && domain ? `${local.slice(0, 2)}${"•".repeat(4)}@${domain}` : "";

    return NextResponse.json({
      maskedEmail,
      testerStatus: data.testerStatus ?? "none",
      communityInterest: data.communityInterest !== false,
      timezone: data.timezone ?? null,
      consentVersion: TESTER_CONSENT_VERSION,
    });
  } catch (err) {
    console.error("[waitlist/tester GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── POST — join the programme ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json(
      { error: "Sign in to join early access." },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const token = typeof body.manageToken === "string" ? body.manageToken.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Consent is explicit and recorded with the wording version. Without it there
  // is nothing to say what somebody actually agreed to.
  if (body.consent !== true) {
    return NextResponse.json(
      { error: "Please confirm you'd like to join." },
      { status: 400 }
    );
  }

  try {
    const identity = await verifyIdTokenAnyProject(idToken);
    if (!identity) {
      return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    }

    const doc = await findByToken(token);
    if (!doc) {
      return NextResponse.json({ error: "Link not recognised" }, { status: 404 });
    }

    const data = doc.data();

    // Rejoining after leaving is fine — it is their own decision, made here
    // rather than inferred from a resubmitted form.
    const update: Record<string, unknown> = {
      testerStatus: "active",
      testerUid: identity.uid,
      testerUidProject: identity.project,
      testerConsentAt: FieldValue.serverTimestamp(),
      testerConsentVersion: TESTER_CONSENT_VERSION,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Pin attribution at the moment of opting in, and never overwrite it if
    // they have opted in before — the first community keeps the credit.
    if (!data.testerJoinedFromSourceCode && data.sourceCode) {
      update.testerJoinedFromSourceCode = data.sourceCode;
    }

    const wasCounted = data.testerStatus === "active";
    await doc.ref.set(update, { merge: true });

    // Community attribution is untouched by any of the above — becoming a
    // tester is additive.
    if (!wasCounted && data.demandSourceId && data.demandSourceId !== "_general") {
      await waitlistDb()
        .collection(COLLECTIONS.demandSources)
        .doc(data.demandSourceId)
        .set({ testerCount: FieldValue.increment(1) }, { merge: true });
    }

    return NextResponse.json({ success: true, testerStatus: "active" });
  } catch (err) {
    console.error("[waitlist/tester POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
