import { NextRequest, NextResponse } from "next/server";
import { checkModerator } from "@/lib/admin-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { getUserModeration, ModerationRefusal, performUserAction } from "@/lib/moderation-server";

// GET  /api/admin/users/[uid]/moderation - reports received and made, warnings,
//                                          account status and the audit trail for
//                                          one Firebase UID.
// POST /api/admin/users/[uid]/moderation - act on the account outside any report:
//                                          warn | suspend | ban | unban |
//                                          unsuspend | disable_auto_calls |
//                                          enable_auto_calls.
//
// Keyed on the Firebase UID, so it works for people who have never signed into
// the website.

export const runtime = "nodejs";

type Params = { params: Promise<{ uid: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const gate = await checkModerator(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const caller = gate.caller;
  const { uid } = await params;

  try {
    return NextResponse.json(await getUserModeration(getAdminDb(), uid));
  } catch (err) {
    console.error("[admin/users/moderation GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await checkModerator(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const caller = gate.caller;
  const { uid } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // An admin cannot suspend, ban or otherwise act on themselves from here.
  if (uid === caller.uid) {
    return NextResponse.json({ error: "You can't take moderation action on your own account." }, { status: 400 });
  }

  try {
    const result = await performUserAction(
      getAdminDb(),
      uid,
      { uid: caller.uid, email: caller.email, name: caller.name },
      body
    );
    console.log(
      `[admin/users/moderation] ${caller.email} ${(body as { action?: string })?.action} on ${uid}`
    );
    return NextResponse.json({ success: true, moderation: result });
  } catch (err) {
    if (err instanceof ModerationRefusal) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/users/moderation POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
