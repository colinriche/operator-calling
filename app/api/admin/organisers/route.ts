import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminServices } from "@/lib/firebase-admin";
import { COLLECTIONS, ORGANISER_STATUSES } from "@/lib/waitlist/constants";
import { groupsDb } from "@/lib/waitlist/group-linking";
import { toIso, waitlistDb } from "@/lib/waitlist/server";

// People who offered to help organise calls, and where they are in review.
//
// Review state lives on the waitlist entry rather than in a second collection:
// the entry already holds the person, their community and their attribution,
// and splitting them would mean keeping two records in step for no gain.
//
// Nothing here grants anything. Appointment is a separate, explicit act via
// /api/admin/groups/[id]/admin.

export const runtime = "nodejs";

export interface OrganiserRow {
  id: string;
  email: string;
  displayName: string;
  country: string;
  timezone: string | null;
  createdAt: string | null;

  demandSourceId: string;
  sourceName: string;
  audienceLabel: string;
  sourceUrl: string;
  groupId: string | null;
  groupName: string | null;
  /** Whether that group already has someone administering it. */
  groupAdminId: string | null;

  organiserStatus: string;
  claimsToRunSource: boolean;
  claimVerified: boolean;
  organiserNotes: string;
  organiserReviewedAt: string | null;

  /** Whether an Operator account exists for this address — appointment needs one. */
  hasAccount: boolean;
  accountUid: string | null;
  /** True when they are already the admin of their community's group. */
  isGroupAdmin: boolean;
}

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    const wDb = waitlistDb();
    const snap = await wDb
      .collection(COLLECTIONS.waitlistEntries)
      .where("interestedInOrganising", "==", true)
      .get();

    // Batch the lookups these rows need rather than querying per row.
    const sourceIds = new Set<string>();
    const emails = new Set<string>();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.demandSourceId && d.demandSourceId !== "_general") {
        sourceIds.add(d.demandSourceId);
      }
      if (d.normalisedEmail) emails.add(d.normalisedEmail as string);
    }

    const sources = new Map<string, FirebaseFirestore.DocumentData>();
    await Promise.all(
      [...sourceIds].map(async (id) => {
        const s = await wDb.collection(COLLECTIONS.demandSources).doc(id).get();
        if (s.exists) sources.set(id, s.data() ?? {});
      })
    );

    const groups = new Map<string, FirebaseFirestore.DocumentData>();
    const gDb = groupsDb();
    await Promise.all(
      [...sources.values()]
        .map((s) => s.groupId as string | undefined)
        .filter((v): v is string => !!v)
        .map(async (gid) => {
          const g = await gDb.collection("groups").doc(gid).get();
          if (g.exists) groups.set(gid, g.data() ?? {});
        })
    );

    // Accounts live in the dev project alongside sign-in.
    const { db: devDb } = getAdminServices();
    const accounts = new Map<string, string>();
    await Promise.all(
      [...emails].map(async (email) => {
        const u = await devDb
          .collection("user")
          .where("email", "==", email)
          .limit(1)
          .get();
        if (!u.empty) accounts.set(email, u.docs[0].id);
      })
    );

    const rows: OrganiserRow[] = snap.docs.map((doc) => {
      const d = doc.data();
      const source = sources.get(d.demandSourceId) ?? {};
      const groupId = (source.groupId as string) ?? null;
      const group = groupId ? groups.get(groupId) : undefined;
      const email = (d.normalisedEmail as string) ?? "";
      const accountUid = accounts.get(email) ?? null;

      return {
        id: doc.id,
        email: (d.email as string) ?? "",
        displayName: (d.displayName as string) ?? "",
        country: (d.country as string) ?? "",
        timezone: (d.timezone as string) ?? null,
        createdAt: toIso(d.createdAt),

        demandSourceId: (d.demandSourceId as string) ?? "",
        sourceName: (source.sourceName as string) ?? "General waitlist",
        audienceLabel: (source.publicAudienceLabel as string) ?? "",
        sourceUrl: (source.sourceUrl as string) ?? "",
        groupId,
        groupName: (group?.name as string) ?? null,
        groupAdminId: (group?.groupAdminId as string) ?? null,

        organiserStatus: (d.organiserStatus as string) ?? "new",
        claimsToRunSource: d.claimsToRunSource === true,
        claimVerified: d.claimVerified === true,
        organiserNotes: (d.organiserNotes as string) ?? "",
        organiserReviewedAt: toIso(d.organiserReviewedAt),

        hasAccount: !!accountUid,
        accountUid,
        isGroupAdmin: !!accountUid && group?.groupAdminId === accountUid,
      };
    });

    rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return NextResponse.json({ organisers: rows });
  } catch (err) {
    console.error("[admin/organisers GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── PATCH — record review progress ──────────────────────────────────────────

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
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: Record<string, unknown> = {
    organiserReviewedAt: FieldValue.serverTimestamp(),
    organiserReviewedBy: caller.uid,
  };

  if (
    typeof body.organiserStatus === "string" &&
    (ORGANISER_STATUSES as readonly string[]).includes(body.organiserStatus)
  ) {
    update.organiserStatus = body.organiserStatus;
  }

  // What they say about themselves, kept apart from what we confirmed.
  if (typeof body.claimsToRunSource === "boolean") {
    update.claimsToRunSource = body.claimsToRunSource;
  }
  if (typeof body.claimVerified === "boolean") {
    update.claimVerified = body.claimVerified;
    if (body.claimVerified) {
      update.claimVerifiedBy = caller.uid;
      update.claimVerifiedAt = FieldValue.serverTimestamp();
    }
  }
  if (typeof body.organiserNotes === "string") {
    update.organiserNotes = body.organiserNotes.slice(0, 4000);
  }

  try {
    await waitlistDb()
      .collection(COLLECTIONS.waitlistEntries)
      .doc(id)
      .set(update, { merge: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/organisers PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
