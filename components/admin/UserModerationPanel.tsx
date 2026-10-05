"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import type { ActionInput } from "@/lib/moderation-model";
import type { UserModeration } from "@/lib/moderation-server";
import { ModerationActionForm, USER_ACTIONS } from "./ModerationActionForm";
import {
  ACCOUNT_LABEL,
  ACCOUNT_TONE,
  ACTION_LABEL,
  OUTCOME_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  dateTime,
  shortDate,
} from "./moderationFormat";

/**
 * The Moderation block for one Firebase UID, so an admin who meets a user
 * anywhere in Admin sees their history at once: reports received and made,
 * warnings, and whether the account is Active, Suspended or Banned. Works for
 * accounts that have never signed into the website.
 */
export function UserModerationPanel({ uid }: { uid: string }) {
  const adminFetch = useAdminFetch();
  const [data, setData] = useState<UserModeration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminFetch<UserModeration>(`/api/admin/users/${uid}/moderation`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [adminFetch, uid]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(input: ActionInput): Promise<boolean> {
    setBusy(true);
    try {
      const res = await adminFetch<{ moderation: UserModeration }>(`/api/admin/users/${uid}/moderation`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setData(res.moderation);
      toast.success("Done. Recorded in the audit trail.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/admin/super" className="text-sm text-primary hover:underline">← Super admin</Link>
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { identity, standing, received, made, summary, audit } = data;
  const available = USER_ACTIONS.filter((c) => {
    if (c.action === "unban") return standing.status === "banned";
    if (c.action === "unsuspend") return standing.status === "suspended";
    if (c.action === "suspend" || c.action === "warn") return standing.status !== "banned";
    if (c.action === "ban") return standing.status !== "banned";
    if (c.action === "disable_auto_calls") return !standing.autoCallsDisabled;
    if (c.action === "enable_auto_calls") return standing.autoCallsDisabled;
    return true;
  });

  const rows: [string, string][] = [
    ["Name", identity.name || "—"],
    ["Username", identity.username ? `@${identity.username}` : "—"],
    ["System name", identity.systemName || "—"],
    ["Firebase UID", identity.uid],
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/admin/super" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="w-4 h-4" /> Super admin
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading font-bold text-2xl text-foreground">{identity.name || identity.username || "User"}</h1>
        <Badge variant="outline" className={ACCOUNT_TONE[standing.status]}>
          Account status: {ACCOUNT_LABEL[standing.status]}
        </Badge>
        {identity.deleted && <Badge variant="outline">Account deleted</Badge>}
      </div>

      <div className="bg-card rounded-2xl border border-border/60 p-5">
        <dl className="space-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Moderation */}
      <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Moderation</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><dt className="text-muted-foreground">Reports received</dt><dd className="text-xl font-heading font-bold">{received.length}</dd></div>
          <div><dt className="text-muted-foreground">Reports made</dt><dd className="text-xl font-heading font-bold">{made.length}</dd></div>
          <div><dt className="text-muted-foreground">Warnings</dt><dd className="text-xl font-heading font-bold">{standing.warnings}</dd></div>
          <div><dt className="text-muted-foreground">Auto calls</dt><dd className="text-xl font-heading font-bold">{standing.autoCallsDisabled ? "Off" : "On"}</dd></div>
        </dl>

        {standing.status === "suspended" && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm space-y-1">
            <p className="font-medium text-amber-800">
              Suspended{standing.suspendedUntil ? ` until ${dateTime(standing.suspendedUntil)}` : " until an admin lifts it"}
            </p>
            {standing.userMessage && <p>Shown to the user: {standing.userMessage}</p>}
            {standing.internalNote && <p className="text-muted-foreground">Internal: {standing.internalNote}</p>}
            {standing.suspendedBy && (
              <p className="text-xs text-muted-foreground">By {standing.suspendedBy}, {dateTime(standing.suspendedAt)}</p>
            )}
          </div>
        )}

        {summary.total > 0 && (
          <p className="text-sm text-muted-foreground">
            {summary.byReason.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(" · ")} · from{" "}
            {summary.distinctReporters} different user{summary.distinctReporters === 1 ? "" : "s"}
          </p>
        )}

        <ModerationActionForm choices={available} busy={busy} onSubmit={act} />
      </div>

      {/* Reports */}
      {[
        { title: "Reports received", list: received, who: "by" as const },
        { title: "Reports made", list: made, who: "against" as const },
      ].map(({ title, list, who }) => (
        <div key={title} className="bg-card rounded-2xl border border-border/60 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{title} ({list.length})</h2>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <div className="divide-y divide-border/60 rounded-lg border border-border/60">
              {list.map((r) => {
                const other = who === "by" ? r.reporter : r.reported;
                return (
                  <Link
                    key={r.id}
                    href={`/admin/super/reports/${r.id}`}
                    className="flex items-center gap-3 p-2.5 text-sm hover:bg-muted/40"
                  >
                    <span className="w-16 shrink-0 text-muted-foreground">{shortDate(r.createdAt)}</span>
                    <span className="flex-1 min-w-0 truncate">
                      {r.reasonLabel} · {who} {other.name || other.username || other.uid}
                    </span>
                    <Badge variant="outline" className={`text-xs ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</Badge>
                    {r.outcome && <span className="text-xs text-muted-foreground">{OUTCOME_LABEL[r.outcome]}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Audit */}
      <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Audit trail</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moderation actions on this account.</p>
        ) : (
          <ul className="space-y-2">
            {audit.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="text-muted-foreground"> by {a.adminName || a.adminEmail} · {dateTime(a.at)}</span>
                {a.expiresAt && <span className="text-muted-foreground"> · until {dateTime(a.expiresAt)}</span>}
                {a.reason && <p className="text-xs text-muted-foreground">Why: {a.reason}</p>}
                {a.reportId && (
                  <Link href={`/admin/super/reports/${a.reportId}`} className="text-xs text-primary hover:underline">
                    From report
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
