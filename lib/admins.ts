// Server-only: the `admins` collection. Never import from a Client Component.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

// ─── Where administrative authority is defined ───────────────────────────────
//
// One collection, one document per person, keyed by their email address in
// lowercase. Membership of this collection IS the permission — there is no
// second place to check and no way to acquire a role by editing your own
// profile.
//
// Deliberately separate from the `user` collection. A `user` document is a
// record of somebody who signed up; it is written by sign-up flows, by the
// mobile app and by account-linking code, and its `role` field was therefore
// reachable by several paths that had no business granting administrative
// access. `admins` is written by exactly one route, which demands super_admin.
//
// Keyed by email rather than by uid because a person is not a uid: phone auth
// mints a fresh Firebase UID, the custom-token admin login uses the Firestore
// document id as the uid, and the same human can hold several. Their email is
// the thing that stays put across all of it — and it is what someone typing an
// address into the admin panel actually knows.
//
// Lives in `operator-calling`, the one project the website uses — the same
// project that issues the caller's token, so authentication and authorisation
// now read from the same place.

export const ADMINS_COLLECTION = "admins";

export type AdminRole = "admin" | "super_admin";

export const ADMIN_ROLES: readonly AdminRole[] = ["admin", "super_admin"];

export interface AdminRecord {
  /** Document id — the lowercased email. */
  email: string;
  name: string;
  role: AdminRole;
  createdAt: string | null;
  updatedAt: string | null;
  /** Email of the super_admin who last wrote this record; null when seeded by hand. */
  updatedBy: string | null;
}

export function adminsDb(): Firestore {
  return getAdminDb();
}

/**
 * Document id for an email. Trimmed and lowercased so that `Colin@x.com` and
 * `colin@x.com` are one admin rather than two, and so a lookup can never miss
 * because of how somebody capitalised their address when signing in.
 */
export function adminDocId(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdminRole(value: unknown): value is AdminRole {
  return value === "admin" || value === "super_admin";
}

// ─── Capabilities ────────────────────────────────────────────────────────────
//
// What each role may do, in one place. Routes ask these questions rather than
// comparing role strings, so widening or narrowing a permission is a change
// here and not a hunt through twenty files.

/** Everything an admin can do, a super_admin can do. */
export function canAdminister(role: AdminRole): boolean {
  return role === "admin" || role === "super_admin";
}

/** Create, edit and remove admin records. super_admin only. */
export function canManageAdmins(role: AdminRole): boolean {
  return role === "super_admin";
}

/** Edit, archive and delete user accounts. super_admin only. */
export function canManageUsers(role: AdminRole): boolean {
  return role === "super_admin";
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

function toIso(value: unknown): string | null {
  const date =
    (value as { toDate?: () => Date } | null)?.toDate?.() ??
    (value instanceof Date ? value : null);
  return date ? date.toISOString() : null;
}

export function toAdminRecord(id: string, data: FirebaseFirestore.DocumentData): AdminRecord | null {
  if (!isAdminRole(data.role)) return null;
  return {
    email: id,
    name: typeof data.name === "string" ? data.name : "",
    role: data.role,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

/**
 * The admin record for an email, or null.
 *
 * Returns null for a document carrying an unrecognised `role` rather than
 * treating it as an admin — a typo in a hand-written record must fail closed.
 */
export async function lookupAdmin(email: string): Promise<AdminRecord | null> {
  const id = adminDocId(email);
  if (!id) return null;

  const snap = await adminsDb().collection(ADMINS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;

  const record = toAdminRecord(snap.id, snap.data() ?? {});
  if (!record) {
    console.warn(`[admins] ${id} has an invalid role — refusing access`);
  }
  return record;
}

export async function listAdmins(): Promise<AdminRecord[]> {
  const snap = await adminsDb().collection(ADMINS_COLLECTION).get();
  return snap.docs
    .map((d) => toAdminRecord(d.id, d.data()))
    .filter((r): r is AdminRecord => r !== null)
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** How many super_admins exist. Used to refuse removing the last one. */
export async function countSuperAdmins(): Promise<number> {
  const snap = await adminsDb()
    .collection(ADMINS_COLLECTION)
    .where("role", "==", "super_admin")
    .get();
  return snap.size;
}

export async function upsertAdmin(args: {
  email: string;
  name: string;
  role: AdminRole;
  actorEmail: string;
}): Promise<AdminRecord> {
  const id = adminDocId(args.email);
  const ref = adminsDb().collection(ADMINS_COLLECTION).doc(id);
  const existing = await ref.get();

  await ref.set(
    {
      name: args.name,
      role: args.role,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: args.actorEmail,
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );

  const after = await ref.get();
  return toAdminRecord(after.id, after.data() ?? {})!;
}

export async function deleteAdmin(email: string): Promise<void> {
  await adminsDb().collection(ADMINS_COLLECTION).doc(adminDocId(email)).delete();
}
