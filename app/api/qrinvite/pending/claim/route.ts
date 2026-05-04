import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminServices() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return { db: getFirestore(), adminAuth: getAuth() };
}

// ─── POST /api/qrinvite/pending/claim ─────────────────────────────────────────
// Header: Authorization: Bearer <firebase-id-token>
//
// Called by the Flutter app after sign-up/login. Finds any pending_connections
// records saved with the user's email (entered on the install screen) and
// completes them — adding the user to the group or contact list.

interface ClaimResult {
  pendingId: string;
  success: boolean;
  type?: string;
  groupId?: string | null;
  pending?: boolean;
  alreadyMember?: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const { db, adminAuth } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const currentUserId = decoded.uid;
    const userEmail = decoded.email?.toLowerCase();

    // Phone-auth users have no email — nothing to claim
    if (!userEmail) {
      return NextResponse.json({ success: true, results: [] });
    }

    // Find pending connections saved with this email that haven't been claimed yet
    const now = new Date();
    const pendingSnap = await db
      .collection("pending_connections")
      .where("email", "==", userEmail)
      .where("status", "==", "pending")
      .get();

    if (pendingSnap.empty) {
      return NextResponse.json({ success: true, results: [] });
    }

    const results: ClaimResult[] = [];

    for (const pendingDoc of pendingSnap.docs) {
      const p = pendingDoc.data();
      const pendingId = pendingDoc.id;

      // Skip expired records
      const expiresAt: Date = p.expiresAt?.toDate?.() ?? new Date(p.expiresAt);
      if (expiresAt < now) {
        await pendingDoc.ref.update({ status: "expired" });
        continue;
      }

      // Mark as processing immediately to prevent concurrent double-claims
      await pendingDoc.ref.update({ status: "processing", claimedBy: currentUserId });

      try {
        const result = await _completeInvite(db, p.token, currentUserId);
        await pendingDoc.ref.update({
          status: result.success ? "claimed" : "failed",
          claimedAt: FieldValue.serverTimestamp(),
          claimedBy: currentUserId,
          ...(result.error ? { error: result.error } : {}),
        });
        results.push({ pendingId, ...result });
      } catch (err) {
        await pendingDoc.ref.update({ status: "pending", claimedBy: null });
        console.error("[pending/claim] completion error for", pendingId, err);
        results.push({ pendingId, success: false, error: "Server error" });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[pending/claim]", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

// ─── Shared completion logic (mirrors /api/qrinvite/complete) ─────────────────

async function _completeInvite(
  db: FirebaseFirestore.Firestore,
  token: string,
  currentUserId: string
): Promise<Omit<ClaimResult, "pendingId">> {
  // Resolve token doc from JWT payload
  const { resolveTokenDocId } = await import("@/lib/qrinvite-server");
  const docId = resolveTokenDocId(token);
  const tokenRef = db.collection("qr_tokens").doc(docId);
  const tokenSnap = await tokenRef.get();

  if (!tokenSnap.exists) return { success: false, error: "Token not found" };

  const tokenData = tokenSnap.data()!;
  const isGroupToken = !!tokenData.groupId;
  const expiresAt: Date = tokenData.expiresAt?.toDate?.() ?? new Date(tokenData.expiresAt);

  if (expiresAt < new Date()) return { success: false, error: "Invite link has expired" };
  if (!isGroupToken && tokenData.status === "used") {
    if (tokenData.usedBy === currentUserId) return { success: true };
    return { success: false, error: "This invite has already been used" };
  }
  if (tokenData.targetUserId === currentUserId) {
    return { success: false, error: "Cannot invite yourself" };
  }

  const batch = db.batch();

  if (!isGroupToken) {
    // ── Contact invite ───────────────────────────────────────────────────────
    const contactBase: Record<string, unknown> = {
      addedAt: FieldValue.serverTimestamp(),
      via: "qr_pending",
      type: tokenData.type,
    };
    if (tokenData.ctx) contactBase.ctx = tokenData.ctx;

    batch.set(
      db.collection("users").doc(currentUserId).collection("contacts").doc(tokenData.targetUserId),
      contactBase, { merge: true }
    );
    batch.set(
      db.collection("users").doc(tokenData.targetUserId).collection("contacts").doc(currentUserId),
      contactBase, { merge: true }
    );

    const [curSnap, tgtSnap] = await Promise.all([
      db.collection("user").doc(currentUserId).get(),
      db.collection("user").doc(tokenData.targetUserId).get(),
    ]);
    const curData = curSnap.data() ?? {};
    const tgtData = tgtSnap.data() ?? {};
    const curName = curData.name ?? curData.displayName ?? curData.username ?? "Someone";
    const tgtName = tgtData.name ?? tgtData.displayName ?? tokenData.targetDisplayName ?? "Someone";

    batch.set(db.collection("user").doc(currentUserId), { contactIds: FieldValue.arrayUnion(tokenData.targetUserId) }, { merge: true });
    batch.set(db.collection("user").doc(tokenData.targetUserId), { contactIds: FieldValue.arrayUnion(currentUserId) }, { merge: true });

    const requestId = `qr_${tokenData.targetUserId}_${currentUserId}`;
    batch.set(
      db.collection("friendRequests").doc(requestId),
      {
        senderId: tokenData.targetUserId,
        receiverId: currentUserId,
        senderName: tgtName,
        senderUsername: tgtData.username ?? "",
        receiverName: curName,
        receiverUsername: curData.username ?? "",
        status: "accepted",
        acceptedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        via: "qr_pending",
        type: tokenData.type,
        ...(tokenData.ctx ? { ctx: tokenData.ctx } : {}),
      },
      { merge: true }
    );
    batch.update(tokenRef, { status: "used", usedAt: FieldValue.serverTimestamp(), usedBy: currentUserId, usageCount: FieldValue.increment(1) });
    await batch.commit();
    return { success: true, type: tokenData.type };
  }

  // ── Group invite ─────────────────────────────────────────────────────────────
  const groupSnap = await db.collection("groups").doc(tokenData.groupId).get();
  if (!groupSnap.exists) return { success: false, error: "Group not found" };

  const groupData = groupSnap.data()!;
  const isPrivate: boolean = groupData.isPrivate ?? true;
  const memberIds: string[] = groupData.memberIds ?? [];

  if (memberIds.includes(currentUserId)) {
    return { success: true, type: tokenData.type, groupId: tokenData.groupId, alreadyMember: true };
  }

  let displayName = "Unknown";
  let username = "";
  try {
    const profileSnap = await db.collection("user").doc(currentUserId).get();
    if (profileSnap.exists) {
      displayName = profileSnap.data()?.displayName ?? profileSnap.data()?.name ?? "Unknown";
      username = profileSnap.data()?.username ?? "";
    }
  } catch { /* non-fatal */ }

  if (!isPrivate) {
    batch.update(db.collection("groups").doc(tokenData.groupId), {
      memberIds: FieldValue.arrayUnion(currentUserId),
      [`members.${currentUserId}`]: { name: displayName, username, joinedAt: FieldValue.serverTimestamp(), via: "qr_pending" },
    });
    const membershipId = `${tokenData.groupId}_${currentUserId}`;
    batch.set(
      db.collection("memberships").doc(membershipId),
      { groupId: tokenData.groupId, userId: currentUserId, name: displayName, username, role: "member", status: "active", joinedAt: FieldValue.serverTimestamp(), via: "qr_pending" },
      { merge: true }
    );
  } else {
    const existing = await db.collection("group_join_requests")
      .where("groupId", "==", tokenData.groupId)
      .where("requesterId", "==", currentUserId)
      .where("status", "==", "pending")
      .limit(1).get();

    if (!existing.empty) {
      batch.update(tokenRef, { usageCount: FieldValue.increment(1) });
      await batch.commit();
      return { success: true, type: tokenData.type, groupId: tokenData.groupId, pending: true };
    }

    batch.set(db.collection("group_join_requests").doc(), {
      groupId: tokenData.groupId,
      groupName: groupData.name ?? "",
      requesterId: currentUserId,
      requesterName: displayName,
      requesterUsername: username,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      via: "qr_pending",
    });
  }

  batch.update(tokenRef, { usageCount: FieldValue.increment(1), lastUsedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { success: true, type: tokenData.type, groupId: tokenData.groupId, pending: isPrivate };
}

// TypeScript needs this for the Firestore type
declare const FirebaseFirestore: { Firestore: unknown };
