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

// ─── POST /api/groups/join ────────────────────────────────────────────────────
// Body: { groupId: string }
// Header: Authorization: Bearer <firebase-id-token>
//
// Adds the calling user to a public group. Resolves the correct mobile UID
// from the Firebase session — after linking, the web account doc is deleted
// and the profile lives at the mobile user's doc (which has linkedWebUid set).

export async function POST(req: NextRequest) {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  let body: { groupId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const { groupId } = body;
  if (!groupId?.trim()) {
    return NextResponse.json({ success: false, error: "groupId is required" }, { status: 400 });
  }

  try {
    const { db, adminAuth } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const webUid = decoded.uid;

    // Resolve the mobile user UID and their profile.
    // After account linking, the web doc is deleted and the mobile doc has
    // linkedWebUid === webUid. Before linking, the web doc exists directly.
    let actingUid = webUid;
    let displayName = "Unknown";
    let username = "";

    const directSnap = await db.collection("user").doc(webUid).get();
    if (directSnap.exists) {
      const d = directSnap.data()!;
      displayName = d.displayName ?? d.name ?? "Unknown";
      username = d.username ?? "";
    } else {
      const linkedQ = await db
        .collection("user")
        .where("linkedWebUid", "==", webUid)
        .limit(1)
        .get();
      if (!linkedQ.empty) {
        actingUid = linkedQ.docs[0].id;
        const d = linkedQ.docs[0].data();
        displayName = d.displayName ?? d.name ?? "Unknown";
        username = d.username ?? "";
      }
    }

    // Verify the group exists and is public
    const groupRef = db.collection("groups").doc(groupId);
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) {
      return NextResponse.json({ success: false, error: "Group not found" }, { status: 404 });
    }

    const groupData = groupSnap.data()!;
    if (groupData.isPrivate) {
      return NextResponse.json(
        { success: false, error: "This group is private. Use a QR invite to request entry." },
        { status: 403 }
      );
    }

    const memberIds: string[] = groupData.memberIds ?? [];
    if (memberIds.includes(actingUid)) {
      return NextResponse.json({ success: true, alreadyMember: true });
    }

    // Add to group
    const batch = db.batch();
    batch.update(groupRef, {
      memberIds: FieldValue.arrayUnion(actingUid),
      [`members.${actingUid}`]: {
        name: displayName,
        username,
        joinedAt: FieldValue.serverTimestamp(),
        via: "web_setup",
      },
    });
    const membershipId = `${groupId}_${actingUid}`;
    batch.set(
      db.collection("memberships").doc(membershipId),
      {
        groupId,
        userId: actingUid,
        name: displayName,
        username,
        role: "member",
        status: "active",
        joinedAt: FieldValue.serverTimestamp(),
        via: "web_setup",
      },
      { merge: true }
    );
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[groups/join]", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
