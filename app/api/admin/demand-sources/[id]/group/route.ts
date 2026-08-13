import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminServices } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import {
  GROUP_TARGET_PROJECT,
  GROUP_TYPES,
  STRONG_DUPLICATE_SCORE,
  createGroupFromDemand,
  findSimilarGroups,
  groupsDb,
  listGroupsForLinking,
} from "@/lib/waitlist/group-linking";
import { waitlistDb } from "@/lib/waitlist/server";

// Demand review → create or link a group.
//
// Nothing here happens automatically. Reaching a threshold only flags a source
// for review; an authorised person makes this call.

export const runtime = "nodejs";

// ─── GET — what the reviewer needs before deciding ───────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const sourceSnap = await waitlistDb()
      .collection(COLLECTIONS.demandSources)
      .doc(id)
      .get();
    if (!sourceSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const source = sourceSnap.data() ?? {};
    const db = groupsDb();

    const [similar, groups] = await Promise.all([
      findSimilarGroups(db, {
        sourceName: source.sourceName ?? "",
        topicName: source.topicName ?? "",
        audienceLabel: source.publicAudienceLabel ?? "",
      }),
      listGroupsForLinking(db),
    ]);

    return NextResponse.json({
      similar,
      groups,
      strongDuplicateScore: STRONG_DUPLICATE_SCORE,
      groupProject: GROUP_TARGET_PROJECT,
      suggestedName:
        source.publicDisplayName || source.topicName || source.sourceName || "",
    });
  } catch (err) {
    console.error("[admin/demand-sources group GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── POST — create a new group, or link an existing one ──────────────────────

export async function POST(
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

  const action = body.action === "link" ? "link" : "create";

  try {
    const wDb = waitlistDb();
    const sourceRef = wDb.collection(COLLECTIONS.demandSources).doc(id);
    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const source = sourceSnap.data() ?? {};

    // Linking twice would orphan the first group and quietly move the
    // attribution history onto the second.
    if (source.groupId) {
      return NextResponse.json(
        { error: "This source is already linked to a group." },
        { status: 409 }
      );
    }

    const gDb = groupsDb();
    let groupId: string;
    let status: string;

    if (action === "link") {
      const target = typeof body.groupId === "string" ? body.groupId.trim() : "";
      if (!target) {
        return NextResponse.json({ error: "Group id is required" }, { status: 400 });
      }
      const groupSnap = await gDb.collection("groups").doc(target).get();
      if (!groupSnap.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      groupId = target;
      status = "linked_to_existing_group";
    } else {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
      if (!name) {
        return NextResponse.json({ error: "Group name is required" }, { status: 400 });
      }

      // Server-side duplicate guard. The UI shows these first, but a reviewer
      // must still consciously override rather than have the check be advisory
      // on the client only.
      if (body.acknowledgeDuplicates !== true) {
        const similar = await findSimilarGroups(gDb, {
          sourceName: source.sourceName ?? "",
          topicName: source.topicName ?? "",
          audienceLabel: source.publicAudienceLabel ?? "",
        });
        const strong = similar.filter((s) => s.score >= STRONG_DUPLICATE_SCORE);
        if (strong.length > 0) {
          return NextResponse.json(
            {
              error: "Possible duplicate group",
              similar: strong,
              requiresAcknowledgement: true,
            },
            { status: 409 }
          );
        }
      }

      // The name on the admin record is the authoritative one. The legacy
      // `user` document is only consulted for callers who arrived through the
      // transitional path, and only to pick up a username.
      let creatorName = caller.name || "Unknown";
      let creatorUsername = "";
      if (caller.profileDocId) {
        try {
          const { db: userDb } = getAdminServices();
          const userSnap = await userDb.collection("user").doc(caller.profileDocId).get();
          if (userSnap.exists) {
            creatorName =
              userSnap.data()?.displayName ?? userSnap.data()?.name ?? creatorName;
            creatorUsername = userSnap.data()?.username ?? "";
          }
        } catch {
          // Non-fatal — a missing display name should not block group creation.
        }
      }

      const type =
        typeof body.type === "string" &&
        (GROUP_TYPES as readonly string[]).includes(body.type)
          ? body.type
          : "general";

      groupId = await createGroupFromDemand(gDb, {
        name,
        description:
          typeof body.description === "string"
            ? body.description.trim().slice(0, 1000)
            : "",
        isPrivate: body.isPrivate !== false,
        type,
        creatorUid: caller.uid,
        creatorName,
        creatorUsername,
      });
      status = "group_created";
    }

    // Attribution and outreach history stay on the demand source — linking adds
    // the group, it never replaces what came before.
    await sourceRef.set(
      {
        groupId,
        groupProject: GROUP_TARGET_PROJECT,
        status,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: caller.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      groupId,
      status,
      groupProject: GROUP_TARGET_PROJECT,
    });
  } catch (err) {
    console.error("[admin/demand-sources group POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
