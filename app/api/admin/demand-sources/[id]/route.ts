import { NextRequest, NextResponse, after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminBucket } from "@/lib/firebase-admin";
import { warmWaitlistCardsForSource } from "@/lib/waitlist/og-card";
import { deleteWaitlistCards } from "@/lib/waitlist/og-store";
import { OUTREACH_RECORDS_COLLECTION } from "@/lib/waitlist/outreach";
import {
  COLLECTIONS,
  CONNECTION_TYPE_IDS,
  DEMAND_STATUS_IDS,
  GENERAL_DEMAND_SOURCE_ID,
  PLATFORM_IDS,
  RELATIONSHIP_STATUS_IDS,
  SOURCE_TYPE_IDS,
  WAITLIST_MODE_IDS,
} from "@/lib/waitlist/constants";
import { getGlobalThreshold, waitlistDb } from "@/lib/waitlist/server";
import {
  advisoryDuplicates,
  blockingDuplicates,
  findSimilarDemandSources,
} from "@/lib/waitlist/duplicate-sources";
import { sanitiseWording } from "@/lib/waitlist/library";
import { resolveImageChoice, resolveSocialImages } from "@/lib/waitlist/library-server";
import { isTopicArtId } from "@/lib/waitlist/topic-art";

// PATCH  /api/admin/demand-sources/[id] - edit a demand source.
// DELETE /api/admin/demand-sources/[id] - remove one for good, with everything
//                                         keyed to it. See the note above it.
//
// Relationship status is settable here and nowhere else: it must be an
// explicit act by an authorised user, never inferred from traffic, signups or
// anything a visitor can influence.

export const runtime = "nodejs";

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const TEXT_FIELDS: Array<[key: string, max: number]> = [
  ["sourceName", 200],
  ["topicName", 200],
  ["sourceUrl", 1000],
  ["publicDisplayName", 200],
  ["publicAudienceLabel", 200],
  ["publicEyebrow", 80],
  ["publicDescription", 1000],
  ["familyName", 120],
  ["internalNotes", 4000],
  ["postingRules", 2000],
];

