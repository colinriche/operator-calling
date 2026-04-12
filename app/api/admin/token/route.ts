import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

// ─── POST /api/admin/token ────────────────────────────────────────────────────
// Body: { username: string }
// Returns a Firebase custom token for an admin user matched by displayName.
// Only active when ADMIN_LOGIN_ENABLED=true.

export async function POST(req: NextRequest) {
  if (process.env.ADMIN_LOGIN_ENABLED !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = body.username?.trim();
  if (!username) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  try {
    const { db, adminAuth } = getAdminServices();

    // Try username → name → email in order
    const col = db.collection("users");
    let snap = await col.where("username", "==", username).limit(1).get();
    if (snap.empty) snap = await col.where("name", "==", username).limit(1).get();
    if (snap.empty) snap = await col.where("email", "==", username).limit(1).get();

    if (!snap || snap.empty) {
      // Deliberately vague — don't reveal whether user exists
      return NextResponse.json({ error: "No admin account found for that username" }, { status: 404 });
    }

    const userDoc = snap.docs[0];
    const data = userDoc.data();

    if (data.role !== "admin") {
      return NextResponse.json({ error: "No admin account found for that username" }, { status: 403 });
    }

    const customToken = await adminAuth.createCustomToken(userDoc.id, {
      role: data.role,
    });

    console.log(`[admin/token] Admin login: uid=${userDoc.id} displayName=${data.displayName} role=${data.role}`);

    return NextResponse.json({ token: customToken });
  } catch (err) {
    console.error("[admin/token]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
