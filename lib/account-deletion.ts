import type { NextRequest } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";

// ─── Account deletion requests ───────────────────────────────────────────────
//
// Nothing here deletes an account. A request is a record in `deletionRequests`
// that the super admin works through by hand; the person keeps a 30 day window
// in which they can restore it themselves. One record per account, keyed by the
// account's primary `user` document id.

export const DELETION_REQUESTS = "deletionRequests";
export const RESTORE_WINDOW_DAYS = 30;

export const DELETION_REQUEST_TYPES = ["account_deletion", "permanent_deletion"] as const;
export type DeletionRequestType = (typeof DELETION_REQUEST_TYPES)[number];

export const DELETION_STATUSES = ["pending", "restored"] as const;
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
    status: data.status === "restored" ? "restored" : "pending",
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
