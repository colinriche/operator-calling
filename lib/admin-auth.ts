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

// ─── Admin gate ──────────────────────────────────────────────────────────────
//
// Two steps, deliberately independent:
//
//   1. Authentication — who is this? The ID token is verified against
//      `operator-calling`, the one project the website signs into.
//
//   2. Authorisation — what may they do? Answered solely by the `admins`
//      collection (lib/admins.ts), keyed by email, in that same project.
//      Nothing a person can edit about their own profile grants access.
//
// Splitting them is the point. Authority used to live on the `user` document
// as a `role` field, reachable by sign-up and account-linking code.

export type { AdminRole };

export interface AdminCaller {
  /** Firebase Auth UID of the caller. */
  uid: string;
  /** Lowercased email — the `admins` document id backing them. */
  email: string;
  name: string;
  role: AdminRole;
  /**
   * Legacy `user` document id, when one was found. Retained because a couple of
   * routes still record it; not used for any permission decision.
   */
  profileDocId: string | null;
  /** How authority was established. "legacy" is the transitional path below. */
  source: "admins" | "legacy";
}

/**
 * The caller's email address.
 *
 * A custom-token session — which is what /api/admin/token mints — carries no
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

/**
 * Transitional fallback: honour a `role` on the legacy `user` document.
 *
 * Only consulted when the `admins` collection has nothing for this person, and
 * every hit is logged with the email that needs adding. It exists so that
 * deploying this change cannot lock every administrator out before the new
 * collection has been populated.
 *
 * DELETE THIS once `admins` is populated and verified. Until it is gone, a
 * `user` document with role: "admin" still grants access, which is exactly the
 * weakness the `admins` collection was introduced to remove.
 */
function legacyRole(profile: DocumentData | null): AdminRole | null {
  if (!profile) return null;
  if (profile.archived === true) return null;
  return isAdminRole(profile.role) ? profile.role : null;
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

    const { email, profileDocId, profile } = await resolveEmail(identity);
    if (!email) {
      console.warn(`[admin-auth] no email resolvable for uid=${identity.uid}`);
      return null;
    }

    // If the `admins` collection is unreachable — misconfigured credentials, or
    // Firestore down — that must not deny every administrator at once. Fall
    // through to the legacy path below, which exists for exactly this.
    let record = null;
    try {
      record = await lookupAdmin(email);
    } catch (err) {
      console.error("[admin-auth] admins lookup failed:", (err as Error).message);
    }

    let role: AdminRole | null = record?.role ?? null;
    let source: AdminCaller["source"] = "admins";
    let name = record?.name ?? "";

    if (!role) {
      // Fall back to the legacy user document, loading it if resolveEmail did
      // not already have to.
      let legacyProfile = profile;
      if (!legacyProfile) {
        try {
          const snap = await getAdminDb().collection("user").doc(identity.uid).get();
          legacyProfile = snap.exists ? (snap.data() ?? null) : null;
        } catch {
          legacyProfile = null;
        }
      }

      role = legacyRole(legacyProfile);
      if (role) {
        source = "legacy";
        name =
          (typeof legacyProfile?.displayName === "string" && legacyProfile.displayName) ||
          (typeof legacyProfile?.name === "string" && legacyProfile.name) ||
          "";
        console.warn(
          `[admin-auth] LEGACY ROLE USED for ${email} (role=${role}) — add this ` +
            `address to the "admins" collection, then remove the fallback`
        );
      }
    }

    if (!role) {
      console.warn(`[admin-auth] ${email} is not an admin`);
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
      source,
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
