import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { ValidateResponse, QRToken } from "@/lib/qrinvite";
import { resolveTokenDocId, getJwtExpiry } from "@/lib/qrinvite-server";

// ─── Firebase Admin init (lazy, singleton) ───────────────────────────────────

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

// ─── GET /api/qrinvite/validate?token=... ────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse<ValidateResponse>> {
  const token = req.nextUrl.searchParams.get("token");

  if (!token || token.length < 8 || token.length > 2048) {
    return NextResponse.json({ valid: false, reason: "invalid" }, { status: 400 });
  }

  // Quick expiry check from JWT claims before hitting Firestore
  const jwtExp = getJwtExpiry(token);
  if (jwtExp !== null && jwtExp < Date.now()) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }

  // JWT tokens store the Firestore doc key in the tokenId payload field
  const docId = resolveTokenDocId(token);

  try {
    const db = getAdminDb();
    const snap = await db.collection("qr_tokens").doc(docId).get();

    if (!snap.exists) {
      return NextResponse.json({ valid: false, reason: "invalid" });
    }

    const data = snap.data()!;

    // Check expiry (Firestore timestamp is authoritative)
    const expiresAt: Date =
      data.expiresAt?.toDate?.() ?? new Date(data.expiresAt);
    if (expiresAt < new Date()) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }

    // Check already used
    if (data.status === "used") {
      return NextResponse.json({ valid: false, reason: "used" });
    }

    const tokenData: QRToken = {
      token,
      targetUserId: data.targetUserId,
      targetDisplayName: data.targetDisplayName ?? "Someone",
      type: data.type ?? "personal",
      groupId: data.groupId,
      groupName: data.groupName,
      createdAt:
        data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "active",
    };

    return NextResponse.json({ valid: true, tokenData });
  } catch (err) {
    console.error("[qrinvite/validate]", err);
    return NextResponse.json({ valid: false, reason: "invalid" }, { status: 500 });
  }
}
