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

export async function POST(req: NextRequest): Promise<NextResponse<CompleteResponse>> {
  // Verify caller identity
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

    // Verify the Firebase ID token matches the claimed userId
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.uid !== currentUserId) {
      return NextResponse.json({ success: false, error: "Identity mismatch" }, { status: 403 });
    }

    // JWT tokens store the Firestore doc key in the tokenId payload field
    const docId = resolveTokenDocId(token);
    const tokenRef = db.collection("qr_tokens").doc(docId);
    const tokenSnap = await tokenRef.get();

    if (!tokenSnap.exists) {
      return NextResponse.json({ success: false, error: "Token not found" }, { status: 404 });
    }

    const tokenData = tokenSnap.data()!;

    const expiresAt: Date =
      tokenData.expiresAt?.toDate?.() ?? new Date(tokenData.expiresAt);
    if (expiresAt < new Date() || tokenData.status === "used") {
      return NextResponse.json({ success: false, error: "Token expired or used" }, { status: 410 });
    }

    // Safety: do not let a user add themselves
    if (tokenData.targetUserId === currentUserId) {
      return NextResponse.json({ success: false, error: "Cannot invite yourself" }, { status: 400 });
    }

    const batch = db.batch();

    if (!tokenData.groupId) {
      // No groupId → pure contact invite (personal, family, event, or a
      // work/sport/social invite without a specific group selected).
      // Creates a mutual contact relationship; ctx is preserved on the record.
      const contactBase: Record<string, unknown> = {
        addedAt: FieldValue.serverTimestamp(),
        via: "qr",
        type: tokenData.type,
      };
      if (tokenData.ctx) contactBase.ctx = tokenData.ctx;

      const contactA = db
        .collection("users")
        .doc(currentUserId)
        .collection("contacts")
        .doc(tokenData.targetUserId);
      const contactB = db
        .collection("users")
        .doc(tokenData.targetUserId)
        .collection("contacts")
        .doc(currentUserId);

      batch.set(contactA, contactBase, { merge: true });
      batch.set(contactB, contactBase, { merge: true });

      const currentUserSnap = await db.collection("user").doc(currentUserId).get();
      const targetUserSnap = await db.collection("user").doc(tokenData.targetUserId).get();
      const currentUserData = currentUserSnap.data() ?? {};
      const targetUserData = targetUserSnap.data() ?? {};
      const currentUserName =
        currentUserData.name ?? currentUserData.displayName ?? currentUserData.username ?? "Someone";
      const targetUserName =
        targetUserData.name ?? targetUserData.displayName ?? tokenData.targetDisplayName ?? "Someone";

      // Keep the Flutter app's contact and "New Contacts" sources in sync with
      // QR completion. The web `users/*/contacts` records above are not read by
      // the mobile contacts screen.
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
    } else {
      // groupId is set → group invite (type describes the group category:
      // 'group', 'work', 'sport', 'social', 'college', etc.)
      const groupSnap = await db.collection("groups").doc(tokenData.groupId).get();
      if (!groupSnap.exists) {
        return NextResponse.json({ success: false, error: "Group not found" }, { status: 404 });
      }
      const groupData = groupSnap.data()!;
      const isPrivate: boolean = groupData.isPrivate ?? true;
      const memberIds: string[] = groupData.memberIds ?? [];

      // Resolve requester's display name and username once
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
        // Public group — add directly (already a member check)
        if (memberIds.includes(currentUserId)) {
          return NextResponse.json({ success: false, error: "Already a member" }, { status: 409 });
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
        // Write to memberships so the web dashboard shows this user in the
        // member list (GroupAdminDashboard reads memberships, not memberIds).
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
        // Private group — create a join request instead of adding directly
        if (memberIds.includes(currentUserId)) {
          return NextResponse.json({ success: false, error: "Already a member" }, { status: 409 });
        }

        // Idempotent: return pending if request already exists
        const existing = await db
          .collection("group_join_requests")
          .where("groupId", "==", tokenData.groupId)
          .where("requesterId", "==", currentUserId)
          .where("status", "==", "pending")
          .limit(1)
          .get();
        if (!existing.empty) {
          // Mark token used and return pending — no need to create another request
          batch.update(tokenRef, { status: "used", usedAt: FieldValue.serverTimestamp(), usedBy: currentUserId });
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

        // Mark token as used and return pending immediately — skip the usual used-mark below
        batch.update(tokenRef, { status: "used", usedAt: FieldValue.serverTimestamp(), usedBy: currentUserId });
        await batch.commit();
        return NextResponse.json({ success: true, pending: true });
      }
    }

    // Mark token as used
    batch.update(tokenRef, {
      status: "used",
      usedAt: FieldValue.serverTimestamp(),
      usedBy: currentUserId,
    });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[qrinvite/complete]", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
