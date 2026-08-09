"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, PhoneOff, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// ─── Calls On / Off, for whoever runs the group ──────────────────────────────
//
// A community group is created with its schedule ready and calls off, because
// nobody has yet taken responsibility for running it. This is the control that
// ends that state — and it is deliberately the group admin's to press, not
// something that flips on when they are appointed.

interface CallsState {
  callsEnabled: boolean;
  callsPausedReason: string | null;
  groupAdminId: string | null;
  nextCall: string | null;
}

const REASON_TEXT: Record<string, string> = {
  awaiting_group_admin:
    "This group was created automatically from waitlist demand. Calls start when you turn them on.",
  admin_paused: "An Operator administrator paused calls for this group.",
  group_admin_paused: "You paused calls for this group.",
};

export function GroupCallsToggle({ groupId }: { groupId: string | null }) {
  const { user } = useAuth();
  const [state, setState] = useState<CallsState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user || !groupId) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/groups/${groupId}/calls`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load call status");
      setState(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(enable: boolean) {
    if (!user || !groupId) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/groups/${groupId}/calls`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ callsEnabled: enable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not change calls");
      toast.success(
        enable
          ? "Calls on — starting from the next scheduled time"
          : "Calls paused — your schedule is unchanged"
      );
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not change calls");
    } finally {
      setSaving(false);
    }
  }

  if (!groupId || (!state && !loading)) return null;

  const enabled = state?.callsEnabled === true;

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 mb-6",
        enabled ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-base text-foreground flex items-center gap-2 mb-1">
            {enabled ? (
              <Phone className="w-4 h-4 text-primary" aria-hidden="true" />
            ) : (
              <PhoneOff className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            )}
            {enabled ? "Calls on" : "Calls paused"}
          </h2>

          {loading && !state ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : enabled ? (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
              {state?.nextCall
                ? `Next call ${new Date(state.nextCall).toLocaleString()}`
                : "Running on the group schedule"}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {REASON_TEXT[state?.callsPausedReason ?? ""] ??
                "Calls are not running for this group."}{" "}
              Your schedule is stored and unchanged.
            </p>
          )}
        </div>

        <Button
          size="sm"
          variant={enabled ? "outline" : "default"}
          disabled={saving}
          onClick={() => void toggle(!enabled)}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {enabled ? "Pause calls" : "Turn calls on"}
        </Button>
      </div>
    </div>
  );
}
