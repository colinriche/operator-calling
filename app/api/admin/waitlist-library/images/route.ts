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
import {
  IMAGE_EXTENSIONS,
  sniffImageType,
  storePublicImage,
} from "@/lib/waitlist/image-upload";
import { LIBRARY_IMAGE_CATEGORY_IDS } from "@/lib/waitlist/library";
import { libraryImageRow } from "@/lib/waitlist/library-server";
import { waitlistDb } from "@/lib/waitlist/server";

// ─── Adding to the image library ─────────────────────────────────────────────
//
// POST /api/admin/waitlist-library/images
//
//   multipart  file, label, category, confirmedPublic=true   upload a new image
//   JSON       { fromSourceId, label, category }             add a family's own
//                                                            photograph
//
// Every library image can be put on any page, including pages posted to public
// forums, so an upload needs the same public-visibility confirmation as a
// family photograph - enforced here, not only by the checkbox.
//
// A family photograph is copied rather than referenced. The family's own
// upload is deleted when the family replaces or removes it, and that must not
// break every other page that chose it from the library.

export const runtime = "nodejs";

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function category(value: unknown): string {
  const id = str(value, 40);
  return LIBRARY_IMAGE_CATEGORY_IDS.includes(id) ? id : "general";
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const db = waitlistDb();
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");

  try {
    let label: string;
    let imageCategory: string;
    let stored: { path: string; url: string };
    let fromSourceId: string | null = null;

    if (isJson) {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      fromSourceId = str(body?.fromSourceId, 200);
      if (!fromSourceId) {
        return NextResponse.json({ error: "Nothing to add" }, { status: 400 });
      }
      const sourceSnap = await db
        .collection(COLLECTIONS.demandSources)
        .doc(fromSourceId)
        .get();
      const path = sourceSnap.data()?.heroImagePath;
      if (typeof path !== "string" || !path) {
        return NextResponse.json(
          { error: "That source has no uploaded photograph" },
          { status: 400 }
        );
      }

      const [bytes] = await getAdminBucket().file(path).download();
      const contentType = sniffImageType(bytes);
      if (!contentType || !IMAGE_EXTENSIONS[contentType]) {
        return NextResponse.json({ error: "That photograph is not a usable image" }, { status: 400 });
      }
      stored = await storePublicImage("waitlist-library", bytes, contentType);
      label = str(body?.label, 120) || str(sourceSnap.data()?.familyName, 120) || "Family photograph";
      imageCategory = category(body?.category ?? "family");
    } else {
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
              "This image will be publicly visible to anyone with a link to a page that uses it. Confirm that before uploading.",
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

      label = str(form.get("label"), 120) || file.name.replace(/\.[^.]+$/, "").slice(0, 120);
      imageCategory = category(form.get("category"));
      stored = await storePublicImage("waitlist-library", bytes, contentType);
    }

    const ref = db.collection(COLLECTIONS.waitlistImages).doc(randomUUID());
    await ref.set({
      label: label || "Untitled image",
      category: imageCategory,
      url: stored.url,
      path: stored.path,
      archived: false,
      fromSourceId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      // Who accepted that this picture would be public, and when. For a copied
      // family photograph, adding it is that decision.
      publicConfirmedAt: FieldValue.serverTimestamp(),
      publicConfirmedBy: caller.uid,
    });

    const row = libraryImageRow(await ref.get());
    return NextResponse.json({ image: row });
  } catch (err) {
    console.error("[admin/waitlist-library images POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
