"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionInput, DurationPreset, ModerationAction } from "@/lib/moderation-model";

// One form for every moderation action, on a report and on a user's profile.
// It collects what the server validates again (lib/moderation-model.ts), so the
// rules are enforced in one place and this only shapes the input.

export interface ActionChoice {
  action: ModerationAction;
  label: string;
  hint: string;
  tone?: "default" | "destructive";
}

export const REPORT_ACTIONS: ActionChoice[] = [
  { action: "dismiss", label: "Dismiss report", hint: "No action against the account. The reason is optional." },
  { action: "warn", label: "Warn user", hint: "Records a warning against the account." },
  {
    action: "suspend",
    label: "Suspend user",
    hint: "Temporarily stops calls and invites. Choose how long.",
    tone: "destructive",
  },
  {
    action: "disable_auto_calls",
    label: "Disable auto calls",
    hint: "Removed from random matching. Direct calls still work.",
  },
  { action: "ban", label: "Ban user", hint: "Disables the account. Needs confirming.", tone: "destructive" },
  { action: "note", label: "Add admin note", hint: "Internal only. Does not change the report or the account." },
];

export const USER_ACTIONS: ActionChoice[] = [
  { action: "warn", label: "Warn user", hint: "Records a warning against the account." },
  { action: "suspend", label: "Suspend user", hint: "Temporarily stops calls and invites.", tone: "destructive" },
  { action: "unsuspend", label: "Lift suspension", hint: "Restores the account now." },
  { action: "disable_auto_calls", label: "Disable auto calls", hint: "Removed from random matching." },
  { action: "enable_auto_calls", label: "Enable auto calls", hint: "Back in random matching." },
  { action: "ban", label: "Ban user", hint: "Disables the account. Needs confirming.", tone: "destructive" },
  { action: "unban", label: "Unban user", hint: "Restores a banned account." },
];

const PRESETS: { id: DurationPreset; label: string }[] = [
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "custom", label: "Custom date" },
];

export function ModerationActionForm({
  choices,
  busy,
  onSubmit,
}: {
  choices: ActionChoice[];
  busy: boolean;
  onSubmit: (input: ActionInput) => Promise<boolean>;
}) {
  const [action, setAction] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [note, setNote] = useState("");
  const [preset, setPreset] = useState<DurationPreset>("7d");
  const [until, setUntil] = useState("");
  const [confirmBan, setConfirmBan] = useState(false);

  const choice = choices.find((c) => c.action === action) ?? null;
  const isNote = action === "note";
  const showUserMessage = action === "suspend" || action === "disable_auto_calls" || action === "ban";

  function reset() {
    setAction(null);
    setReason("");
    setUserMessage("");
    setNote("");
    setPreset("7d");
    setUntil("");
    setConfirmBan(false);
  }

  async function submit() {
    if (!action) return;
    const input: ActionInput = {
      action,
      reason,
      userMessage,
      note,
      ...(action === "suspend"
        ? { duration: { preset, ...(preset === "custom" && until ? { until: new Date(until).toISOString() } : {}) } }
        : {}),
      ...(action === "ban" ? { confirm: true } : {}),
    };
    if (await onSubmit(input)) reset();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <Button
            key={c.action}
            type="button"
            size="sm"
            variant={action === c.action ? "default" : "outline"}
            className={c.tone === "destructive" && action !== c.action ? "border-destructive/30 text-destructive" : ""}
            disabled={busy}
            onClick={() => {
              setAction(c.action);
              setConfirmBan(false);
            }}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {choice && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">{choice.hint}</p>

          {action === "suspend" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">How long</label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={`text-xs rounded-lg border px-3 py-1.5 ${
                      preset === p.id ? "border-primary bg-primary/10 text-primary" : "border-border"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {preset === "custom" && (
                <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
              )}
            </div>
          )}

          {isNote ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Note (internal)</label>
              <textarea
                className="w-full min-h-24 rounded-lg border border-border bg-background p-2 text-sm"
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                {action === "dismiss" ? "Reason (optional)" : "Reason (internal, goes in the audit trail)"}
              </label>
              <textarea
                className="w-full min-h-20 rounded-lg border border-border bg-background p-2 text-sm"
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          {showUserMessage && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Message shown to the user (optional)
              </label>
              <Input
                value={userMessage}
                maxLength={500}
                placeholder="Kept separate from your internal reason"
                onChange={(e) => setUserMessage(e.target.value)}
              />
            </div>
          )}

          {action === "ban" && confirmBan ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <p className="text-sm font-medium text-destructive">Ban this account?</p>
              <p className="text-xs text-muted-foreground">
                This disables the account from using Operator. It is recorded against you.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  {busy ? "Banning…" : "Yes, ban"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmBan(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => (action === "ban" ? setConfirmBan(true) : void submit())}
              >
                {busy ? "Saving…" : choice.label}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
