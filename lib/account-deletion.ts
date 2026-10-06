import type { NextRequest } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";

// ─── Account deletion requests ───────────────────────────────────────────────
//
// Nothing here deletes an account. A request is a record in `deletionRequests`
// that a super admin reviews (lib/deletion-review.ts): they delete the account,
// or decline the request. The person keeps a 30 day window in which they can
// withdraw it themselves. One record per account, keyed by the account's primary
// `user` document id. Requests come from this website and from the mobile app
// (`source: "app"`); both land in the same queue.

export const DELETION_REQUESTS = "deletionRequests";
export const RESTORE_WINDOW_DAYS = 30;

export const DELETION_REQUEST_TYPES = ["account_deletion", "permanent_deletion"] as const;
export type DeletionRequestType = (typeof DELETION_REQUEST_TYPES)[number];

/**
 * pending    - waiting for the person's window to end (the app then deletes it
 *               automatically) or for an admin to act
 * processing - the deletion is running right now (app sweep or an admin)
 * restored   - the person withdrew it
 * declined   - an admin declined it (legacy; the app no longer declines)
 * completed  - the account was deleted
 * failed     - the automatic deletion errored; it is not retried until an admin looks
 * held       - a legal hold: never deleted until it is set back to pending
 * Written by functions/account_deletion.js in the app repo; keep in step.
 */
export const DELETION_STATUSES = [
  "pending",
  "processing",
  "restored",
  "declined",
  "completed",
  "failed",
  "held",
] as const;
export type DeletionStatus = (typeof DELETION_STATUSES)[number];

/** What the browser sees. Dates are ISO strings. */
export interface DeletionRequestView {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  requestType: DeletionRequestType;
  status: DeletionStatus;
  reason: string;
  requestedAt: string | null;
  restoreUntil: string | null;
  restoredAt: string | null;
}

function toIso(value: unknown): string | null {
  const date =
    (value as { toDate?: () => Date } | null)?.toDate?.() ??
    (value instanceof Date ? value : null);
  return date ? date.toISOString() : null;
}

/**
 * A missing status is a request filed before statuses existed, so pending. A
 * status this code does not know is NOT treated as pending: it is shown as a
 * hold, so an admin can never delete on the strength of a state they can't see.
 */
export function normaliseDeletionStatus(value: unknown): DeletionStatus {
  if (value === undefined || value === null || value === "") return "pending";
  return (DELETION_STATUSES as readonly string[]).includes(value as string)
    ? (value as DeletionStatus)
    : "held";
}

/**
 * What an ADMIN sees: the request plus how to recognise the person (mobile
 * accounts are often phone-only) and the review history. Admin-only: it carries
 * the internal note, so it is never returned to the person who filed the request.
 */
export interface AdminDeletionRequestView extends DeletionRequestView {
  username: string;
  phoneNumber: string;
  systemName: string;
  source: string;
  userIds: string[];
  /** Internal. Why an admin declined or deleted. */
  adminNote: string;
  /** What the person was told when it was declined. */
  userMessage: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
}

export function toAdminDeletionRequestView(
  id: string,
  data: FirebaseFirestore.DocumentData
): AdminDeletionRequestView {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    ...toDeletionRequestView(id, data),
    username: s(data.username),
    phoneNumber: s(data.phoneNumber),
    systemName: s(data.systemName),
    source: s(data.source) || "website",
    userIds: Array.isArray(data.userIds) ? data.userIds.filter((v: unknown) => typeof v === "string") : [],
    adminNote: s(data.adminNote),
    userMessage: s(data.userMessage),
    reviewedBy: s(data.reviewedBy) || null,
    reviewedAt: toIso(data.reviewedAt),
    completedAt: toIso(data.completedAt),
  };
}

export function toDeletionRequestView(
  id: string,
  data: FirebaseFirestore.DocumentData
): DeletionRequestView {
  return {
    id,
    userId: String(data.userId ?? id),
    email: String(data.email ?? ""),
    displayName: String(data.displayName ?? ""),
    requestType: data.requestType === "permanent_deletion" ? "permanent_deletion" : "account_deletion",
    status: normaliseDeletionStatus(data.status),
    reason: typeof data.reason === "string" ? data.reason : "",
    requestedAt: toIso(data.requestedAt),
    restoreUntil: toIso(data.restoreUntil),
    restoredAt: toIso(data.restoredAt),
  };
}

export interface AccountContext {
  db: Firestore;
  uid: string;
  email: string;
  /** Primary `user` document id - also the deletion request's id. */
  primaryId: string;
  userIds: string[];
  displayName: string;
}

/**
 * The signed-in person's account, resolved the way the account delete route
 * always has: their auth uid, plus a linked app profile only when it can be
 * shown to be theirs (same email, or an explicit link).
 */
export async function resolveAccount(
  req: NextRequest,
  profileDocId: string | undefined
): Promise<AccountContext | { error: string; status: number }> {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return { error: "Unauthenticated", status: 401 };

  const { db, adminAuth } = getAdminServices();
  const decoded = await adminAuth.verifyIdToken(token);
  const authUser = await adminAuth.getUser(decoded.uid);
  const userIds = [decoded.uid];
  let primaryId = decoded.uid;

  let profileData: FirebaseFirestore.DocumentData | undefined;
  if (profileDocId && profileDocId !== decoded.uid) {
    const profileSnap = await db.collection("user").doc(profileDocId).get();
    profileData = profileSnap.data();
    const sameEmail =
      !!authUser.email &&
      typeof profileData?.email === "string" &&
      profileData.email.toLowerCase() === authUser.email.toLowerCase();
    const explicitlyLinked =
      profileData?.linkedWebUid === decoded.uid || profileData?.webUid === decoded.uid;

    if (!profileSnap.exists || (!sameEmail && !explicitlyLinked)) {
      return { error: "Linked account could not be verified", status: 403 };
    }
    userIds.push(profileDocId);
    primaryId = profileDocId;
  } else {
    profileData = (await db.collection("user").doc(decoded.uid).get()).data();
  }

  const name = profileData?.displayName ?? profileData?.name ?? authUser.displayName ?? "";
  return {
    db,
    uid: decoded.uid,
    email: authUser.email ?? (typeof profileData?.email === "string" ? profileData.email : ""),
    primaryId,
    userIds,
    displayName: typeof name === "string" ? name : "",
  };
}
