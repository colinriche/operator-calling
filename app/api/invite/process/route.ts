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

// ─── POST /api/invite/process ─────────────────────────────────────────────────
// Called after a new user provides their phone number following signup via an
// SMS invite link. Creates the appropriate friend request or group invite so
// the inviter–invitee relationship is established on both the website and the
// mobile app.
//
// Body: { inviterUsername: string, groupId?: string, inviteeUid: string, inviteePhone: string }
// Header: Authorization: Bearer <firebase-id-token>

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: {
    inviterUsername?: string;
    groupId?: string;
    inviteeUid?: string;
    inviteePhone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { inviterUsername, groupId, inviteeUid, inviteePhone } = body;
  if (!inviterUsername || !inviteeUid) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const { db, adminAuth } = getAdminServices();

    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.uid !== inviteeUid) {
      return NextResponse.json({ error: "Identity mismatch" }, { status: 403 });
    }

    // Look up inviter by username (unique, human-readable identifier)
    const inviterQuery = await db
      .collection("user")
      .where("username", "==", inviterUsername)
      .limit(1)
      .get();
    if (inviterQuery.empty) {
      return NextResponse.json({ error: "Inviter not found" }, { status: 404 });
    }
    const inviterDoc = inviterQuery.docs[0];
    const inviterUid = inviterDoc.id;
    const inviterData = inviterDoc.data();
    const inviterName: string = inviterData.name ?? inviterData.displayName ?? "Someone";

    if (inviterUid === inviteeUid) {
      return NextResponse.json({ error: "Cannot invite yourself" }, { status: 400 });
    }

    const batch = db.batch();

    if (groupId) {
      // Group invite ─────────────────────────────────────────────────────────
      const groupSnap = await db.collection("groups").doc(groupId).get();
      if (!groupSnap.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      const groupName: string | null = groupSnap.data()?.name ?? null;

      // Avoid duplicate pending invites
      const existingSnap = await db
        .collection("group_invites")
        .where("groupId", "==", groupId)
        .where("inviteeId", "==", inviteeUid)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (existingSnap.empty) {
        batch.set(db.collection("group_invites").doc(), {
          groupId,
          groupName,
          inviterId: inviterUid,
          inviteeId: inviteeUid,
          inviteeName: null,
          inviteeUsername: null,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          via: "sms_link",
        });
      }
    } else {
      // Personal friend request ───────────────────────────────────────────────
      const existingFRSnap = await db
        .collection("friendRequests")
        .where("senderId", "==", inviterUid)
        .where("receiverId", "==", inviteeUid)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (existingFRSnap.empty) {
        batch.set(db.collection("friendRequests").doc(), {
          senderId: inviterUid,
          receiverId: inviteeUid,
          senderName: inviterName,
          senderUsername: inviterUsername,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          via: "sms_link",
        });
      }
    }

    // Phone-keyed record in the mobile app's `invites` collection so that
    // matchPendingInvites() picks it up when the user signs in on the phone app.
    if (inviteePhone) {
      batch.set(db.collection("invites").doc(), {
        senderId: inviterUid,
        senderName: inviterName,
        phoneNumber: inviteePhone,
        method: "web_signup",
        groupId: groupId ?? null,
        groupName: groupId ? ((await db.collection("groups").doc(groupId).get()).data()?.name ?? null) : null,
        addToIgnore: false,
        status: "pending",
        recipientUserId: inviteeUid,
        createdAt: FieldValue.serverTimestamp(),
        via: "sms_link",
      });
    }

    await batch.commit();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invite/process]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
