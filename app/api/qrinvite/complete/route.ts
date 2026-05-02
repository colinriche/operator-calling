import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { CompleteResponse } from "@/lib/qrinvite";
import { resolveTokenDocId } from "@/lib/qrinvite-server";

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

// ─── POST /api/qrinvite/complete ─────────────────────────────────────────────
// Body: { token: string, currentUserId: string }
// Header: Authorization: Bearer <firebase-id-token>
//
// Group tokens are multi-use: any number of users may scan the same QR code
// until it expires. Only usageCount is incremented on each successful scan;
// the token status stays "active".
//
// Personal/contact tokens (no groupId) are single-use: the token is marked
// "used" after the first scan so the contact is only added once.

export async function POST(req: NextRequest): Promise<NextResponse<CompleteResponse>> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "").trim();

  if (!idToken) {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  let body: { token?: string; currentUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const { token, currentUserId } = body;
  if (!token || !currentUserId) {
    return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
  }

  try {
    const { db, adminAuth } = getAdminServices();

    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.uid !== currentUserId) {
      return NextResponse.json({ success: false, error: "Identity mismatch" }, { status: 403 });
    }

    const docId = resolveTokenDocId(token);
    const tokenRef = db.collection("qr_tokens").doc(docId);
    const tokenSnap = await tokenRef.get();

    if (!tokenSnap.exists) {
      return NextResponse.json({ success: false, error: "Token not found" }, { status: 404 });
    }

    const tokenData = tokenSnap.data()!;
    const isGroupToken = !!tokenData.groupId;

    const expiresAt: Date =
      tokenData.expiresAt?.toDate?.() ?? new Date(tokenData.expiresAt);
    if (expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "Invite link has expired" }, { status: 410 });
    }

    // Personal tokens are single-use. Group tokens stay active for all users.
    if (!isGroupToken && tokenData.status === "used") {
      // Idempotent: same user's duplicate request (e.g. iOS double-fire)
      if (tokenData.usedBy === currentUserId) {
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ success: false, error: "This invite has already been used" }, { status: 410 });
    }

    if (tokenData.targetUserId === currentUserId) {
      return NextResponse.json({ success: false, error: "Cannot invite yourself" }, { status: 400 });
    }

    const batch = db.batch();

    if (!isGroupToken) {
      // ── Personal / contact invite ──────────────────────────────────────────
      const contactBase: Record<string, unknown> = {
        addedAt: FieldValue.serverTimestamp(),
        via: "qr",
        type: tokenData.type,
      };
      if (tokenData.ctx) contactBase.ctx = tokenData.ctx;

      batch.set(
        db.collection("users").doc(currentUserId).collection("contacts").doc(tokenData.targetUserId),
        contactBase,
        { merge: true }
      );
      batch.set(
        db.collection("users").doc(tokenData.targetUserId).collection("contacts").doc(currentUserId),
        contactBase,
        { merge: true }
      );

      const currentUserSnap = await db.collection("user").doc(currentUserId).get();
      const targetUserSnap = await db.collection("user").doc(tokenData.targetUserId).get();
      const currentUserData = currentUserSnap.data() ?? {};
      const targetUserData = targetUserSnap.data() ?? {};
      const currentUserName =
        currentUserData.name ?? currentUserData.displayName ?? currentUserData.username ?? "Someone";
      const targetUserName =
        targetUserData.name ?? targetUserData.displayName ?? tokenData.targetDisplayName ?? "Someone";

      batch.set(
        db.collection("user").doc(currentUserId),
        { contactIds: FieldValue.arrayUnion(tokenData.targetUserId) },
        { merge: true }
      );
      batch.set(
        db.collection("user").doc(tokenData.targetUserId),
        { contactIds: FieldValue.arrayUnion(currentUserId) },
        { merge: true }
      );

      const requestId = `qr_${tokenData.targetUserId}_${currentUserId}`;
      batch.set(
        db.collection("friendRequests").doc(requestId),
        {
          senderId: tokenData.targetUserId,
          receiverId: currentUserId,
          senderName: targetUserName,
          senderUsername: targetUserData.username ?? "",
          receiverName: currentUserName,
          receiverUsername: currentUserData.username ?? "",
          status: "accepted",
          acceptedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          via: "qr",
          type: tokenData.type,
          ...(tokenData.ctx ? { ctx: tokenData.ctx } : {}),
        },
        { merge: true }
      );

      // Personal tokens are consumed on first use
      batch.update(tokenRef, {
        status: "used",
        usedAt: FieldValue.serverTimestamp(),
        usedBy: currentUserId,
        usageCount: FieldValue.increment(1),
      });

      await batch.commit();
      return NextResponse.json({ success: true });
    }

    // ── Group invite (multi-use) ─────────────────────────────────────────────
    const groupSnap = await db.collection("groups").doc(tokenData.groupId).get();
    if (!groupSnap.exists) {
      return NextResponse.json({ success: false, error: "Group not found" }, { status: 404 });
    }
    const groupData = groupSnap.data()!;
    const isPrivate: boolean = groupData.isPrivate ?? true;
    const memberIds: string[] = groupData.memberIds ?? [];

    let displayName = "Unknown";
    let username = "";
    try {
      const profileSnap = await db.collection("user").doc(currentUserId).get();
      if (profileSnap.exists) {
        displayName = profileSnap.data()?.displayName ?? profileSnap.data()?.name ?? "Unknown";
        username = profileSnap.data()?.username ?? "";
      }
    } catch {}

    if (!isPrivate) {
      // Public group — add directly
      if (memberIds.includes(currentUserId)) {
        // Already a member: silent success (QR may be shared to a forum)
        return NextResponse.json({ success: true });
      }

      batch.update(db.collection("groups").doc(tokenData.groupId), {
        memberIds: FieldValue.arrayUnion(currentUserId),
        [`members.${currentUserId}`]: {
          name: displayName,
          username,
          joinedAt: FieldValue.serverTimestamp(),
          via: "qr",
        },
      });

      const membershipId = `${tokenData.groupId}_${currentUserId}`;
      batch.set(
        db.collection("memberships").doc(membershipId),
        {
          groupId: tokenData.groupId,
          userId: currentUserId,
          name: displayName,
          username,
          role: "member",
          status: "active",
          joinedAt: FieldValue.serverTimestamp(),
          via: "qr",
        },
        { merge: true }
      );
    } else {
      // Private group — create a join request
      if (memberIds.includes(currentUserId)) {
        // Already a member: silent success
        return NextResponse.json({ success: true });
      }

      const existing = await db
        .collection("group_join_requests")
        .where("groupId", "==", tokenData.groupId)
        .where("requesterId", "==", currentUserId)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (!existing.empty) {
        // Request already pending: silent success, token stays active
        batch.update(tokenRef, { usageCount: FieldValue.increment(1) });
        await batch.commit();
        return NextResponse.json({ success: true, pending: true });
      }

      batch.set(db.collection("group_join_requests").doc(), {
        groupId: tokenData.groupId,
        groupName: groupData.name ?? "",
        requesterId: currentUserId,
        requesterName: displayName,
        requesterUsername: username,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        via: "qr",
      });
    }

    // Group tokens stay active — only increment the usage counter
    batch.update(tokenRef, {
      usageCount: FieldValue.increment(1),
      lastUsedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({ success: true, pending: isPrivate || undefined });
  } catch (err) {
    console.error("[qrinvite/complete]", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
