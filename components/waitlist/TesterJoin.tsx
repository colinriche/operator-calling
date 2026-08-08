"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  TESTER_CAVEAT,
  TESTER_CONSENT_LABEL,
  TESTER_EXPLANATION,
  TESTER_HEADLINE,
  TESTER_LOGIN_REASON,
} from "@/lib/waitlist/copy";

interface Summary {
  maskedEmail: string;
  testerStatus: string;
  communityInterest: boolean;
  timezone: string | null;
}

export function TesterJoin({ token }: { token: string }) {
  const { user, loading: authLoading } = useAuth();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoadError("This link is incomplete. Use the link from your confirmation.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/waitlist/tester?t=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load this link");
      setSummary(data);
      if (data.testerStatus === "active") setJoined(true);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load this link"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleJoin() {
    if (!user) return;
    setError("");
    setSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/waitlist/tester", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ manageToken: token, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join");
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || authLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Loading…
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 p-8">
        <h1 className="font-heading font-bold text-2xl text-foreground mb-2">
          We couldn&apos;t open that link
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-4">{loadError}</p>
        <Link href="/waitlist" className="text-primary underline underline-offset-2">
          Back to the waitlist
        </Link>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 p-8">
        <CheckCircle className="w-12 h-12 text-primary mb-4" aria-hidden="true" />
        <h1 className="font-heading font-bold text-2xl text-foreground mb-3">
          You&apos;re in early access.
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          You&apos;ll be added to calls with people from across The Operator. We&apos;ll
          be in touch about times, shown in your own time zone
          {summary?.timezone ? ` (${summary.timezone.replace(/_/g, " ")})` : ""}.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed mt-4 pt-4 border-t border-border/60">
          Your interest in the group you originally registered for is unaffected —
          this is in addition to it, not instead of it.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-8">
      <h1 className="font-heading font-bold text-2xl text-foreground mb-3">
        {TESTER_HEADLINE}
      </h1>
      <p className="text-muted-foreground leading-relaxed mb-3">
        {TESTER_EXPLANATION}
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">
        {TESTER_CAVEAT}
      </p>

      {summary?.maskedEmail && (
        <p className="text-sm text-muted-foreground mb-6">
          Joining for <strong className="text-foreground">{summary.maskedEmail}</strong>
        </p>
      )}

      {!user ? (
        <div className="rounded-xl border border-border bg-background/60 p-5">
          <p className="text-sm text-foreground mb-1.5 font-medium">
            Sign in to continue
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            {TESTER_LOGIN_REASON}
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/waitlist/tester?t=${token}`)}`}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            Sign in or create an account
          </Link>
        </div>
      ) : (
        <>
          <label className="flex items-start gap-3 cursor-pointer mb-5">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
            <span className="text-sm text-foreground">{TESTER_CONSENT_LABEL}</span>
          </label>

          {error && (
            <p
              role="alert"
              className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg mb-4"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleJoin()}
            disabled={!consent || submitting}
            className="h-12 px-6 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Join early access
          </button>
        </>
      )}
    </div>
  );
}
