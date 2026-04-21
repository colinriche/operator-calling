import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices, verifyAuth } from "@/lib/firebase-admin";

// GET /api/groups — list groups the caller belongs to
export async function GET(req: NextRequest) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { db } = getAdminServices();
  const snap = await db
    .collection("groups")
    .where("memberIds", "array-contains", uid)
    .orderBy("createdAt", "desc")
    .get();

  const groups = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name,
      description: data.description ?? "",
      createdBy: data.createdBy,
      memberCount: (data.memberIds ?? []).length,
      isPrivate: data.isPrivate ?? true,
      tags: data.tags ?? [],
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      scheduleSettings: data.scheduleSettings ?? null,
    };
  });

  return NextResponse.json({ groups });
}

// POST /api/groups — create a new group
export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req.headers.get("authorization") ?? "");
  if (!uid) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: { name?: string; description?: string; isPrivate?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Group name required" }, { status: 400 });

  const { db, adminAuth } = getAdminServices();

  // Fetch creator display name
  let creatorName = "Unknown";
  let creatorUsername = "";
  try {
    const userSnap = await db.collection("user").doc(uid).get();
    if (userSnap.exists) {
      creatorName = userSnap.data()?.displayName ?? userSnap.data()?.name ?? "Unknown";
      creatorUsername = userSnap.data()?.username ?? "";
    } else {
      const fbUser = await adminAuth.getUser(uid);
      creatorName = fbUser.displayName ?? fbUser.email ?? "Unknown";
    }
  } catch {}

  const groupRef = db.collection("groups").doc();
  await groupRef.set({
    name,
    description: body.description?.trim() ?? "",
    isPrivate: body.isPrivate ?? true,
    createdBy: uid,
    memberIds: [uid],
    members: {
      [uid]: {
        name: creatorName,
        username: creatorUsername,
        joinedAt: FieldValue.serverTimestamp(),
      },
    },
    tags: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, groupId: groupRef.id });
}
