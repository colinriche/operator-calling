// Server-only: the admin activity log. Never import from a Client Component.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { ownerIdFor, ownerIdOf, type OwnershipCaller } from "@/lib/waitlist/ownership";

// ─── What admins did, kept apart from what visitors did ──────────────────────
//
// Two different streams, deliberately in different collections:
//
//   adminActivity               a named admin acted on a record (this file)
//   sourceVisits, shareEvents   an anonymous visitor used a tracked link
//
// Visitor events hold no identity at all and must never be given one; admin
// events are all identity. Mixing them in one collection would make "who" a field
// that is sometimes a person and sometimes nobody. They meet only in the
// super-admin view, which reads both and keeps them in separate lists.
//
// Written server-side only. The collection has no client rules (see
// docs/firestore-rules.md), so no browser can add, edit or erase an entry.

export const ADMIN_ACTIONS = [
  "source.create",
  "source.update",
  "source.review",
  "source.archive",
  "source.unarchive",
  "source.delete",
  "source.reassign",
  "source.group_create",
  "source.group_link",
  "source.image",
  "link.create",
  "link.update",
  "outreach.create",
  "outreach.update",
  "outreach.copied",
  "outreach.posted",
  "registrations.view",
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type AdminTargetType = "source" | "link" | "outreach";

export interface AdminActivityInput {
  action: AdminAction;
  targetType: AdminTargetType;
  targetId: string;
  /** The source the target belongs to (the target itself, for a source). */
  demandSourceId: string;
  /** Owner of the target at the time, so an owner can see work done on their records. */
  ownerId?: string | null;
  /** One human sentence. No registrant data: this is read by every admin who owns the record. */
  summary: string;
}

export interface AdminActivityRow {
  id: string;
  at: string | null;
  actorId: string;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  demandSourceId: string;
  ownerId: string | null;
  summary: string;
}

// `update`, not `set`: it must never create a source document that was not there.
const BUMPS_LAST_ACTIVITY = (action: AdminAction) =>
  action !== "source.delete" && action !== "registrations.view";

/**
 * Record one admin action.
 *
 * Never throws. An audit write that fails must not undo or block the thing the
 * admin actually did, so a failure is logged loudly and swallowed. The cost is a
 * missing entry rather than a lost edit; the console line is the backstop.
 */
export async function recordAdminActivity(
  db: Firestore,
  caller: OwnershipCaller,
  input: AdminActivityInput
): Promise<void> {
  try {
    await db.collection(COLLECTIONS.adminActivity).add({
      at: FieldValue.serverTimestamp(),
      actorId: ownerIdFor(caller),
      actorEmail: caller.email,
      actorName: caller.name,
      actorRole: caller.role,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      demandSourceId: input.demandSourceId,
      ownerId: ownerIdOf(input) ?? null,
      summary: input.summary.slice(0, 300),
    });

    // "Last activity" for the list. Changes only: reading registrations is
    // logged but is not work on the source, and a deleted source has no row.
    if (BUMPS_LAST_ACTIVITY(input.action) && input.demandSourceId) {
      await db
        .collection(COLLECTIONS.demandSources)
        .doc(input.demandSourceId)
        .update({
          lastAdminActivityAt: FieldValue.serverTimestamp(),
          lastAdminActivityBy: caller.name || caller.email || caller.uid,
        });
    }
  } catch (err) {
    console.error(`[admin-activity] failed to record ${input.action} by ${caller.email || caller.uid}:`, err);
  }
}

export function toActivityRow(id: string, d: FirebaseFirestore.DocumentData): AdminActivityRow {
  const at = (d.at as { toDate?: () => Date } | undefined)?.toDate?.();
  return {
    id,
    at: at ? at.toISOString() : null,
    actorId: d.actorId ?? "",
    actorEmail: d.actorEmail ?? "",
    actorName: d.actorName ?? "",
    actorRole: d.actorRole ?? "",
    action: d.action ?? "",
    targetType: d.targetType ?? "",
    targetId: d.targetId ?? "",
    demandSourceId: d.demandSourceId ?? "",
    ownerId: typeof d.ownerId === "string" && d.ownerId ? d.ownerId : null,
    summary: d.summary ?? "",
  };
}
