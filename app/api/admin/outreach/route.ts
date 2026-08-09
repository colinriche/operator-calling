import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import {
  OUTREACH_RECORDS_COLLECTION,
  OUTREACH_STATUSES,
  OUTREACH_TYPE_IDS,
  normaliseDestinationUrl,
} from "@/lib/waitlist/outreach";
import { toIso, waitlistDb } from "@/lib/waitlist/server";

// Outreach records — what was written, where it went, and when.
//
// No AI here by design. The record is the durable thing; a generator would only
// ever fill `generatedText`, which is why that field exists already and is
// populated from a hand-written template for now. Adding one later means adding
// a route that writes the same field, and nothing downstream changes.

export const runtime = "nodejs";

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// ─── GET — history, optionally for one source ────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const sourceId = req.nextUrl.searchParams.get("demandSourceId")?.trim();
  const checkDestination = req.nextUrl.searchParams.get("destination")?.trim();

  try {
    const db = waitlistDb();

    // "Has this exact place already had a link from us?" — asked across every
    // source, not just this one, because the same thread can be reached from
    // two different demand sources and posting twice is still posting twice.
    if (checkDestination) {
      const normalised = normaliseDestinationUrl(checkDestination);
      if (!normalised) return NextResponse.json({ priorUses: [] });

      const dupSnap = await db
        .collection(OUTREACH_RECORDS_COLLECTION)
        .where("normalisedDestination", "==", normalised)
        .limit(20)
        .get();

      return NextResponse.json({
        priorUses: dupSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            demandSourceId: d.demandSourceId ?? "",
            type: d.type ?? "",
            status: d.status ?? "draft",
            postedAt: toIso(d.postedAt),
            createdAt: toIso(d.createdAt),
          };
        }),
      });
    }
    let query = db.collection(OUTREACH_RECORDS_COLLECTION).limit(500) as
      FirebaseFirestore.Query;
    if (sourceId) {
      query = db
        .collection(OUTREACH_RECORDS_COLLECTION)
        .where("demandSourceId", "==", sourceId)
        .limit(500);
    }

    const snap = await query.get();
    const records = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        demandSourceId: d.demandSourceId ?? "",
        platformId: d.platformId ?? "",
        sourceLinkId: d.sourceLinkId ?? null,
        sourceCode: d.sourceCode ?? null,
        type: d.type ?? "public_comment",
        destinationUrl: d.destinationUrl ?? "",
        destinationTitle: d.destinationTitle ?? "",
        // The text actually used, which is what makes the history worth having.
        generatedText: d.generatedText ?? "",
        editedFinalText: d.editedFinalText ?? "",
        templateId: d.templateId ?? null,
        notes: d.notes ?? "",
        status: d.status ?? "draft",
        postedBy: d.postedBy ?? null,
        postedAt: toIso(d.postedAt),
        copiedAt: toIso(d.copiedAt),
        createdAt: toIso(d.createdAt),
        createdBy: d.createdBy ?? null,
      };
    });

    // Sorted in memory so this needs no composite index.
    records.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return NextResponse.json({ records });
  } catch (err) {
    console.error("[admin/outreach GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── POST — create a draft, after checking it is a sensible thing to do ──────

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const demandSourceId = str(body.demandSourceId, 200);
  if (!demandSourceId) {
    return NextResponse.json({ error: "Demand source is required" }, { status: 400 });
  }

  const destinationUrl = str(body.destinationUrl, 1000);
  const normalisedDestination = normaliseDestinationUrl(destinationUrl);

  try {
    const db = waitlistDb();
    const sourceSnap = await db
      .collection(COLLECTIONS.demandSources)
      .doc(demandSourceId)
      .get();
    if (!sourceSnap.exists) {
      return NextResponse.json({ error: "Demand source not found" }, { status: 404 });
    }
    const source = sourceSnap.data() ?? {};

    // Hard stop. do_not_contact is a decision someone made deliberately, and
    // the point of recording it is that it holds without anyone remembering.
    if (source.status === "do_not_contact") {
      return NextResponse.json(
        {
          error:
            "This source is marked do-not-contact. Change its status first if that is wrong.",
          blocked: "do_not_contact",
        },
        { status: 409 }
      );
    }

    const type = OUTREACH_TYPE_IDS.includes(str(body.type, 40))
      ? str(body.type, 40)
      : "public_comment";

    const ref = await db.collection(OUTREACH_RECORDS_COLLECTION).add({
      demandSourceId,
      platformId: source.platformId ?? "other",
      sourceLinkId: str(body.sourceLinkId, 200) || null,
      sourceCode: str(body.sourceCode, 40) || null,
      groupId: source.groupId ?? null,
      type,
      destinationUrl,
      normalisedDestination,
      destinationTitle: str(body.destinationTitle, 300),
      // Named for what an AI would later fill. Currently the chosen template.
      generatedText: str(body.generatedText, 5000),
      editedFinalText: str(body.editedFinalText, 5000),
      templateId: str(body.templateId, 60) || null,
      // Reserved for generator settings; unused while there is no generator.
      generationSettings: null,
      notes: str(body.notes, 2000),
      status: "draft",
      postedBy: null,
      postedAt: null,
      copiedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Bookkeeping the sources panel reads.
    await db
      .collection(COLLECTIONS.demandSources)
      .doc(demandSourceId)
      .set(
        { outreachCount: FieldValue.increment(1) },
        { merge: true }
      );

    return NextResponse.json({ id: ref.id });
  } catch (err) {
    console.error("[admin/outreach POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── PATCH — edit, mark copied, mark posted, archive ─────────────────────────

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const id = str(body.id, 200);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof body.editedFinalText === "string") {
    update.editedFinalText = str(body.editedFinalText, 5000);
  }
  if (typeof body.destinationUrl === "string") {
    const url = str(body.destinationUrl, 1000);
    update.destinationUrl = url;
    update.normalisedDestination = normaliseDestinationUrl(url);
  }
  if (typeof body.destinationTitle === "string") {
    update.destinationTitle = str(body.destinationTitle, 300);
  }
  if (typeof body.notes === "string") {
    update.notes = str(body.notes, 2000);
  }

  if (
    typeof body.status === "string" &&
    (OUTREACH_STATUSES as readonly string[]).includes(body.status)
  ) {
    update.status = body.status;

    // Copying is not posting. The system prepares text; a human decides whether
    // it ever goes anywhere, and only they can say that it did.
    if (body.status === "copied") {
      update.copiedAt = FieldValue.serverTimestamp();
    }
    if (body.status === "posted") {
      update.postedAt = FieldValue.serverTimestamp();
      update.postedBy = caller.uid;
    }
  }

  try {
    const db = waitlistDb();
    await db.collection(OUTREACH_RECORDS_COLLECTION).doc(id).set(update, { merge: true });

    // lastPostedAt drives the "posted here recently" warning.
    if (body.status === "posted") {
      const snap = await db.collection(OUTREACH_RECORDS_COLLECTION).doc(id).get();
      const sourceId = snap.data()?.demandSourceId;
      if (sourceId) {
        await db
          .collection(COLLECTIONS.demandSources)
          .doc(sourceId)
          .set({ lastPostedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/outreach PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
