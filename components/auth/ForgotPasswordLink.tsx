"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

// ─── Forgot password ─────────────────────────────────────────────────────────
//
// Firebase sends the email and hosts the page the link opens, so there is no
// reset route of our own to keep in step with it — and no password ever reaches
// this site.
//
// The reply is deliberately the same whether or not the address has an account,
// and whether or not that account has a password at all: a sign-in form that
// answers "no account found" tells anyone who asks which addresses are
// registered here. Genuine faults — a network failure, too many attempts — are
// still reported, because those are the caller's own problem to act on.
//
// Shared by both sign-in forms, which carry their own copies of these fields.

/** Enough of a check to catch a half-typed address before sending. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ForgotPasswordLink({ email }: { email: string }) {
  const [sending, setSending] = useState(false);

  async function reset() {
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      toast.error("Type your email address above first, then choose Forgot password.");
      return;
    }

    setSending(true);
    try {
      await sendPasswordResetEmail(auth, address);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/too-many-requests") {
        toast.error("Too many attempts — wait a moment before trying again.");
        return;
      }
      if (code === "auth/network-request-failed") {
        toast.error("Network error — check your connection and try again.");
        return;
      }
      // Everything else, auth/user-not-found included, falls through to the
      // same confirmation below.
      console.error("[forgot password]", err);
    } finally {
      setSending(false);
    }

    toast.success(
      `If ${address} has an account with a password, a reset link is on its way. Check your spam folder if it does not arrive.`
    );
  }

  return (
    <button
      type="button"
      onClick={() => void reset()}
      disabled={sending}
      className="text-xs text-primary hover:underline disabled:opacity-60"
    >
      {sending ? "Sending…" : "Forgot password?"}
    </button>
  );
}
