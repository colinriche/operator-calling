import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase-admin";
import { archiveAndDeleteUsers } from "@/lib/user-archive";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: { profileDocId?: string; reason?: string };
  try {
    body = (await req.json()) as { profileDocId?: string; reason?: string };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const { db, adminAuth } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(token);
    const authUser = await adminAuth.getUser(decoded.uid);
    const userIds = new Set<string>([decoded.uid]);

    if (body.profileDocId && body.profileDocId !== decoded.uid) {
      const profileSnap = await db.collection("user").doc(body.profileDocId).get();
      const profileData = profileSnap.data();
      const sameEmail =
        !!authUser.email &&
        typeof profileData?.email === "string" &&
        profileData.email.toLowerCase() === authUser.email.toLowerCase();
      const explicitlyLinked =
        profileData?.linkedWebUid === decoded.uid || profileData?.webUid === decoded.uid;

      if (!profileSnap.exists || (!sameEmail && !explicitlyLinked)) {
        return NextResponse.json({ error: "Linked account could not be verified" }, { status: 403 });
      }
      userIds.add(body.profileDocId);
    }

    const result = await archiveAndDeleteUsers(db, adminAuth, {
      userIds: Array.from(userIds),
      authUserIds: [decoded.uid],
      deletedBy: decoded.uid,
      deletionType: "self_delete",
      reason: body.reason?.trim() || "User requested account deletion from website",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[account/delete]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
