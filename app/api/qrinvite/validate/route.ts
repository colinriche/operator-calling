import { NextRequest, NextResponse } from "next/server";
import type { ValidateResponse, QRToken } from "@/lib/qrinvite";
import { getJwtExpiry } from "@/lib/qrinvite-server";
import { resolveTokenProject } from "@/lib/qrinvite-admin";

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

  try {
    // The token carries no environment field — look it up in whichever
    // Firebase project (dev or staging) actually holds it.
    const resolved = await resolveTokenProject(token);
    if (!resolved) {
      return NextResponse.json({ valid: false, reason: "invalid" });
    }

    const { db, snap } = resolved;
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
        const profileSnap = await db.collection("user").doc(data.targetUserId).get();
        if (profileSnap.exists) {
          targetDisplayName =
            profileSnap.data()?.displayName ??
            profileSnap.data()?.name ??
            "";
        }
        if (!targetDisplayName) {
          const userSnap = await db.collection("user").doc(data.targetUserId).get();
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

    // For any token with a groupId, look up the group to get its name and
    // privacy setting. This covers 'group' type AND typed groups like
    // 'work', 'sport', 'social', 'college' that have a specific group selected.
    let isPrivate = true;
    let groupName: string | undefined = data.groupName;
    if (data.groupId) {
      try {
        const groupSnap = await db.collection("groups").doc(data.groupId).get();
        if (groupSnap.exists) {
          isPrivate = groupSnap.data()?.isPrivate ?? true;
          groupName = groupSnap.data()?.name ?? groupName;
        }
      } catch {}
    }

    const tokenData: QRToken = {
      token,
      targetUserId: data.targetUserId,
      targetDisplayName,
      type: data.type ?? "personal",
      ctx: data.ctx ?? undefined,
      groupId: data.groupId ?? undefined,
      groupName,
      isPrivate,
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
