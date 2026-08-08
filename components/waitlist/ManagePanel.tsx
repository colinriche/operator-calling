"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimezoneField } from "@/components/waitlist/TimezoneField";
import { formatInZone, formatZoneLabel } from "@/lib/waitlist/timezone";
import type { TimezoneSource } from "@/lib/waitlist/constants";

interface ManageState {
  maskedEmail: string;
  audienceLabel: string | null;
  communityInterest: boolean;
  communityInterestStatus: string;
  groupId: string | null;
  groupMembership: string;
  testerStatus: string;
  timezone: string;
  timezoneSource: TimezoneSource;
  nextCall: string | null;
  scheduleLabel: string | null;
}

const STATUS_TEXT: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  withdrawn: "Withdrawn",
  left: "Left",
  none: "Not joined",
  member: "Member",
  eligible: "Joining when you create an account",
};

function StatusPill({ status }: { status: string }) {
  const good = status === "active" || status === "member";
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full border",
        good
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-muted/60 text-muted-foreground"
      )}
    >
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

export function ManagePanel({ token }: { token: string }) {
  const [state, setState] = useState<ManageState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("This link is incomplete. Use the link from your confirmation.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/waitlist/manage?t=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load this link");
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this link");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const res = await fetch("/api/waitlist/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Loading…
      </p>
    );
  }

  if (error && !state) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 p-8">
        <h1 className="font-heading font-bold text-2xl text-foreground mb-2">
          We couldn&apos;t open that link
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-4">{error}</p>
        <Link href="/waitlist" className="text-primary underline underline-offset-2">
          Back to the waitlist
        </Link>
      </div>
    );
  }

  if (!state) return null;

  const btn =
    "h-9 px-3.5 rounded-lg border border-border bg-background text-sm text-foreground hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors disabled:opacity-50";

  const communityActive = state.communityInterestStatus === "active";
  const isMember =
    state.groupMembership === "member" || state.groupMembership === "paused";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-3xl text-foreground mb-2">
          Your settings
        </h1>
        <p className="text-muted-foreground">
          {state.maskedEmail || "Your registration"}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}

      {/* Time zone first — it decides how everything below reads. */}
      <section className="bg-card rounded-2xl border border-border/60 p-6">
        <h2 className="font-heading font-semibold text-base text-foreground mb-3">
          Time zone
        </h2>
        <TimezoneField
          value={state.timezone}
          source={state.timezoneSource}
          onChange={(zone, src) => {
            if (src === "user_selected") void act("set_timezone", { timezone: zone });
          }}
        />
      </section>

      {/* Upcoming call */}
      {state.nextCall && (
        <section className="bg-card rounded-2xl border border-primary/40 p-6">
          <h2 className="font-heading font-semibold text-base text-foreground mb-2 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" aria-hidden="true" />
            Next call
          </h2>
          <p className="text-foreground">
            {formatInZone(new Date(state.nextCall), state.timezone)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Shown in {formatZoneLabel(state.timezone)}
            {state.scheduleLabel ? ` · set as ${state.scheduleLabel}` : ""}
          </p>
        </section>
      )}

      {/* Community interest — distinct from membership below. */}
      {state.communityInterest && (
        <section className="bg-card rounded-2xl border border-border/60 p-6">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="font-heading font-semibold text-base text-foreground">
              Community interest
            </h2>
            <StatusPill status={state.communityInterestStatus} />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Whether we let you know about calls for
            {state.audienceLabel ? ` ${state.audienceLabel}` : " this community"}.
            {isMember && " Separate from your membership of the group below."}
          </p>
          <div className="flex flex-wrap gap-2">
            {communityActive ? (
              <button
                type="button"
                className={btn}
                disabled={busy !== ""}
                onClick={() => void act("community_pause")}
              >
                Pause updates
              </button>
            ) : (
              <button
                type="button"
                className={btn}
                disabled={busy !== "" || state.communityInterestStatus === "withdrawn"}
                onClick={() => void act("community_resume")}
              >
                Resume updates
              </button>
            )}
            {state.communityInterestStatus !== "withdrawn" && (
              <button
                type="button"
                className={btn}
                disabled={busy !== ""}
                onClick={() => void act("community_withdraw")}
              >
                Withdraw interest
              </button>
            )}
          </div>
        </section>
      )}

      {/* Group membership — only once a group exists. */}
      {state.groupId && (
        <section className="bg-card rounded-2xl border border-border/60 p-6">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="font-heading font-semibold text-base text-foreground">
              Community group
            </h2>
            <StatusPill status={state.groupMembership} />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {state.groupMembership === "eligible"
              ? "The group is running. Create an account with this email address and you'll be added automatically."
              : state.groupMembership === "left"
                ? "You've left this group. Your original registration and its history are unaffected."
                : "Pausing keeps your place but takes you off the call list. Leaving removes you from the group."}
          </p>
          {isMember && (
            <div className="flex flex-wrap gap-2">
              {state.groupMembership === "member" ? (
                <button
                  type="button"
                  className={btn}
                  disabled={busy !== ""}
                  onClick={() => void act("group_pause")}
                >
                  Pause calls
                </button>
              ) : (
                <button
                  type="button"
                  className={btn}
                  disabled={busy !== ""}
                  onClick={() => void act("group_resume")}
                >
                  Resume calls
                </button>
              )}
              <button
                type="button"
                className={btn}
                disabled={busy !== ""}
                onClick={() => void act("group_leave")}
              >
                Leave group
              </button>
            </div>
          )}
        </section>
      )}

      {/* Early access — independent of both of the above. */}
      <section className="bg-card rounded-2xl border border-border/60 p-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h2 className="font-heading font-semibold text-base text-foreground">
            Early access
          </h2>
          <StatusPill status={state.testerStatus} />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Calls with people from across The Operator, separate from any community
          group.
        </p>
        <div className="flex flex-wrap gap-2">
          {state.testerStatus === "active" && (
            <>
              <button
                type="button"
                className={btn}
                disabled={busy !== ""}
                onClick={() => void act("tester_pause")}
              >
                Pause
              </button>
              <button
                type="button"
                className={btn}
                disabled={busy !== ""}
                onClick={() => void act("tester_leave")}
              >
                Leave early access
              </button>
            </>
          )}
          {state.testerStatus === "paused" && (
            <button
              type="button"
              className={btn}
              disabled={busy !== ""}
              onClick={() => void act("tester_resume")}
            >
              Resume
            </button>
          )}
          {(state.testerStatus === "none" || state.testerStatus === "left") && (
            <Link
              href={`/waitlist/tester?t=${encodeURIComponent(token)}`}
              className="inline-flex items-center h-9 px-3.5 rounded-lg gradient-gold border-0 text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Join early access
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
