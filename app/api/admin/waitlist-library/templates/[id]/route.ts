import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { sanitiseWording } from "@/lib/waitlist/library";
import { waitlistDb } from "@/lib/waitlist/server";

// PATCH  /api/admin/waitlist-library/templates/[id] — rename or rewrite
// DELETE /api/admin/waitlist-library/templates/[id]
//
// Safe to change or delete at any time: sources hold their own copy of the
// text, so no live page reads a template.

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof body.label === "string" && body.label.trim()) {
    update.label = body.label.trim().slice(0, 120);
  }
  if (body.wording !== undefined) {
    const wording = sanitiseWording(body.wording);
    if (!wording) {
      return NextResponse.json(
        { error: "A template needs a heading, an opening paragraph and a main paragraph" },
        { status: 400 }
      );
    }
    update.wording = wording;
  }

  try {
    const ref = waitlistDb().collection(COLLECTIONS.waitlistWordingTemplates).doc(id);
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ref.set(update, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/waitlist-library templates PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await waitlistDb().collection(COLLECTIONS.waitlistWordingTemplates).doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/waitlist-library templates DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
