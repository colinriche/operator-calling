import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { isWordingVariant, sanitiseWording } from "@/lib/waitlist/library";
import { wordingTemplateRow } from "@/lib/waitlist/library-server";
import { waitlistDb } from "@/lib/waitlist/server";

// POST /api/admin/waitlist-library/templates — save wording as a template.
//
// A template is a starting point. Choosing one copies its text into a source,
// so nothing here reaches a page until someone chooses it.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 120) : "";
  const wording = sanitiseWording(body?.wording);

  if (!label) {
    return NextResponse.json({ error: "Give the template a name" }, { status: 400 });
  }
  if (!isWordingVariant(body?.variant)) {
    return NextResponse.json({ error: "Unknown kind of page" }, { status: 400 });
  }
  if (!wording) {
    return NextResponse.json(
      { error: "A template needs a heading, an opening paragraph and a main paragraph" },
      { status: 400 }
    );
  }

  try {
    const ref = waitlistDb().collection(COLLECTIONS.waitlistWordingTemplates).doc();
    await ref.set({
      label,
      variant: body.variant,
      wording,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ template: wordingTemplateRow(await ref.get()) });
  } catch (err) {
    console.error("[admin/waitlist-library templates POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
