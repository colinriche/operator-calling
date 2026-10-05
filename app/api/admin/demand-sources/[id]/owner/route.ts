import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAdminActivity } from "@/lib/waitlist/admin-activity";
import { resolveAdminOwner } from "@/lib/waitlist/admin-owners";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { OUTREACH_RECORDS_COLLECTION } from "@/lib/waitlist/outreach";
import { ownerIdOf } from "@/lib/waitlist/ownership";
import { waitlistDb } from "@/lib/waitlist/server";

// POST /api/admin/demand-sources/[id]/owner - hand a source to an admin.
// Body: { ownerId } - the new owner's Firebase UID.
//
// super_admin only, enforced here from the `admins` collection. This is the one
// way ownership changes, and so the one way a record that predates ownership
// ("Unassigned (legacy)") gets an owner: somebody who can see it decides, rather
// than the system guessing from `createdBy`.
//
// The source's tracked links and outreach records follow it, so the new owner
// sees the whole piece of work and the old one stops seeing any of it.

export const runtime = "nodejs";

const BATCH = 400;

async function cascade(
  db: FirebaseFirestore.Firestore,
  collection: string,
  sourceId: string,
  owner: { ownerId: string; ownerName: string; ownerEmail: string }
): Promise<number> {
  const snap = await db.collection(collection).where("demandSourceId", "==", sourceId).get();
  for (let i = 0; i < snap.docs.length; i += BATCH) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + BATCH)) batch.set(doc.ref, owner, { merge: true });
    await batch.commit();
  }
  return snap.size;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req, { superAdminOnly: true });
  if (!caller) {
    return NextResponse.json({ error: "Only a super admin can reassign outreach work" }, { status: 403 });
  }

  const { id } = await params;

  let body: { ownerId?: unknown };
  try {
    body = (await req.json()) as { ownerId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const requested = typeof body.ownerId === "string" ? body.ownerId.trim() : "";
  if (!requested) {
    return NextResponse.json({ error: "Choose an admin" }, { status: 400 });
  }

  try {
    // The new owner is a Firebase UID, and must belong to somebody on the admins
    // list. Handing a source to anyone else would hide it from everyone but
    // super admins.
    const target = await resolveAdminOwner(requested);
    if (!target) {
      return NextResponse.json({ error: "That person is not on the admins list" }, { status: 400 });
    }
    const owner = { ownerId: target.id, ownerName: target.name, ownerEmail: target.email };

    const db = waitlistDb();
    const ref = db.collection(COLLECTIONS.demandSources).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const before = snap.data() ?? {};
    const was = ownerIdOf(before);

    await ref.set(owner, { merge: true });
    const links = await cascade(db, COLLECTIONS.sourceLinks, id, owner);
    const outreach = await cascade(db, OUTREACH_RECORDS_COLLECTION, id, owner);

    await recordAdminActivity(db, caller, {
      action: "source.reassign",
      targetType: "source",
      targetId: id,
      demandSourceId: id,
      ownerId: owner.ownerId,
      summary: `Reassigned "${before.sourceName ?? id}" from ${was ?? "unassigned (legacy)"} to ${owner.ownerName}`,
    });

    return NextResponse.json({ success: true, ...owner, links, outreach });
  } catch (err) {
    console.error("[admin/demand-sources owner POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
