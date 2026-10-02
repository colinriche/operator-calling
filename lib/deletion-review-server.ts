// Server-only: applies an admin's review of an account deletion request.

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  DELETION_REQUESTS,
  normaliseDeletionStatus,
  toAdminDeletionRequestView,
  type AdminDeletionRequestView,
} from "@/lib/account-deletion";
import { planReview, validateReview } from "@/lib/deletion-review";

export class ReviewRefusal extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export interface Reviewer {
  uid: string;
  email: string;
  name: string;
}

/** Deletes the account. In production this calls the app's archive-and-delete function. */
export type DeleteAccount = (userId: string, reason: string) => Promise<{ archiveId?: string | null }>;

export async function reviewDeletionRequest(
  db: Firestore,
  requestId: string,
  caller: Reviewer,
  rawInput: unknown,
  deleteAccount: DeleteAccount,
  now: Date = new Date()
): Promise<AdminDeletionRequestView> {
  const validated = validateReview(rawInput);
  if (!validated.ok) throw new ReviewRefusal(validated.error);

  const ref = db.collection(DELETION_REQUESTS).doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new ReviewRefusal("Deletion request not found.", 404);
  const data = snap.data() ?? {};
  const view = toAdminDeletionRequestView(snap.id, data);

  const plan = planReview(validated.value, {
    status: normaliseDeletionStatus(data.status),
    restoreUntil: view.restoreUntil,
    userIds: view.userIds.length ? view.userIds : [view.userId],
    email: view.email,
    caller: { uid: caller.uid, email: caller.email },
    now,
  });
  if (!plan.ok) throw new ReviewRefusal(plan.error, plan.status);

  const log = {
    action: plan.kind,
    adminUid: caller.uid,
    adminEmail: caller.email,
    adminName: caller.name,
    reason: validated.value.reason,
    early: plan.early,
    at: Timestamp.fromDate(now),
  };

  if (plan.kind === "decline") {
    await ref.set(
      {
        status: "declined",
        adminNote: validated.value.reason,
        userMessage: validated.value.userMessage,
        reviewedBy: caller.email,
        reviewedAt: Timestamp.fromDate(now),
        updatedAt: FieldValue.serverTimestamp(),
        reviewLog: FieldValue.arrayUnion(log),
      },
      { merge: true }
    );
  } else {
    // Delete FIRST, record after. If the deletion fails the request stays
    // pending and nothing claims it happened; the admin sees the error and can
    // retry.
    const reason = validated.value.reason || "Account deletion request approved by an admin";
    const { archiveId } = await deleteAccount(view.userId, reason);
    await ref.set(
      {
        status: "completed",
        adminNote: validated.value.reason,
        reviewedBy: caller.email,
        reviewedAt: Timestamp.fromDate(now),
        completedAt: Timestamp.fromDate(now),
        completedBy: caller.email,
        archiveId: archiveId ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        reviewLog: FieldValue.arrayUnion(log),
      },
      { merge: true }
    );
  }

  const after = await ref.get();
  return toAdminDeletionRequestView(after.id, after.data() ?? {});
}
