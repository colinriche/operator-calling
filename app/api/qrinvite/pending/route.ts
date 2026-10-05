import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { PendingResponse, Platform } from "@/lib/qrinvite";
import { resolveTokenProject } from "@/lib/qrinvite-admin";
import { firebaseProjectId } from "@/lib/firebase-admin";

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

  const { token, platform, phoneNumber } = body as { token?: string; platform?: string; phoneNumber?: string };
  if (!token || !platform || !ALLOWED_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json({ success: false }, { status: 400 });
  }
  // Normalise to E.164: keep leading +, strip everything else that isn't a digit
  const normalizedPhone = phoneNumber
    ? (phoneNumber.trim().startsWith("+") ? "+" : "") +
      phoneNumber.replace(/\D/g, "")
    : null;

  try {
    const resolved = await resolveTokenProject(token);
    if (!resolved) {
      return NextResponse.json({ success: false }, { status: 404 });
    }
    const { db, docId, snap: tokenSnap } = resolved;

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
      tokenDocId: docId,
      project: firebaseProjectId(),
      targetUserId: tokenData.targetUserId,
      type: tokenData.type ?? "personal",
      groupId: tokenData.groupId ?? null,
      platform,
      phoneNumber: normalizedPhone,
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
