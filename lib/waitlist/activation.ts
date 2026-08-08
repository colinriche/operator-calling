// Server-only. Creates community groups when demand is demonstrated.

import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";
import { COLLECTIONS } from "./constants";
import { GROUP_TARGET_PROJECT, groupsDb } from "./group-linking";
import { DEFAULT_WINDOW, serialiseWindow } from "./schedule";
import { waitlistDb } from "./server";

// ─── Activating a community group ────────────────────────────────────────────
//
// A threshold means enough demonstrated interest to open the group — not that
// that many people are immediately callable. Most registrants have no account,
// because registering interest deliberately does not require one.
//
// So activation creates the group, admits everyone who already has a uid, and
// keeps the rest attached as eligible registrants who are linked in
// automatically once they create an account. Becoming a tester is one way to
// acquire a uid, never a requirement for community membership.

export interface ActivationResult {
  groupId: string;
  interestedCount: number;
  activeMemberCount: number;
  pendingCount: number;
}

/**
 * Resolve the Firebase uid for a registration, if the person has an account.
 *
 * Two routes: they joined the tester programme (which requires signing in and
 * records the uid), or they registered interest with an address that already
 * has an account.
 */
async function resolveUid(
  entry: FirebaseFirestore.DocumentData
): Promise<string | null> {
  if (typeof entry.testerUid === "string" && entry.testerUid) {
    return entry.testerUid;
  }

  const email = entry.normalisedEmail as string | undefined;
  if (!email) return null;

  try {
    const { db } = getAdminServices();
    const snap = await db
      .collection("user")
      .where("email", "==", email)
      .limit(1)
      .get();
    return snap.empty ? null : snap.docs[0].id;
  } catch (err) {
    console.error("[activation] uid lookup failed:", err);
    return null;
  }
}

/**
 * Create the community group for a demand source and admit whoever can be
 * admitted. Idempotent: a source that already has a groupId is left alone, so a
 * repeated threshold evaluation cannot produce a second group.
 */
export async function activateCommunityGroup(
  demandSourceId: string,
  createdByUid: string
): Promise<ActivationResult | null> {
  const wDb = waitlistDb();
  const sourceRef = wDb.collection(COLLECTIONS.demandSources).doc(demandSourceId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) return null;

  const source = sourceSnap.data() ?? {};
  if (source.groupId) return null;

  const name =
    (source.publicDisplayName || source.topicName || source.sourceName || "")
      .toString()
      .trim() || "Operator calling group";

  const audience =
    source.publicAudienceLabel || source.topicName || source.sourceName || "";

  // Everyone who registered interest in this community.
  const entriesSnap = await wDb
    .collection(COLLECTIONS.waitlistEntries)
    .where("demandSourceId", "==", demandSourceId)
    .get();

  const withUid: Array<{ ref: FirebaseFirestore.DocumentReference; uid: string }> = [];
  const withoutUid: FirebaseFirestore.DocumentReference[] = [];

  for (const doc of entriesSnap.docs) {
    const uid = await resolveUid(doc.data());
    if (uid) withUid.push({ ref: doc.ref, uid });
    else withoutUid.push(doc.ref);
  }

  // The creating admin is always a member, so the group has an owner who can
  // set schedules — otherwise a group of accountless registrants is inert.
  const memberIds = Array.from(
    new Set([createdByUid, ...withUid.map((m) => m.uid)])
  );

  const gDb = groupsDb();
  const groupRef = gDb.collection("groups").doc();
  const window = DEFAULT_WINDOW;
  const schedule = serialiseWindow(window);

  const members: Record<string, unknown> = {};
  for (const uid of memberIds) {
    members[uid] = { joinedAt: FieldValue.serverTimestamp() };
  }

  await groupRef.set({
    name,
    description: audience
      ? `Calling group for people interested in ${audience}.`
      : "",
    isPrivate: true,
    type: "general",
    createdBy: createdByUid,
    memberIds,
    members,
    tags: [],
    // Provenance, so a group created from demand can always be traced back.
    demandSourceId,
    createdFromDemand: true,
    ...schedule,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // A concrete first call, so the group is something to turn up to rather than
  // an empty room.
  await gDb.collection("scheduledGroupCalls").add({
    groupId: groupRef.id,
    groupName: name,
    creatorId: createdByUid,
    participantIds: memberIds,
    scheduledAt: schedule.scheduleNextRunUtc,
    callType: "group",
    showUser: true,
    status: "scheduled",
    recurrence: "weekly",
    scheduleZone: window.zone,
    scheduleLocalTime: window.localTime,
    scheduleWeekday: window.weekday,
    createdFromDemand: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Mark registrations. Those with accounts are members; the rest stay attached
  // as eligible, to be linked in when they sign up.
  const batch = wDb.batch();
  for (const { ref } of withUid) {
    batch.set(
      ref,
      { groupId: groupRef.id, groupMembership: "member" },
      { merge: true }
    );
  }
  for (const ref of withoutUid) {
    batch.set(
      ref,
      { groupId: groupRef.id, groupMembership: "eligible" },
      { merge: true }
    );
  }
  await batch.commit();

  const activeMemberCount = memberIds.length;
  await sourceRef.set(
    {
      groupId: groupRef.id,
      groupProject: GROUP_TARGET_PROJECT,
      status: "group_created",
      autoCreatedGroupAt: FieldValue.serverTimestamp(),
      // Created without a human in the loop, so it is queued for a look
      // afterwards rather than trusted blindly.
      reviewRequiredAfterCreate: true,
      activeMemberCount,
      pendingMemberCount: withoutUid.length,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    groupId: groupRef.id,
    interestedCount: entriesSnap.size,
    activeMemberCount,
    pendingCount: withoutUid.length,
  };
}

/**
 * Link a newly-created account into any active community group they had already
 * registered interest in.
 *
 * Called after sign-in. Someone who expressed interest weeks before the group
 * existed should not have to do anything else to end up in it.
 */
export async function claimGroupsForAccount(
  uid: string,
  email: string | null
): Promise<{ joined: string[] }> {
  if (!email) return { joined: [] };

  const wDb = waitlistDb();
  const snap = await wDb
    .collection(COLLECTIONS.waitlistEntries)
    .where("normalisedEmail", "==", email.toLowerCase())
    .get();

  const joined: string[] = [];
  const gDb = groupsDb();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.groupId || data.groupMembership === "member") continue;

    try {
      await gDb
        .collection("groups")
        .doc(data.groupId)
        .set(
          {
            memberIds: FieldValue.arrayUnion(uid),
            [`members.${uid}`]: { joinedAt: FieldValue.serverTimestamp() },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      await doc.ref.set(
        { groupMembership: "member", groupJoinedUid: uid },
        { merge: true }
      );

      if (data.demandSourceId && data.demandSourceId !== "_general") {
        await wDb
          .collection(COLLECTIONS.demandSources)
          .doc(data.demandSourceId)
          .set(
            {
              activeMemberCount: FieldValue.increment(1),
              pendingMemberCount: FieldValue.increment(-1),
            },
            { merge: true }
          );
      }

      joined.push(data.groupId);
    } catch (err) {
      console.error(`[activation] failed linking ${uid} into ${data.groupId}:`, err);
    }
  }

  return { joined };
}
