import type { NextRequest } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminDb, verifyIdToken } from "@/lib/firebase-admin";
import {
  canManageAdmins,
  canManageUsers,
  isAdminRole,
  lookupAdmin,
  type AdminRole,
} from "@/lib/admins";
import { canModerate } from "@/lib/moderation-model";

// ─── Admin gate ──────────────────────────────────────────────────────────────
//
// Two steps, deliberately independent:
//
//   1. Authentication - who is this? The ID token is verified against
//      `operator-calling`, the one project the website signs into.
//
//   2. Authorisation - what may they do? Answered solely by the `admins`
//      collection (lib/admins.ts), keyed by email, in that same project.
//      Nothing a person can edit about their own profile grants access.
//
// Splitting them is the point. Authority used to live on the `user` document
// as a `role` field, reachable by sign-up and account-linking code.

export type { AdminRole };

export interface AdminCaller {
  /** Firebase Auth UID of the caller. */
  uid: string;
  /** Lowercased email - the `admins` document id backing them. */
  email: string;
  name: string;
  role: AdminRole;
  /**
   * Legacy `user` document id, when one was found. Retained because a couple of
   * routes still record it; not used for any permission decision.
   */
  profileDocId: string | null;
  /** How authority was established. Always the `admins` collection. */
  source: "admins";
}

/**
 * The caller's email address.
 *
 * A custom-token session - which is what /api/admin/token mints - carries no
 * `email` claim of its own, so this checks the standard claim, then a custom
 * claim, then falls back to the legacy `user` document. Without this an
 * email-keyed lookup could never match an admin-login session.
 */
async function resolveEmail(
  identity: NonNullable<Awaited<ReturnType<typeof verifyIdToken>>>
): Promise<{ email: string | null; profileDocId: string | null; profile: DocumentData | null }> {
  if (identity.email) {
    return { email: identity.email, profileDocId: null, profile: null };
  }

  const claimed = identity.decoded.email ?? (identity.decoded as { email?: unknown }).email;
  if (typeof claimed === "string" && claimed.includes("@")) {
    return { email: claimed.toLowerCase(), profileDocId: null, profile: null };
  }

  // Custom-token sessions use the Firestore document id as the uid, so the
  // document is a direct lookup.
  try {
    const snap = await getAdminDb().collection("user").doc(identity.uid).get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const email = typeof data.email === "string" ? data.email.toLowerCase() : null;
      return { email, profileDocId: snap.id, profile: data };
    }
  } catch (err) {
    console.warn("[admin-auth] email fallback lookup failed:", (err as Error).message);
  }

  return { email: null, profileDocId: null, profile: null };
}

export async function requireAdmin(
  req: NextRequest,
  { superAdminOnly = false }: { superAdminOnly?: boolean } = {}
): Promise<AdminCaller | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  try {
    const identity = await verifyIdToken(token);
    if (!identity) {
      console.warn("[admin-auth] token not valid for this Firebase project");
      return null;
    }

    const { email, profileDocId } = await resolveEmail(identity);
    if (!email) {
      console.warn(`[admin-auth] no email resolvable for uid=${identity.uid}`);
      return null;
    }

    // `admins` is the ONLY source of authority. A `role` on the `user` document
    // grants nothing here: that field is written by sign-up flows and the mobile
    // app, which is why authority was moved out of it. If the collection cannot
    // be read, nobody is let in: failing closed is correct for a permission list.
    let record = null;
    try {
      record = await lookupAdmin(email);
    } catch (err) {
      console.error("[admin-auth] admins lookup failed:", (err as Error).message);
    }

    const role: AdminRole | null = record?.role ?? null;
    const name = record?.name ?? "";

    if (!role) {
      console.warn(`[admin-auth] ${email} is not in the admins list`);
      return null;
    }

    if (superAdminOnly && role !== "super_admin") {
      console.warn(`[admin-auth] ${email} has role=${role}, super_admin required`);
      return null;
    }

    return {
      uid: identity.uid,
      email,
      name,
      role,
      profileDocId,
      source: "admins",
    };
  } catch (err) {
    console.warn("[admin-auth] verification failed:", (err as Error).message);
    return null;
  }
}

/** Caller who may create, edit and remove admin records. */
export async function requireAdminManager(req: NextRequest): Promise<AdminCaller | null> {
  const caller = await requireAdmin(req);
  return caller && canManageAdmins(caller.role) ? caller : null;
}

/** Caller who may edit, archive and delete user accounts. */
export async function requireUserManager(req: NextRequest): Promise<AdminCaller | null> {
  const caller = await requireAdmin(req);
  return caller && canManageUsers(caller.role) ? caller : null;
}

/**
 * Caller who may review reports and act on accounts (warn, suspend, ban,
 * dismiss, note). Today that is a super_admin; see canModerate.
 */
export async function requireModerator(req: NextRequest): Promise<AdminCaller | null> {
  const caller = await requireAdmin(req);
  return caller && canModerate(caller.role) ? caller : null;
}

/**
 * requireModerator, but saying WHY it refused. A 403 that only reads "Super
 * admin role required" is baffling to someone who can open the Super Admin page
 * (that page is open to any admin; only its actions are restricted), so the
 * answer names the signed-in account and the role the server actually found.
 * That role comes from the `admins` collection (lib/admins.ts), not from what the
 * page lets you open.
 */
export async function checkModerator(
  req: NextRequest
): Promise<{ ok: true; caller: AdminCaller } | { ok: false; status: number; error: string }> {
  const caller = await requireAdmin(req);
  if (!caller) {
    return {
      ok: false,
      status: 403,
      error: "You're not signed in as an admin on this site. Sign out and back in, or ask a super admin to add you.",
    };
  }
  if (!canModerate(caller.role)) {
    return {
      ok: false,
      status: 403,
      error:
        `Reports need the super_admin role. You're signed in as ${caller.email} with the "${caller.role}" role` +
        ". A super admin can change that in the admins list.",
    };
  }
  return { ok: true, caller };
}
