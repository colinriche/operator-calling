import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminBucket } from "@/lib/firebase-admin";
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

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The real type of the bytes, not the type the browser claimed.
 *
 * A declared content-type is caller-supplied. Storing whatever arrives under an
 * image/* label and then serving it from a public URL is how an "image upload"
 * quietly becomes file hosting.
 */
function sniff(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

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
  const contentType = sniff(bytes);
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

    const bucket = getAdminBucket();
    // A random name per upload rather than a stable one: replacing the image
    // must produce a new URL, or every crawler that cached the old preview
    // would keep serving the picture the admin just took down.
    const path = `waitlist-hero/${id}/${randomUUID()}.${EXTENSIONS[contentType]}`;
    const downloadToken = randomUUID();

    await bucket.file(path).save(Buffer.from(bytes), {
      contentType,
      metadata: {
        contentType,
        cacheControl: "public, max-age=3600",
        // The download token is what makes the object readable without a
        // signed request, and without touching the shared Storage ruleset.
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const heroImageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;

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
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await removeObject(previousPath);

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
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await removeObject(snap.data()?.heroImagePath as string | undefined);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/demand-sources image DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
