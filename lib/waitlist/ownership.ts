// ─── Who owns an outreach record ─────────────────────────────────────────────
//
// Pure rules, no Firestore, safe to import anywhere. Every route that lists or
// changes outreach data asks these questions rather than comparing roles itself,
// so the permission boundary lives in one place and is tested in one place.
//
// The model, in one paragraph. A demand source, its tracked links and its
// outreach records each carry `ownerId`: the owner's Firebase Auth UID. The name
// and email stored beside it (`ownerName`, `ownerEmail`) are for display only and
// decide nothing; an admin who changes their email keeps their records.
// The owner is the admin whose work it is; `createdBy` (a uid) stays as it was.
// An ordinary admin sees and changes only records they own. A super admin can
// see everyone's, and is the only one who can reassign. A record with no
// `ownerId` predates this feature: it is "unassigned" - never guessed at - and is
// visible only to a super admin until one assigns it.

import type { AdminRole } from "@/lib/admins";

/** The slice of AdminCaller these rules need. */
export interface OwnershipCaller {
  uid: string;
  /** Lowercased email, or "" for an operator whose session carries none. */
  email: string;
  name: string;
  role: AdminRole;
}

/**
 * The key for an admin: their Firebase Auth UID.
 *
 * Not their email. An email can change; the UID does not, so ownership survives
 * it. (The `admins` collection is keyed by email for a different reason - it is a
 * list of who may sign in - and is never what a record is owned by.)
 */
export function ownerIdFor(caller: Pick<OwnershipCaller, "uid">): string {
  return caller.uid;
}

export interface OwnerStamp {
  ownerId: string;
  /** Display only. */
  ownerName: string;
  /** Display only. Empty for an operator whose session carries no email. */
  ownerEmail: string;
}

/** Fields written onto a record being created by (and so owned by) this admin. */
export function ownerStampFor(caller: OwnershipCaller): OwnerStamp {
  return {
    ownerId: ownerIdFor(caller),
    ownerName: caller.name || caller.email || caller.uid,
    ownerEmail: caller.email,
  };
}

/** The owner recorded on a stored document, or null when it predates ownership. */
export function ownerIdOf(data: { ownerId?: unknown } | null | undefined): string | null {
  const id = data?.ownerId;
  return typeof id === "string" && id.trim() ? id : null;
}

export function ownerNameOf(data: { ownerId?: unknown; ownerName?: unknown } | null | undefined): string | null {
  if (!ownerIdOf(data)) return null;
  const name = data?.ownerName;
  return typeof name === "string" && name.trim() ? name : ownerIdOf(data);
}

export function ownerEmailOf(data: { ownerId?: unknown; ownerEmail?: unknown } | null | undefined): string | null {
  if (!ownerIdOf(data)) return null;
  const email = data?.ownerEmail;
  return typeof email === "string" && email.trim() ? email : null;
}

/**
 * A new record's owner when it hangs off an existing source: whoever owns the
 * source. A super admin adding a link to an admin's source does not take the
 * record away from that admin's view; who actually did it is in the activity
 * log. A legacy source passes on no owner at all.
 */
export function inheritedOwner(source: {
  ownerId?: unknown;
  ownerName?: unknown;
  ownerEmail?: unknown;
}): Partial<OwnerStamp> {
  const ownerId = ownerIdOf(source);
  if (!ownerId) return {};
  return {
    ownerId,
    ownerName: ownerNameOf(source) ?? ownerId,
    ownerEmail: ownerEmailOf(source) ?? "",
  };
}

// ─── Scope: which records a list request is allowed to see ───────────────────

export type ScopeFilter =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "owner"; ownerId: string };

export type ScopeDecision =
  | { ok: true; filter: ScopeFilter }
  | { ok: false; status: 403; error: string };

const OWNER_PREFIX = "owner:";

/**
 * Turn the `?scope=` a browser sent into what the server will actually allow.
 *
 *   (absent)            an ordinary admin's own records; a super admin's everything.
 *   "mine"              the caller's own records, whoever they are.
 *   "all"               every admin's records, plus unassigned. super_admin only.
 *   "unassigned"        records that predate ownership. super_admin only.
 *   "owner:<uid>"       one admin's records. super_admin only - except that an
 *                       ordinary admin naming themselves is just "mine".
 *
 * The role comes from requireAdmin, i.e. the `admins` collection, never from
 * anything in the request. An ordinary admin asking for anything wider is refused
 * outright rather than quietly narrowed, so a tampered request is visible in the
 * logs and the UI cannot appear to work while showing something else.
 */
export function resolveScope(caller: OwnershipCaller, requested: string | null | undefined): ScopeDecision {
  const me = ownerIdFor(caller);
  const raw = (requested ?? "").trim();

  // No scope named: what each role looks at first. An ordinary admin starts on
  // their own work. A super admin starts on everything - the records that predate
  // ownership have no owner to show under "mine", so defaulting a super admin to
  // it would open an empty page over all the existing data.
  if (raw === "") {
    return caller.role === "super_admin"
      ? { ok: true, filter: { kind: "all" } }
      : { ok: true, filter: { kind: "owner", ownerId: me } };
  }
  if (raw === "mine") return { ok: true, filter: { kind: "owner", ownerId: me } };

  if (raw.startsWith(OWNER_PREFIX)) {
    const ownerId = raw.slice(OWNER_PREFIX.length).trim();
    if (!ownerId) return { ok: false, status: 403, error: "Name an admin to filter by" };
    if (ownerId === me) return { ok: true, filter: { kind: "owner", ownerId: me } };
    if (caller.role !== "super_admin") return refused();
    return { ok: true, filter: { kind: "owner", ownerId } };
  }

  if (raw === "all" || raw === "unassigned") {
    if (caller.role !== "super_admin") return refused();
    return { ok: true, filter: { kind: raw } };
  }

  return { ok: false, status: 403, error: "Unknown scope" };
}

function refused(): ScopeDecision {
  return {
    ok: false,
    status: 403,
    error: "Only a super admin can view other admins' outreach work",
  };
}

export function matchesScope(data: { ownerId?: unknown } | null | undefined, filter: ScopeFilter): boolean {
  const owner = ownerIdOf(data);
  switch (filter.kind) {
    case "all":
      return true;
    case "unassigned":
      return owner === null;
    case "owner":
      return owner === filter.ownerId;
  }
}

// ─── Access to one record ────────────────────────────────────────────────────

/**
 * May this caller read or change this one record?
 *
 * A super admin: any. An ordinary admin: only a record they own. An unassigned
 * record is therefore a super admin's until one assigns it - an ordinary admin
 * cannot claim a record by editing it.
 */
export function canAccessRecord(caller: OwnershipCaller, data: { ownerId?: unknown } | null | undefined): boolean {
  if (caller.role === "super_admin") return true;
  return ownerIdOf(data) === ownerIdFor(caller);
}

/** Display name for a record's owner, with the legacy case spelled out. */
export function ownerLabel(data: { ownerId?: unknown; ownerName?: unknown } | null | undefined): string {
  return ownerNameOf(data) ?? "Unassigned (legacy)";
}
