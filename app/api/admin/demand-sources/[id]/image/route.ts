import { NextRequest, NextResponse, after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { warmWaitlistCardsForSource } from "@/lib/waitlist/og-card";
import { getAdminBucket } from "@/lib/firebase-admin";
import { sniffImageType, storePublicImage } from "@/lib/waitlist/image-upload";
import {
  COLLECTIONS,
  HERO_IMAGE_MAX_BYTES,
  HERO_IMAGE_TYPES,
} from "@/lib/waitlist/constants";
import { waitlistDb } from "@/lib/waitlist/server";

// ─── The family hero image ───────────────────────────────────────────────────
//
// POST   /api/admin/demand-sources/[id]/image   upload or replace
// DELETE /api/admin/demand-sources/[id]/image   remove
//
// The uploaded file is served from a Firebase Storage download URL, which is
// public by construction — a link-preview crawler has no account and no way to
// authenticate, so an image that appears in a preview is an image anyone can
// fetch. That is not a detail to bury in a tooltip, so this route refuses an
// upload that does not carry `confirmedPublic`. The checkbox in the admin panel
// is the same decision, but the server does not take the panel's word for it:
// a request made any other way faces the same requirement.

export const runtime = "nodejs";

/** Best-effort removal of a replaced or deleted object. */
async function removeObject(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await getAdminBucket().file(path).delete({ ignoreNotFound: true });
  } catch (err) {
    // The document is the record of what is current. An orphaned object costs
    // storage; a failed request here would cost the admin their upload.
    console.error("[admin/demand-sources image] delete failed:", err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload" }, { status: 400 });
  }

  if (form.get("confirmedPublic") !== "true") {
    return NextResponse.json(
      {
        error:
          "This image will be publicly visible to anyone with the link. Confirm that before uploading.",
      },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image was attached" }, { status: 400 });
  }
  if (file.size > HERO_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${HERO_IMAGE_MAX_BYTES / 1024 / 1024}MB.`,
      },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType || !(HERO_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return NextResponse.json(
      { error: "That file is not a JPEG, PNG or WebP image." },
      { status: 400 }
    );
  }

  try {
    const db = waitlistDb();
    const ref = db.collection(COLLECTIONS.demandSources).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { path, url: heroImageUrl } = await storePublicImage(
      `waitlist-hero/${id}`,
      bytes,
      contentType
    );

    const previousPath = snap.data()?.heroImagePath as string | undefined;

    await ref.set(
      {
        heroImageUrl,
        heroImagePath: path,
        heroImageUploadedAt: FieldValue.serverTimestamp(),
        heroImageUploadedBy: caller.uid,
        // Recorded, not just enforced: who accepted that this picture would be
        // public, and when, is worth being able to answer later.
        heroImagePublicConfirmedAt: FieldValue.serverTimestamp(),
        heroImagePublicConfirmedBy: caller.uid,
        // Uploading a family's photograph is choosing it. Without this, a page
        // whose picture had been set explicitly would keep that and hide the
        // photograph just uploaded.
        imageChoice: "own",
        imageChoiceUrl: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await removeObject(previousPath);

    // The new photograph is a new card. Made now, so the first share of the
    // link is not the request that has to wait for it.
    after(() => warmWaitlistCardsForSource(id));

    return NextResponse.json({ heroImageUrl });
  } catch (err) {
    console.error("[admin/demand-sources image POST]", err);
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
    const db = waitlistDb();
    const ref = db.collection(COLLECTIONS.demandSources).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Cleared first: the page and its preview must stop pointing at the image
    // even if removing the object itself fails.
    await ref.set(
      {
        heroImageUrl: null,
        heroImagePath: null,
        heroImageUploadedAt: null,
        heroImageUploadedBy: null,
        heroImagePublicConfirmedAt: null,
        heroImagePublicConfirmedBy: null,
        // A page pointing at the photograph just removed goes back to the
        // default rather than pointing at nothing.
        ...(snap.data()?.imageChoice === "own" ? { imageChoice: "", imageChoiceUrl: null } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await removeObject(snap.data()?.heroImagePath as string | undefined);

    after(() => warmWaitlistCardsForSource(id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/demand-sources image DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
