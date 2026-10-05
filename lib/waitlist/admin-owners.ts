// Server-only. Maps admins to the Firebase UIDs that own outreach records.

import { getAdminAuth } from "@/lib/firebase-admin";
import { listAdmins, lookupAdmin, lookupAdminById } from "@/lib/admins";

// ─── From the admin list to an owner ─────────────────────────────────────────
//
// Outreach records are owned by a Firebase Auth UID (lib/waitlist/ownership.ts),
// but the `admins` collection names people by email (or by uid, for an operator
// with no email). Anything that has to turn "this admin" into an owner - the
// filter choices, reassignment - goes through here.
//
// An admin who has never signed in has no UID yet, so they cannot own anything
// and are not offered. That is deliberate: guessing a UID would be inventing
// ownership. They appear as soon as they sign in once.
//
// One person can hold several UIDs (phone and Google sign-in mint different
// ones). Email lookup finds the UID linked to that address, which is the one
// their email sign-in uses; a record created while signed in a different way is
// owned by that other UID. See docs/admin-roles.md.

export interface AdminOwner {
  /** Firebase Auth UID - what `ownerId` holds. */
  id: string;
  /** Display only. */
  name: string;
  /** Display only. */
  email: string;
}

const LOOKUP_BATCH = 100; // Auth.getUsers accepts at most 100 identifiers.

export async function listAdminOwners(): Promise<AdminOwner[]> {
  const admins = await listAdmins();
  const owners: AdminOwner[] = [];

  // Records named by uid already carry the identity.
  for (const a of admins.filter((a) => !a.email.includes("@"))) {
    owners.push({ id: a.email, name: a.name || a.email, email: "" });
  }

  const byEmail = admins.filter((a) => a.email.includes("@"));
  const auth = getAdminAuth();
  for (let i = 0; i < byEmail.length; i += LOOKUP_BATCH) {
    const chunk = byEmail.slice(i, i + LOOKUP_BATCH);
    const { users } = await auth.getUsers(chunk.map((a) => ({ email: a.email })));
    for (const user of users) {
      const record = chunk.find((a) => a.email === (user.email ?? "").toLowerCase());
      if (record) owners.push({ id: user.uid, name: record.name || record.email, email: record.email });
    }
  }

  return owners.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The admin that a UID belongs to, or null when that UID is not on the admins
 * list. Used to check a reassignment target: work can only be handed to somebody
 * who can sign in and see it.
 */
export async function resolveAdminOwner(uid: string): Promise<AdminOwner | null> {
  const id = uid.trim();
  if (!id || id.includes("/") || id.includes("@")) return null;

  const named = await lookupAdminById(id);
  if (named) return { id, name: named.name || id, email: "" };

  try {
    const user = await getAdminAuth().getUser(id);
    const email = (user.email ?? "").toLowerCase();
    const record = email ? await lookupAdmin(email) : null;
    return record ? { id, name: record.name || record.email, email: record.email } : null;
  } catch (err) {
    if ((err as { code?: string }).code === "auth/user-not-found") return null;
    throw err;
  }
}
