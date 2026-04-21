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

    if (tokenData.type !== "group") {
      // All contact types (personal, family, work, sport, social, event, other)
      // create a mutual contact relationship. ctx (e.g. company/sport name) is
      // preserved on the record for work and sport types.
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
    } else if (tokenData.type === "group" && tokenData.groupId) {
      // Add user to the group using the mobile-app schema:
      // groups/{groupId}.memberIds (array) + groups/{groupId}.members.{uid} (map)
      let displayName = "Unknown";
      let username = "";
      try {
        const profileSnap = await db.collection("user").doc(currentUserId).get();
        if (profileSnap.exists) {
          displayName = profileSnap.data()?.displayName ?? profileSnap.data()?.name ?? "Unknown";
          username = profileSnap.data()?.username ?? "";
        }
      } catch {}

      const groupRef = db.collection("groups").doc(tokenData.groupId);
      batch.update(groupRef, {
        memberIds: FieldValue.arrayUnion(currentUserId),
        [`members.${currentUserId}`]: {
          name: displayName,
          username,
          joinedAt: FieldValue.serverTimestamp(),
          via: "qr",
        },
      });
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
