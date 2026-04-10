import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { PendingResponse, Platform } from "@/lib/qrinvite";

function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

const ALLOWED_PLATFORMS: Platform[] = ["ios", "android", "web"];

// ─── POST /api/qrinvite/pending ───────────────────────────────────────────────
// Body: { token: string, platform: Platform }
// Creates a pending_connections record without mutating any account.

export async function POST(req: NextRequest): Promise<NextResponse<PendingResponse>> {
  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const { token, platform } = body;
  if (!token || !platform || !ALLOWED_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  try {
    const db = getAdminDb();

    // Verify the QR token exists and is still active before creating a pending record
    const tokenSnap = await db.collection("qr_tokens").doc(token).get();
    if (!tokenSnap.exists) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const tokenData = tokenSnap.data()!;
    const expiresAt: Date =
      tokenData.expiresAt?.toDate?.() ?? new Date(tokenData.expiresAt);

    if (expiresAt < new Date() || tokenData.status === "used") {
      return NextResponse.json({ success: false }, { status: 410 });
    }

    // Pending connections expire 7 days after the original token's expiry
    const pendingExpiry = new Date(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const pendingRef = db.collection("pending_connections").doc();
    await pendingRef.set({
      token,
      targetUserId: tokenData.targetUserId,
      type: tokenData.type ?? "personal",
      groupId: tokenData.groupId ?? null,
      platform,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: pendingExpiry,
      status: "pending",
    });

    return NextResponse.json({ success: true, pendingId: pendingRef.id });
  } catch (err) {
    console.error("[qrinvite/pending]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
