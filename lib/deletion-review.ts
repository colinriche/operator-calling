// Pure rules for an admin reviewing an account deletion request. No Firestore,
// no Admin SDK: unit-tested on its own. The server half is
// lib/deletion-review-server.ts.
//
// An account is deleted ONLY here: a super admin reviews a request and either
// deletes the account or declines the request. Nothing a user can call deletes
// anything.

import type { DeletionStatus } from "@/lib/account-deletion";

export type ReviewAction = "delete" | "decline";

export interface ReviewInput {
  action: ReviewAction;
  /** Internal: why. Kept for the audit trail, never shown to the person. */
  reason?: string;
  /** Decline only: what the person is told. Optional. */
  userMessage?: string;
  /** Delete: the admin has seen the confirmation. */
  confirm?: boolean;
  /** Delete before the person's 30 day window has ended. */
  confirmEarly?: boolean;
}

export const MAX_TEXT = 2000;

export type Validated =
  | { ok: true; value: ReviewInput & { reason: string; userMessage: string } }
  | { ok: false; error: string };

function trimmed(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function validateReview(raw: unknown): Validated {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request." };
  const input = raw as Record<string, unknown>;
  const action = input.action;
  if (action !== "delete" && action !== "decline") return { ok: false, error: "Unknown action." };

  const reason = trimmed(input.reason);
  const userMessage = trimmed(input.userMessage, 500);

  if (action === "decline" && !reason) {
    return { ok: false, error: "Give a reason for declining. It goes in the audit trail." };
  }
  if (action === "delete" && input.confirm !== true) {
    return { ok: false, error: "Confirm the deletion. It removes the account." };
  }
  return {
    ok: true,
    value: {
      action,
      reason,
      userMessage,
      confirm: input.confirm === true,
      confirmEarly: input.confirmEarly === true,
    },
  };
}

export interface ReviewContext {
  status: DeletionStatus;
  /** ISO. When the person's window to withdraw ends. */
  restoreUntil: string | null;
  /** Every id the request covers (the primary `user` doc id and any linked uid). */
  userIds: string[];
  email: string;
  caller: { uid: string; email: string };
  now: Date;
}

export type ReviewPlan =
  | { ok: true; kind: ReviewAction; early: boolean }
  | { ok: false; error: string; status: number };

const NOT_PENDING: Record<Exclude<DeletionStatus, "pending">, string> = {
  restored: "The person withdrew this request.",
  declined: "This request was already declined.",
  completed: "This account has already been deleted.",
};

export function planReview(value: Extract<Validated, { ok: true }>["value"], ctx: ReviewContext): ReviewPlan {
  if (ctx.status !== "pending") {
    return { ok: false, error: NOT_PENDING[ctx.status], status: 409 };
  }

  if (value.action === "decline") return { ok: true, kind: "decline", early: false };

  // An admin cannot delete their own account from here.
  const sameEmail =
    !!ctx.email && !!ctx.caller.email && ctx.email.toLowerCase() === ctx.caller.email.toLowerCase();
  if (ctx.userIds.includes(ctx.caller.uid) || sameEmail) {
    return { ok: false, error: "You can't delete your own account from here.", status: 400 };
  }

  const until = ctx.restoreUntil ? new Date(ctx.restoreUntil) : null;
  const early = !until || until > ctx.now;
  if (early && !value.confirmEarly) {
    const when = until ? until.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "an unknown date";
    return {
      ok: false,
      error: `The person can still withdraw this request until ${when}. Delete anyway only if you are sure.`,
      status: 409,
    };
  }
  return { ok: true, kind: "delete", early };
}
