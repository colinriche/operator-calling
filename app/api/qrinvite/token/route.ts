import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

type InviteType =
  | "personal"
  | "family"
  | "work"
  | "sport"
  | "social"
  | "event"
  | "group"
  | "other";

interface CreateTokenBody {
  type?: InviteType;
  ctx?: string;
  groupId?: string;
  forceNew?: boolean;
}

const TOKEN_TTL_HOURS = 24;
const VALID_TYPES: InviteType[] = [
  "personal",
  "family",
  "work",
  "sport",
  "social",
  "event",
  "group",
  "other",
];

function baseInviteUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://operatorcalling.com"
  );
}

function isActive(expiresAt: unknown): boolean {
  const dt =
    (expiresAt as { toDate?: () => Date } | null)?.toDate?.() ??
    (expiresAt ? new Date(expiresAt as string) : null);
  return !!dt && dt.getTime() > Date.now();
}

// POST /api/qrinvite/token
// Body: { type, ctx?, groupId?, forceNew? }
export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: CreateTokenBody;
  try {
    body = (await req.json()) as CreateTokenBody;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const type = body.type ?? "personal";
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid invite type" }, { status: 400 });
  }

  try {
    const { db } = getAdminServices();

    let groupName = "";
    if (type === "group") {
      if (!body.groupId) {
        return NextResponse.json(
          { error: "groupId is required for group invites" },
          { status: 400 }
        );
      }

      const groupSnap = await db.collection("groups").doc(body.groupId).get();
      if (!groupSnap.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      const group = groupSnap.data()!;
      if (group.createdBy !== uid) {
        return NextResponse.json(
          { error: "Only group creator can generate group QR" },
          { status: 403 }
        );
      }
      groupName = group.name ?? "";
    }

    let query = db
      .collection("qr_tokens")
      .where("targetUserId", "==", uid)
      .where("type", "==", type)
      .where("status", "==", "active");

    if (type === "group" && body.groupId) {
      query = query.where("groupId", "==", body.groupId);
    }

    const existingSnap = await query.get();
    const activeDocs = existingSnap.docs.filter((d) => isActive(d.data().expiresAt));

    if (!body.forceNew && activeDocs.length > 0) {
      const best = activeDocs.sort((a, b) => {
        const aMs = a.data().expiresAt?.toDate?.()?.getTime?.() ?? 0;
        const bMs = b.data().expiresAt?.toDate?.()?.getTime?.() ?? 0;
        return bMs - aMs;
      })[0];
      const data = best.data();
      return NextResponse.json({
        tokenId: data.tokenId ?? best.id,
        publicUrl: data.publicUrl,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString() ?? null,
        type: data.type,
        groupId: data.groupId ?? null,
        fresh: false,
      });
    }

    if (activeDocs.length > 0) {
      const batch = db.batch();
      for (const d of activeDocs) {
        batch.update(d.ref, {
          status: "revoked",
          revokedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

    const inviteUrl = new URL("/qrinvite", baseInviteUrl());
    inviteUrl.searchParams.set("token", tokenId);
    inviteUrl.searchParams.set("type", type);
    if (body.ctx?.trim()) inviteUrl.searchParams.set("ctx", body.ctx.trim());
    if (body.groupId?.trim()) inviteUrl.searchParams.set("groupId", body.groupId.trim());

    const profileSnap = await db.collection("user").doc(uid).get();
    const targetDisplayName =
      profileSnap.data()?.displayName ?? profileSnap.data()?.name ?? "Someone";

    await db.collection("qr_tokens").doc(tokenId).set({
      tokenId,
      targetUserId: uid,
      targetDisplayName,
      type,
      ctx: body.ctx?.trim() || null,
      groupId: body.groupId?.trim() || null,
      groupName: type === "group" ? groupName : null,
      status: "active",
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: FieldValue.serverTimestamp(),
      publicUrl: inviteUrl.toString(),
      version: 1,
      usageCount: 0,
    });

    return NextResponse.json({
      tokenId,
      publicUrl: inviteUrl.toString(),
      expiresAt: expiresAt.toISOString(),
      type,
      groupId: body.groupId?.trim() || null,
      fresh: true,
    });
  } catch (err) {
    console.error("[qrinvite/token POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
