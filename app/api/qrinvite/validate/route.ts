import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { ValidateResponse, QRToken } from "@/lib/qrinvite";
import { resolveTokenDocId, getJwtExpiry } from "@/lib/qrinvite-server";

// ─── Firebase Admin init (lazy, singleton) ───────────────────────────────────

function getAdminDb() {
  if (!getApps().length) {
    console.log("[qrinvite/validate] init — projectId:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "clientEmail:", process.env.FIREBASE_CLIENT_EMAIL, "privateKey set:", !!process.env.FIREBASE_PRIVATE_KEY);
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

    // Resolve display name — prefer the field on the token doc, fall back to
    // the user's profile in Firestore, then a safe default.
    let targetDisplayName: string = data.targetDisplayName ?? "";
    if (!targetDisplayName && data.targetUserId) {
      try {
        const profileSnap = await db.collection("profiles").doc(data.targetUserId).get();
        if (profileSnap.exists) {
          targetDisplayName =
            profileSnap.data()?.displayName ??
            profileSnap.data()?.name ??
            "";
        }
        if (!targetDisplayName) {
          const userSnap = await db.collection("users").doc(data.targetUserId).get();
          if (userSnap.exists) {
            targetDisplayName =
              userSnap.data()?.displayName ??
              userSnap.data()?.name ??
              "";
          }
        }
      } catch {
        // Non-fatal — default below handles it
      }
    }
    if (!targetDisplayName) targetDisplayName = "Someone";

    const tokenData: QRToken = {
      token,
      targetUserId: data.targetUserId,
      targetDisplayName,
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