// Deliberately absent from everything below: heroImageUrl and heroImagePath.
// The hero image is only ever set by POST …/[id]/image, which requires the
// public-visibility confirmation. Accepting a URL here would be a way to put an
// image on a public page and into every link preview without anyone having
// acknowledged that it becomes public.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Archiving is the only removal this system has, and deliberately so: a
  // source is pointed at by tracked links, registrations, visits and outreach
  // history, none of which should vanish because somebody tidied a table.
  // `archive` and `unarchive` are the same status write the dropdown performs,
  // named so the intent is explicit at the call site and in the logs.
  const archiveRequested = body.archive === true;
  const unarchiveRequested = body.unarchive === true;
  if (archiveRequested && unarchiveRequested) {
    return NextResponse.json(
      { error: "Cannot archive and unarchive in the same request" },
      { status: 400 }
    );
  }

  for (const [key, max] of TEXT_FIELDS) {
    if (typeof body[key] === "string") update[key] = str(body[key], max);
  }

  // Whether tracked URLs carry the topic slug. Cosmetic, so it needs no
  // re-issuing of codes - the same links simply copy differently from now on.
  if (typeof body.includeTopicInUrl === "boolean") {
    update.includeTopicInUrl = body.includeTopicInUrl;
  }

  // Which of the three pages this source's tracked links render.
  if (
    typeof body.waitlistMode === "string" &&
    WAITLIST_MODE_IDS.includes(body.waitlistMode)
  ) {
    update.waitlistMode = body.waitlistMode;
  }

  // Whether these people already know each other. Changes only the wording;
  // an unrecognised value is ignored rather than stored, so a bad write cannot
  // leave a page claiming a relationship its audience does not have.
  if (
    typeof body.connectionType === "string" &&
    CONNECTION_TYPE_IDS.includes(body.connectionType)
  ) {
    update.connectionType = body.connectionType;
  }

  // "" clears the choice and falls back to the brand mark; anything not in the
  // curated set is ignored rather than stored and rendered as a broken hero.
  if (typeof body.topicArtId === "string") {
    if (body.topicArtId === "") update.topicArtId = "";
    else if (isTopicArtId(body.topicArtId)) update.topicArtId = body.topicArtId;
  }

  if (typeof body.platformId === "string" && PLATFORM_IDS.includes(body.platformId)) {
    update.platformId = body.platformId;
  }
  if (typeof body.sourceType === "string" && SOURCE_TYPE_IDS.includes(body.sourceType)) {
    update.sourceType = body.sourceType;
  }
  if (
    typeof body.relationshipStatus === "string" &&
    RELATIONSHIP_STATUS_IDS.includes(body.relationshipStatus)
  ) {
    update.relationshipStatus = body.relationshipStatus;
  }
  if (typeof body.status === "string" && DEMAND_STATUS_IDS.includes(body.status)) {
    update.status = body.status;
    // Reviewing a source is an action by a person - record who and when.
    if (body.status === "under_review") {
      update.reviewedAt = FieldValue.serverTimestamp();
      update.reviewedBy = caller.uid;
    }
  }

  const thresholdChanged =
    body.demandThreshold === null ||
    (typeof body.demandThreshold === "number" && body.demandThreshold > 0);
  if (thresholdChanged) {
    update.demandThreshold =
      body.demandThreshold === null
        ? null
        : Math.floor(body.demandThreshold as number);
  }

  // The source's own wording: an object to set it, null to follow the default
  // again. A template choice arrives here as the copied text, with the
  // template's name kept only so the panel can say where it came from.
  if (body.wording === null) {
    update.wording = null;
    update.wordingTemplateLabel = null;
  } else if (body.wording !== undefined) {
    const wording = sanitiseWording(body.wording);
    if (!wording) {
      return NextResponse.json(
        { error: "The wording needs a heading, an opening paragraph and a main paragraph" },
        { status: 400 }
      );
    }
    update.wording = wording;
    update.wordingTemplateLabel =
      typeof body.wordingTemplateLabel === "string" && body.wordingTemplateLabel.trim()
        ? body.wordingTemplateLabel.trim().slice(0, 120)
        : null;
  }

  try {
    const db = waitlistDb();
    const ref = db.collection(COLLECTIONS.demandSources).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existing = snap.data() ?? {};

    // The picture. A library image's URL is looked up and copied here, never
    // taken from the request - see resolveImageChoice.
    if (body.imageChoice !== undefined) {
      const resolved = await resolveImageChoice(db, body.imageChoice, { allowUnset: true });
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      update.imageChoice = resolved.imageChoice;
      update.imageChoiceUrl = resolved.imageChoiceUrl;
    }

    // Pictures for particular networks, replaced as a whole. A network left out
    // goes back to the page's picture.
    if (body.socialImages !== undefined) {
      const resolved = await resolveSocialImages(db, body.socialImages, { forDefaults: false });
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      update.socialImages = resolved.socialImages;
      update.socialImageUrls = resolved.socialImageUrls;
    }

    // Editing a name or URL onto another source's is the same mistake as
    // creating a duplicate, arrived at from the other direction - the same
    // guard the create route applies, minus this row so it cannot match itself.
    const identityEdited =
      typeof update.sourceName === "string" ||
      typeof update.sourceUrl === "string" ||
      typeof update.platformId === "string";
    let advisory: Awaited<ReturnType<typeof findSimilarDemandSources>> = [];
    if (identityEdited && body.acknowledgeDuplicates !== true) {
      const matches = await findSimilarDemandSources(db, {
        sourceName: (update.sourceName as string) ?? existing.sourceName ?? "",
        platformId: (update.platformId as string) ?? existing.platformId ?? "",
        topicName: (update.topicName as string) ?? existing.topicName ?? "",
        audienceLabel:
          (update.publicAudienceLabel as string) ??
          existing.publicAudienceLabel ??
          "",
        sourceUrl: (update.sourceUrl as string) ?? existing.sourceUrl ?? "",
        excludeId: id,
      });
      const blocking = blockingDuplicates(matches);
      if (blocking.length > 0) {
        return NextResponse.json(
          {
            error: "Another source already has this URL",
            similar: blocking,
            requiresAcknowledgement: true,
          },
          { status: 409 }
        );
      }
      // Saved, with the resemblance reported rather than enforced.
      advisory = advisoryDuplicates(matches);
    }

    if (archiveRequested) update.status = "archived";
    if (unarchiveRequested) {
      // Restore what it was before, and fall back to `researching` rather than
      // `active_waitlist` for sources archived before this was recorded:
      // unarchiving should never quietly put a live community page back in
      // front of visitors on a guess about where it used to be.
      const previous = existing.statusBeforeArchive;
      update.status =
        typeof previous === "string" &&
        previous !== "archived" &&
        DEMAND_STATUS_IDS.includes(previous)
          ? previous
          : "researching";
    }

    // Applied however the status arrived - the archive button, the status
    // dropdown in the spreadsheet, or a plain PATCH. Remembering the previous
    // status in only one of those paths is how the other one loses it.
    if (typeof update.status === "string" && update.status !== existing.status) {
      if (update.status === "archived") {
        update.statusBeforeArchive =
          typeof existing.status === "string" &&
          existing.status !== "archived" &&
          DEMAND_STATUS_IDS.includes(existing.status)
            ? existing.status
            : null;
      } else if (existing.status === "archived") {
        update.statusBeforeArchive = null;
      }
    }

    // Changing the bar re-evaluates against the signups already collected,
    // rather than waiting for the next one. Lowering it below the current count
    // should flag the source immediately; raising it above should reopen
    // collection instead of leaving it stuck at threshold_reached.
    if (thresholdChanged && !archiveRequested && !unarchiveRequested) {
      const current = existing;
      const effective =
        update.demandThreshold === null
          ? await getGlobalThreshold(db)
          : (update.demandThreshold as number);
      const met = (current.signupCount ?? 0) >= effective;

      if (met && !current.groupId) {
        update.thresholdReachedAt =
          current.thresholdReachedAt ?? FieldValue.serverTimestamp();
        // Never move a source that has already been reviewed or actioned.
        if (
          current.status === "active_waitlist" ||
          current.status === "researching"
        ) {
          update.status = "threshold_reached";
        }
      } else if (!met) {
        update.thresholdReachedAt = null;
        if (current.status === "threshold_reached") {
          update.status = "active_waitlist";
        }
      }
    }

    await ref.set(update, { merge: true });
    // Any edit can change the card - the family name, the mode, the artwork -
    // so make it now rather than on the first share, which WhatsApp will not
    // wait for. After the response, so saving is not slowed by a render.
    after(() => warmWaitlistCardsForSource(id));
    return NextResponse.json({ success: true, similar: advisory });
  } catch (err) {
    console.error("[admin/demand-sources PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── Permanent deletion ──────────────────────────────────────────────────────
//
// DELETE /api/admin/demand-sources/[id] - the source and everything keyed to
// it, gone for good.
//
// Archiving above is still the ordinary removal, and this does not replace it.
// A source is pointed at by tracked links people have already posted, by
// registrations, visits and outreach history, and none of that should vanish
// because somebody tidied a table. So this route is fenced on all four sides:
//
//   - super admin only, the same bar as permanently removing a user Archive.
//   - the source must already be archived, so deleting is a second, separate
//     decision taken after the first one has been lived with.
//   - the caller has to echo the source's name back. A request that can be
//     fired by a mis-click on the wrong row is a request that eventually is.
//   - `_general` is refused outright. It is not a source anybody created; it
//     is where registrations that arrived without a valid code are counted.
//
// What goes, in the order it goes:
//
//   1. The stored objects - the social cards under each of its codes, and the
//      family photograph. First, and allowed to fail the whole request, because
//      these are public URLs. A "deleted" source whose photograph is still
//      being served is the one outcome nobody would forgive.
//   2. Everything in Firestore keyed by demandSourceId.
//   3. The source document itself, last. A failure part-way then leaves a
//      source that is still visible and can be deleted again, rather than
//      orphaned rows nothing points at.

/** Doc ids to delete in one batch. Firestore's own limit is 500. */
const DELETE_BATCH = 400;

/**
 * Delete every document in a collection keyed to this source, and say how many.
 *
 * Paged rather than read-all-then-delete: a busy source's visits and share
 * events are unbounded, and holding all of them in memory to build one write
 * is how a tidy-up takes a function down.
 */
async function deleteByDemandSource(
  db: FirebaseFirestore.Firestore,
  collection: string,
  sourceId: string
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await db
      .collection(collection)
      .where("demandSourceId", "==", sourceId)
      .limit(DELETE_BATCH)
      .get();
    if (snap.empty) return deleted;

    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    deleted += snap.size;

    if (snap.size < DELETE_BATCH) return deleted;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req, { superAdminOnly: true });
  if (!caller) {
    return NextResponse.json(
      { error: "Only a super admin can permanently delete a source" },
      { status: 403 }
    );
  }

  const { id } = await params;

  if (id === GENERAL_DEMAND_SOURCE_ID) {
    return NextResponse.json(
      {
        error:
          "The general source counts registrations that arrived without a code, " +
          "and cannot be deleted",
      },
      { status: 400 }
    );
  }

  let body: { confirmName?: unknown };
  try {
    body = (await req.json()) as { confirmName?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const db = waitlistDb();
    const ref = db.collection(COLLECTIONS.demandSources).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const source = snap.data() ?? {};

    if (source.status !== "archived") {
      return NextResponse.json(
        { error: "Archive the source first - deleting it is a separate decision" },
        { status: 409 }
      );
    }

    const name = typeof source.sourceName === "string" ? source.sourceName : "";
    if (typeof body.confirmName !== "string" || body.confirmName.trim() !== name.trim()) {
      return NextResponse.json(
        { error: `Type the source's name exactly to confirm: ${name}` },
        { status: 400 }
      );
    }

    // Read before anything is removed: the codes name the card folders, and
    // once the links are deleted there is no way back to them.
    const links = await db
      .collection(COLLECTIONS.sourceLinks)
      .where("demandSourceId", "==", id)
      .get();
    const codes = links.docs
      .map((doc) => doc.data().sourceCode)
      .filter((code): code is string => typeof code === "string" && code !== "");

    // 1. Storage. Not swallowed - see the note above.
    let cards = 0;
    for (const code of codes) cards += await deleteWaitlistCards(code);
    const heroPath = typeof source.heroImagePath === "string" ? source.heroImagePath : "";
    if (heroPath) {
      await getAdminBucket().file(heroPath).delete({ ignoreNotFound: true });
    }
    // The whole folder, not just the current path: replacing a photograph
    // stores a new object, and an upload that failed to record itself would
    // otherwise be left behind with nothing pointing at it.
    await getAdminBucket().deleteFiles({ prefix: `waitlist-hero/${id}/` });

    // 2. Everything keyed to the source.
    const counts = {
      links: await deleteByDemandSource(db, COLLECTIONS.sourceLinks, id),
      registrations: await deleteByDemandSource(db, COLLECTIONS.waitlistEntries, id),
      visits: await deleteByDemandSource(db, COLLECTIONS.sourceVisits, id),
      shares: await deleteByDemandSource(db, COLLECTIONS.shareEvents, id),
      outreach: await deleteByDemandSource(db, OUTREACH_RECORDS_COLLECTION, id),
      cards,
    };

    // 3. The source itself.
    await ref.delete();

    // There is no undo and no archive of this, so the log is the only record
    // that it happened. Named, counted, and attributed to whoever asked.
    console.warn(
      `[admin/demand-sources DELETE] ${caller.email} permanently deleted "${name}" (${id}): ` +
        `${counts.registrations} registrations, ${counts.links} links, ${counts.visits} visits, ` +
        `${counts.shares} share events, ${counts.outreach} outreach records, ${counts.cards} cards`
    );

    return NextResponse.json({ success: true, deleted: counts });
  } catch (err) {
    console.error("[admin/demand-sources DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
