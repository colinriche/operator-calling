"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import type { AdminDeletionRequestView } from "@/lib/account-deletion";
import { dateTime, shortDate } from "./moderationFormat";

// Account deletion requests, from the app and from the website. Nothing is
// deleted until a super admin reviews a request here and chooses Delete (or
// Decline). The server re-checks every rule; this only shapes the input.

const STATUS_LABEL: Record<AdminDeletionRequestView["status"], string> = {
  pending: "Pending",
  restored: "Withdrawn",
  declined: "Declined",
  completed: "Deleted",
};

const STATUS_TONE: Record<AdminDeletionRequestView["status"], string> = {
  pending: "border-amber-400 text-amber-700 bg-amber-50",
  restored: "border-border text-muted-foreground bg-muted/50",
  declined: "border-border text-muted-foreground bg-muted/50",
  completed: "border-destructive/40 text-destructive bg-destructive/5",
};

type Mode = "delete" | "decline" | null;

function RequestCard({
  r,
  onReviewed,
}: {
  r: AdminDeletionRequestView;
  onReviewed: () => Promise<void>;
}) {
  const adminFetch = useAdminFetch();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [confirmEarly, setConfirmEarly] = useState(false);
  const [busy, setBusy] = useState(false);

  const windowOpen = !!r.restoreUntil && new Date(r.restoreUntil) > new Date();
  const pending = r.status === "pending";

  function close() {
    setMode(null);
    setReason("");
    setUserMessage("");
    setConfirm(false);
    setConfirmEarly(false);
  }

  async function submit() {
    if (!mode) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/deletion-requests/${r.id}`, {
        method: "POST",
        body: JSON.stringify({ action: mode, reason, userMessage, confirm, confirmEarly }),
      });
      toast.success(mode === "delete" ? "Account deleted and archived." : "Request declined.");
      close();
      await onReviewed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const identity: [string, string][] = [
    ["Name", r.displayName || "—"],
    ["Username", r.username ? `@${r.username}` : "—"],
    ["Phone", r.phoneNumber || "—"],
    ["Email", r.email || "—"],
    ["System name", r.systemName || "—"],
    ["User ID", r.userId],
  ];

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">
            {r.displayName || r.username || r.email || r.userId}
          </p>
          <p className="text-xs text-muted-foreground">
            Requested {shortDate(r.requestedAt)} from the {r.source === "app" ? "app" : "website"}
            {" · "}
            {r.requestType === "permanent_deletion" ? "permanent deletion" : "account deletion"}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${STATUS_TONE[r.status]}`}>
          {STATUS_LABEL[r.status]}
        </Badge>
      </div>

      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        {identity.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
            <dd className="break-all text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-muted-foreground">Reason given: {r.reason || "Not recorded"}</p>

      {pending && (
        <p className={`text-xs ${windowOpen ? "text-amber-700" : "text-muted-foreground"}`}>
          {windowOpen
            ? `The person can still withdraw this until ${dateTime(r.restoreUntil)}.`
            : `Their 30 day window ended ${shortDate(r.restoreUntil)}. Ready to review.`}
        </p>
      )}

      {!pending && (
        <p className="text-xs text-muted-foreground">
          {r.status === "completed" && `Deleted ${dateTime(r.completedAt)} by ${r.reviewedBy ?? "an admin"}.`}
          {r.status === "declined" && `Declined ${dateTime(r.reviewedAt)} by ${r.reviewedBy ?? "an admin"}.`}
          {r.status === "restored" && `Withdrawn by the person ${dateTime(r.restoredAt)}.`}
          {r.adminNote && ` Note: ${r.adminNote}`}
          {r.userMessage && ` Shown to the person: ${r.userMessage}`}
        </p>
      )}

      {pending && !mode && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/5"
            onClick={() => setMode("delete")}
          >
            Delete account…
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("decline")}>
            Decline request…
          </Button>
        </div>
      )}

      {pending && mode && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
          {mode === "delete" ? (
            <>
              <p className="text-sm font-medium text-destructive">Delete this account?</p>
              <p className="text-xs text-muted-foreground">
                The account is archived (recoverable from the Archive tab for 30 days) and then removed. Reports
                and safety records about it are kept.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Note (internal, optional)</label>
                <textarea
                  className="w-full min-h-16 rounded-lg border border-border bg-background p-2 text-sm"
                  value={reason}
                  maxLength={2000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              {windowOpen && (
                <label className="flex items-start gap-2 text-xs text-amber-700">
                  <input type="checkbox" checked={confirmEarly} onChange={(e) => setConfirmEarly(e.target.checked)} />
                  <span>
                    Delete anyway. The person can still withdraw this request until {dateTime(r.restoreUntil)}.
                  </span>
                </label>
              )}
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                <span>I have reviewed this request and want this account deleted.</span>
              </label>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Decline this request</p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Reason (internal, goes in the audit trail)</label>
                <textarea
                  className="w-full min-h-16 rounded-lg border border-border bg-background p-2 text-sm"
                  value={reason}
                  maxLength={2000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Message shown to the person (optional)</label>
                <Input
                  value={userMessage}
                  maxLength={500}
                  placeholder="Kept separate from your internal reason"
                  onChange={(e) => setUserMessage(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || (mode === "delete" && (!confirm || (windowOpen && !confirmEarly))) || (mode === "decline" && !reason.trim())}
              className={mode === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => void submit()}
            >
              {busy ? "Working…" : mode === "delete" ? "Delete account" : "Decline request"}
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DeletionRequestsPanel() {
  const adminFetch = useAdminFetch();
  const [requests, setRequests] = useState<AdminDeletionRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ requests: AdminDeletionRequestView[] }>("/api/admin/deletion-requests");
      // Pending first, then newest.
      const order = { pending: 0, declined: 1, completed: 1, restored: 2 } as const;
      setRequests(
        [...data.requests].sort(
          (a, b) =>
            order[a.status] - order[b.status] || (b.requestedAt ?? "").localeCompare(a.requestedAt ?? "")
        )
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deletion requests");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="p-4 border-b border-border/60 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-sm text-foreground">
            Deletion requests{pending > 0 ? ` (${pending} pending)` : ""}
          </h2>
          <p className="text-xs text-muted-foreground">
            From the app and the website. An account is deleted only when you review a request and choose
            Delete. People can withdraw a request for 30 days.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>
      {error && <div className="p-4 text-sm text-destructive">{error}</div>}
      <div className="divide-y divide-border/60">
        {!loading && requests.length === 0 && !error && (
          <div className="p-5 text-sm text-muted-foreground">No deletion requests.</div>
        )}
        {requests.map((r) => (
          <RequestCard key={r.id} r={r} onReviewed={load} />
        ))}
      </div>
    </div>
  );
}
