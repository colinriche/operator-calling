import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { LIBRARY_IMAGE_CATEGORY_IDS } from "@/lib/waitlist/library";
import { waitlistDb } from "@/lib/waitlist/server";

// PATCH /api/admin/waitlist-library/images/[id] - rename, recategorise, archive.
//
// There is no delete. Pages that chose an image carry its URL, so removing the
// file would blank their pictures and link previews. Archiving hides it from
// the picker and leaves those pages as they are.

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

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
  };
  if (typeof body.label === "string" && body.label.trim()) {
    update.label = body.label.trim().slice(0, 120);
  }
  if (typeof body.category === "string" && LIBRARY_IMAGE_CATEGORY_IDS.includes(body.category)) {
    update.category = body.category;
  }
  if (typeof body.archived === "boolean") update.archived = body.archived;

  try {
    const ref = waitlistDb().collection(COLLECTIONS.waitlistImages).doc(id);
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ref.set(update, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/waitlist-library images PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
