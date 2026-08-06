import type { NextRequest } from "next/server";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";

// ─── Admin role gate ─────────────────────────────────────────────────────────
//
// Roles live in the "dev" project's `user` collection alongside web sign-in, so
// this always verifies against dev — even for routes whose data lives in the
// "staging" project.
//
// The lookup deliberately mirrors hooks/useAuth.ts. A Firestore `user` document
// does NOT reliably live at user/{auth.uid}: phone auth mints a fresh Firebase
// UID, so a linked account's profile sits under its original document id and is
// found via linkedWebUids / linkedWebUid / email instead. Checking only the
// direct id makes the server disagree with the client about who someone is —
// the browser shows them as an admin while every API call 403s.

export type AdminRole = "admin" | "super_admin";

export interface AdminCaller {
  /** Firebase Auth UID of the caller. */
  uid: string;
  /** Firestore `user` document id backing them — may differ from uid. */
  profileDocId: string;
  role: AdminRole;
}

function roleOf(data: DocumentData | undefined): string | null {
  const role = data?.role;
  return typeof role === "string" && role ? role : null;
}

/**
 * Find the `user` document backing an authenticated caller, trying the same
 * routes as useAuth in the same order. Returns the first candidate carrying a
 * role, so email-only stubs are skipped rather than shadowing the real profile.
 */
async function findProfile(
  db: Firestore,
  uid: string,
  email: string | null
): Promise<{ id: string; data: DocumentData } | null> {
  const users = db.collection("user");

  const aliasQ = await users.where("linkedWebUids", "array-contains", uid).limit(5).get();
  const linkedQ = await users.where("linkedWebUid", "==", uid).limit(5).get();
  const directSnap = await users.doc(uid).get();
  const emailQ = email
    ? await users.where("email", "==", email).limit(5).get()
    : null;

  const candidates: Array<{ id: string; data: DocumentData }> = [
    ...aliasQ.docs.map((d) => ({ id: d.id, data: d.data() })),
    ...linkedQ.docs.map((d) => ({ id: d.id, data: d.data() })),
    ...(directSnap.exists ? [{ id: directSnap.id, data: directSnap.data() ?? {} }] : []),
    ...(emailQ ? emailQ.docs.map((d) => ({ id: d.id, data: d.data() })) : []),
  ];

  return candidates.find((c) => roleOf(c.data) !== null) ?? candidates[0] ?? null;
}

/**
 * Returns the caller when they hold a sufficient role, otherwise null. Callers
 * should respond 403 on null — never leak whether the token was invalid or
 * merely under-privileged.
 */
export async function requireAdmin(
  req: NextRequest,
  { superAdminOnly = false }: { superAdminOnly?: boolean } = {}
): Promise<AdminCaller | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  try {
    const { db, adminAuth } = getAdminServices();
    const decoded = await adminAuth.verifyIdToken(token);

    const profile = await findProfile(
      db,
      decoded.uid,
      decoded.email?.toLowerCase() ?? null
    );
    if (!profile) {
      console.warn(`[admin-auth] no user doc for uid=${decoded.uid}`);
      return null;
    }

    // An archived account keeps its role field; useAuth signs these out, so the
    // server must not honour them either.
    if (profile.data.archived === true) {
      console.warn(`[admin-auth] archived account uid=${decoded.uid}`);
      return null;
    }

    const role = roleOf(profile.data);
    const sufficient = superAdminOnly
      ? role === "super_admin"
      : role === "admin" || role === "super_admin";

    if (!sufficient) {
      console.warn(
        `[admin-auth] insufficient role uid=${decoded.uid} doc=${profile.id} role=${role ?? "none"} superAdminOnly=${superAdminOnly}`
      );
      return null;
    }

    return {
      uid: decoded.uid,
      profileDocId: profile.id,
      role: role as AdminRole,
    };
  } catch (err) {
    // Usually a token issued by a different Firebase project, or an expired one.
    console.warn("[admin-auth] token verification failed:", (err as Error).message);
    return null;
  }
}
