import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { COLLECTIONS, LINK_STATUSES } from "@/lib/waitlist/constants";
import { createUniqueSourceCode, waitlistDb } from "@/lib/waitlist/server";
import { buildTrackedUrl } from "@/lib/waitlist/tracked-url";

// Tracked links — admin or super_admin.
//
// One source can carry many links: a separate link per post, comment or message
// is what makes per-outreach performance visible rather than just a single
// lump figure for the whole audience.

export const runtime = "nodejs";

function originFrom(req: NextRequest): string {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://operatorcalling.com";
}

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

  const demandSourceId =
    typeof body.demandSourceId === "string" ? body.demandSourceId.trim() : "";
  if (!demandSourceId) {
    return NextResponse.json({ error: "Demand source is required" }, { status: 400 });
  }

  try {
    const db = waitlistDb();
    const sourceSnap = await db
      .collection(COLLECTIONS.demandSources)
      .doc(demandSourceId)
      .get();
    if (!sourceSnap.exists) {
      return NextResponse.json({ error: "Demand source not found" }, { status: 404 });
    }

    const sourceData = sourceSnap.data() ?? {};
    const sourceCode = await createUniqueSourceCode(db);

    const ref = await db.collection(COLLECTIONS.sourceLinks).add({
      sourceCode,
      platformId: sourceData.platformId ?? "other",
      demandSourceId,
      outreachId: null,
      groupId: sourceData.groupId ?? null,
      formType: "waitlist",
      status: "active",
      label:
        typeof body.label === "string"
          ? body.label.trim().slice(0, 120)
          : "Tracked link",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid,
      firstUsedAt: null,
      lastUsedAt: null,
      totalVisitCount: 0,
      uniqueVisitCount: 0,
      signupCount: 0,
      organiserInterestCount: 0,
      shareClickCount: 0,
    });

    return NextResponse.json({
      id: ref.id,
      sourceCode,
      trackedUrl: buildTrackedUrl(originFrom(req), sourceCode, sourceData),
    });
  } catch (err) {
    console.error("[admin/source-links POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH — pause, archive or relabel an existing link.
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

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Link id is required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (
    typeof body.status === "string" &&
    (LINK_STATUSES as readonly string[]).includes(body.status)
  ) {
    update.status = body.status;
  }
  if (typeof body.label === "string") {
    update.label = body.label.trim().slice(0, 120);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const db = waitlistDb();
    await db.collection(COLLECTIONS.sourceLinks).doc(id).set(update, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/source-links PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
