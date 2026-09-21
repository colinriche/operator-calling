import { NextRequest, NextResponse, after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS, WAITLIST_DEFAULTS_DOC } from "@/lib/waitlist/constants";
import { isWordingVariant, sanitiseWording } from "@/lib/waitlist/library";
import { resolveImageChoice, resolveSocialImages } from "@/lib/waitlist/library-server";
import { warmWaitlistCard } from "@/lib/waitlist/og-card";
import { waitlistDb } from "@/lib/waitlist/server";

// PATCH /api/admin/waitlist-library/defaults
//
//   { imageChoice }                  the default picture
//   { socialImages }                 the default picture for particular networks
//   { variant, wording }             replace a variant's default wording
//   { variant, wording: null }       go back to the built-in wording
//
// Live immediately on every page that has no picture or wording of its own -
// the global page included. Pages that chose their own are untouched.

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const db = waitlistDb();
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
  };

  try {
    if (body.imageChoice !== undefined) {
      // "default" would point the default at itself, and a family's own photo
      // has no meaning outside that family.
      if (body.imageChoice === "default" || body.imageChoice === "own") {
        return NextResponse.json({ error: "Choose a specific image" }, { status: 400 });
      }
      const resolved = await resolveImageChoice(db, body.imageChoice, { allowUnset: false });
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      update.imageChoice = resolved.imageChoice;
      update.imageChoiceUrl = resolved.imageChoiceUrl;
    }

    if (body.socialImages !== undefined) {
      const resolved = await resolveSocialImages(db, body.socialImages, { forDefaults: true });
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      update.socialImages = resolved.socialImages;
      update.socialImageUrls = resolved.socialImageUrls;
    }

    if (body.variant !== undefined) {
      if (!isWordingVariant(body.variant)) {
        return NextResponse.json({ error: "Unknown kind of page" }, { status: 400 });
      }
      if (body.wording === null) {
        update[`wording.${body.variant}`] = FieldValue.delete();
      } else {
        const wording = sanitiseWording(body.wording);
        if (!wording) {
          return NextResponse.json(
            { error: "The wording needs a heading, an opening paragraph and a main paragraph" },
            { status: 400 }
          );
        }
        update[`wording.${body.variant}`] = wording;
      }
    }

    // update() rather than set-with-merge: only update() reads the dotted keys
    // as paths, which is what lets one variant change without the others.
    const ref = db.collection(COLLECTIONS.settings).doc(WAITLIST_DEFAULTS_DOC);
    if (!(await ref.get()).exists) await ref.set({ createdAt: FieldValue.serverTimestamp() });
    await ref.update(update);

    // The global page's card is the one every share without a tracked link
    // uses, so make it now rather than on the first share.
    after(() => warmWaitlistCard(null));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/waitlist-library defaults PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
