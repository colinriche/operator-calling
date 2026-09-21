import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import type { LibraryImageRow, WordingTemplateRow } from "@/lib/waitlist/library";
import { libraryImageRow, wordingTemplateRow } from "@/lib/waitlist/library-server";
import { getWaitlistDefaults, waitlistDb } from "@/lib/waitlist/server";

// GET /api/admin/waitlist-library - every uploaded image (archived included, so
// a page still showing one can name it), every wording template, and the
// current defaults. One request, because every picker needs all three.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    const db = waitlistDb();
    const [imageSnap, templateSnap, defaults] = await Promise.all([
      db.collection(COLLECTIONS.waitlistImages).get(),
      db.collection(COLLECTIONS.waitlistWordingTemplates).get(),
      getWaitlistDefaults(db),
    ]);

    const images = imageSnap.docs
      .map(libraryImageRow)
      .filter((row): row is LibraryImageRow => row !== null)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    const templates = templateSnap.docs
      .map(wordingTemplateRow)
      .filter((row): row is WordingTemplateRow => row !== null)
      .sort((a, b) => a.label.localeCompare(b.label));

    return NextResponse.json({ images, templates, defaults });
  } catch (err) {
    console.error("[admin/waitlist-library GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
