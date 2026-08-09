// Server-only. Creates community groups when demand is demonstrated.

import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { groupActivated } from "@/lib/email/templates";
import { ADMITTABLE_MEMBERSHIPS, COLLECTIONS } from "./constants";
import { GROUP_TARGET_PROJECT, groupsDb } from "./group-linking";
import { DEFAULT_WINDOW, nextOccurrenceUtc, serialiseWindow } from "./schedule";
import { waitlistDb } from "./server";
import { formatInZone } from "./timezone";

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
 * Resolve the Firebase uid for a registration — only from verified identity.
 *
 * The single accepted route is `testerUid`, recorded by the authenticated
 * tester flow after verifying an ID token.
 *
 * This used to also match the registration's email against the `user`
 * collection. That treated an unverified address as proof of identity: anyone
 * could register interest using a stranger's email and have that stranger
 * silently added to a group. Nobody is worse off for the removal — an account
 * holder who registered with their own address is admitted the moment they next
 * sign in, by claimGroupsForAccount, which matches on the verified email in
 * their ID token.
 */
async function resolveUid(
  entry: FirebaseFirestore.DocumentData
): Promise<string | null> {
  if (typeof entry.testerUid === "string" && entry.testerUid) {
    return entry.testerUid;
  }
  return null;
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
    const entry = doc.data();

    // Someone who withdrew interest or already left is not swept back in by a
    // later activation. Their registration still counted towards the demand
    // that opened the group — the historical record is not what is being
    // decided here.
    if (entry.communityInterestStatus === "withdrawn") continue;
    if (!ADMITTABLE_MEMBERSHIPS.includes(entry.groupMembership ?? "none")) continue;

    const uid = await resolveUid(entry);
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

    // The schedule exists from the moment the group does, but calling does not
    // begin automatically. `createdBy` here is the Operator staff member who
    // set up the demand source — not somebody who has taken responsibility for
    // running this community's calls. Until such a person exists and says so,
    // calls stay off.
    callsEnabled: false,
    callsPausedReason: "awaiting_group_admin",
    groupAdminId: null,

    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // The schedule is created immediately even though calls are off — turning
  // calls on later must not have to invent one.
  await gDb.collection("scheduledGroupCalls").add({
    groupId: groupRef.id,
    groupName: name,
    creatorId: createdByUid,
    participantIds: memberIds,
    scheduledAt: schedule.scheduleNextRunUtc,
    callType: "group",
    showUser: true,
    // "paused", not "scheduled" — defence in depth. group.callsEnabled is the
    // authoritative control, but the dispatcher lives in another codebase and
    // does not check it yet. Existing dispatch queries filter on
    // status == "scheduled", so a paused schedule is skipped by code that knows
    // nothing about callsEnabled. The schedule itself is fully preserved; only
    // its dispatch status differs, and enabling calls restores it.
    status: "paused",
    recurrence: "weekly",
    scheduleZone: window.zone,
    scheduleLocalTime: window.localTime,
    scheduleWeekday: window.weekday,
    createdFromDemand: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  // GroupAdminDashboard builds its member list from `memberships`, not from
  // memberIds, so a group created without these appears empty to its admin.
  const membershipBatch = gDb.batch();
  for (const uid of memberIds) {
    membershipBatch.set(
      gDb.collection("memberships").doc(`${groupRef.id}__${uid}`),
      {
        groupId: groupRef.id,
        userId: uid,
        // Nobody administers this group yet — createdBy is the staff member who
        // set up the demand source, not someone running the community.
        role: "member",
        status: "active",
        joinedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await membershipBatch.commit();

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

  // Tell everyone who asked to be told. Failures here must not undo the
  // activation, so this is reported rather than thrown.
  try {
    await notifyGroupActivated(demandSourceId, audience || "this interest");
  } catch (err) {
    console.error("[activation] notification failed:", err);
  }

  return {
    groupId: groupRef.id,
    interestedCount: entriesSnap.size,
    activeMemberCount,
    pendingCount: withoutUid.length,
  };
}

/**
 * Email everyone still interested in a community that its group is live.
 *
 * Records notifiedGroupLiveAt per registration before sending, so a retry after
 * a partial failure does not send twice to the people it already reached —
 * duplicate mail about the same event is the kind of thing that gets a sending
 * domain reported.
 */
export async function notifyGroupActivated(
  demandSourceId: string,
  audienceLabel: string
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!isEmailConfigured()) {
    console.warn("[activation] email not configured — nobody notified");
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const wDb = waitlistDb();
  const snap = await wDb
    .collection(COLLECTIONS.waitlistEntries)
    .where("demandSourceId", "==", demandSourceId)
    .get();

  const groupSnap = await groupsDb()
    .collection("groups")
    .doc((await wDb.collection(COLLECTIONS.demandSources).doc(demandSourceId).get())
      .data()?.groupId ?? "__none__")
    .get();
  const group = groupSnap.data();

  const window = group?.scheduleLocalTime
    ? {
        weekday: group.scheduleWeekday ?? DEFAULT_WINDOW.weekday,
        localTime: group.scheduleLocalTime as string,
        zone: (group.scheduleZone as string) ?? DEFAULT_WINDOW.zone,
      }
    : DEFAULT_WINDOW;
  const firstCall = nextOccurrenceUtc(window);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const entry = doc.data();

    // Respect every way someone can have said "stop".
    if (entry.communityInterestStatus === "withdrawn") { skipped++; continue; }
    if (entry.communityInterestStatus === "paused") { skipped++; continue; }
    if (entry.groupMembership === "left") { skipped++; continue; }
    if (entry.notifiedGroupLiveAt) { skipped++; continue; }
    if (!entry.email || !entry.manageToken) { skipped++; continue; }

    const timezone = (entry.timezone as string) || DEFAULT_WINDOW.zone;

    // Claimed before sending: a crash mid-run leaves someone un-emailed, which
    // is recoverable. The reverse leaves them emailed twice, which is not.
    await doc.ref.set(
      { notifiedGroupLiveAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    const result = await sendEmail(
      groupActivated({
        to: entry.email,
        audienceLabel,
        manageToken: entry.manageToken,
        firstCallLocal: formatInZone(firstCall, timezone),
        timezone: timezone.replace(/_/g, " "),
        needsAccount: entry.groupMembership !== "member",
      })
    );

    if (result.sent) sent++;
    else {
      failed++;
      // Let a later run retry this one.
      await doc.ref.set({ notifiedGroupLiveAt: null }, { merge: true });
    }

    // Workspace SMTP refuses bursts; pace it.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(
    `[activation] notified ${sent} for ${demandSourceId} (${failed} failed, ${skipped} skipped)`
  );
  return { sent, failed, skipped };
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
    if (!data.groupId) continue;
    // Only someone still waiting to be admitted. Never re-adds a person who
    // left the group or withdrew interest — signing up is not a request to
    // rejoin something they deliberately quit.
    if (data.groupMembership !== "eligible") continue;
    if (data.communityInterestStatus === "withdrawn") continue;

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

      await gDb
        .collection("memberships")
        .doc(`${data.groupId}__${uid}`)
        .set(
          {
            groupId: data.groupId,
            userId: uid,
            role: "member",
            status: "active",
            joinedAt: FieldValue.serverTimestamp(),
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
