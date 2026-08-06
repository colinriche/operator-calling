import type { NextRequest } from "next/server";
import { getAdminServices } from "@/lib/firebase-admin";

// ─── Admin role gate ─────────────────────────────────────────────────────────
//
// Roles live in the "dev" project's `user` collection alongside web sign-in, so
// this always verifies against dev — even for routes whose data lives in the
// "staging" project.
//
// Mirrors the requireAdmin helper in app/api/admin/archive/route.ts; extracted
// here so new admin routes gate consistently instead of each rolling its own.

export type AdminRole = "admin" | "super_admin";

export interface AdminCaller {
  uid: string;
  role: AdminRole;
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
    const callerSnap = await db.collection("user").doc(decoded.uid).get();
    const role = callerSnap.data()?.role;

    if (superAdminOnly) {
      if (role !== "super_admin") return null;
    } else if (role !== "admin" && role !== "super_admin") {
      return null;
    }

    return { uid: decoded.uid, role: role as AdminRole };
  } catch {
    return null;
  }
}
