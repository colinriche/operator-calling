"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import {
  CALL_TYPE_LABELS,
  type ActionInput,
  type Party,
} from "@/lib/moderation-model";
import type { ReportDetail as Detail, Identity } from "@/lib/moderation-server";
import { ModerationActionForm, REPORT_ACTIONS } from "./ModerationActionForm";
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

/** The four identifiers, in the order Colin asked for: name, username, system name, UID. */
function Identifiers({ title, identity, party }: { title: string; identity: Identity; party: Party }) {
  const rows: [string, string][] = [
    ["Name", identity.name || party.name || "—"],
    ["Username", identity.username || party.username ? `@${identity.username || party.username}` : "—"],
    ["System name", identity.systemName || party.systemName || "—"],
    ["Firebase UID", identity.uid || "—"],
  ];
  return (
    <div className="bg-card rounded-2xl border border-border/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {identity.deleted && (
          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
            Account deleted
          </Badge>
        )}
      </div>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
            <dd className="text-foreground break-all">{v}</dd>
          </div>
        ))}
      </dl>
      {identity.uid && (
        <Link
          href={`/admin/super/users/${identity.uid}`}
          className="mt-3 inline-block text-xs text-primary hover:underline"
        >
          Open moderation profile
        </Link>
      )}
    </div>
  );
}

export function ReportDetail({ id }: { id: string }) {
  const adminFetch = useAdminFetch();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await adminFetch<Detail>(`/api/admin/reports/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    }
  }, [adminFetch, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(input: ActionInput): Promise<boolean> {
    setBusy(true);
    try {
      await adminFetch(`/api/admin/reports/${id}`, { method: "POST", body: JSON.stringify(input) });
      toast.success("Done. Recorded in the audit trail.");
      await load();
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
        <Link href="/admin/super/reports" className="text-sm text-primary hover:underline">
          ← Reports
        </Link>
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }
  if (!detail) return <p className="text-sm text-muted-foreground">Loading report…</p>;

  const { report, history, summary, reported, reporter, pairBlock } = detail;
  const resolved = report.status === "resolved";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/admin/super/reports" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="w-4 h-4" /> Reports
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading font-bold text-2xl text-foreground">Report</h1>
        <Badge variant="outline" className={STATUS_TONE[report.status]}>
          {STATUS_LABEL[report.status]}
        </Badge>
        {report.outcome && <Badge variant="outline">{OUTCOME_LABEL[report.outcome]}</Badge>}
        {report.legacy && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Old in-call flag
          </Badge>
        )}
      </div>

      {/* Reported person, then reporter */}
      <div className="grid md:grid-cols-2 gap-4">
        <Identifiers title="Reported person" identity={reported.identity} party={report.reported} />
        <Identifiers title="Reported by" identity={reporter.identity} party={report.reporter} />
      </div>

      {/* The report */}
      <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Report</h2>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-muted-foreground">Reason</dt><dd>{report.reasonLabel}</dd></div>
          <div><dt className="text-muted-foreground">Date / time</dt><dd>{dateTime(report.createdAt)}</dd></div>
          <div><dt className="text-muted-foreground">Call type</dt><dd>{CALL_TYPE_LABELS[report.callType]}</dd></div>
          <div><dt className="text-muted-foreground">Call ID</dt><dd className="break-all">{report.callId ?? "—"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Report ID</dt><dd className="break-all">{report.id}</dd></div>
        </dl>
        <div>
          <p className="text-sm text-muted-foreground mb-1">Their explanation</p>
          <p className="text-sm whitespace-pre-wrap rounded-lg bg-muted/40 p-3">
            {report.details || <span className="text-muted-foreground">Nothing written.</span>}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {pairBlock.blocked ? (
            <>
              <ShieldAlert className="inline w-3.5 h-3.5 mr-1 text-green-600" />
              These two accounts are already blocked from each other
              {pairBlock.by.length === 2 ? " (both ways)" : ""}: no calls, callbacks, invites or random matching.
            </>
          ) : (
            "These two accounts are not blocked from each other."
          )}
        </p>
      </div>

      {/* History */}
      <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        <p className="text-sm text-foreground">
          {summary.total} report{summary.total === 1 ? "" : "s"} against this account
          {summary.total > 0 && (
            <>
              {" "}· from {summary.distinctReporters} different user{summary.distinctReporters === 1 ? "" : "s"}
            </>
          )}
        </p>
        <ul className="text-sm space-y-0.5">
          {summary.byReason.map((b) => (
            <li key={b.reason} className="text-muted-foreground">
              <span className="text-foreground font-medium">{b.count}</span> {b.label.toLowerCase()}
            </li>
          ))}
        </ul>
        <div className="divide-y divide-border/60 rounded-lg border border-border/60">
          {history.map((h) => (
            <Link
              key={h.id}
              href={`/admin/super/reports/${h.id}`}
              className={`flex items-center gap-3 p-2.5 text-sm hover:bg-muted/40 ${h.id === report.id ? "bg-primary/5" : ""}`}
            >
              <span className="w-16 shrink-0 text-muted-foreground">{shortDate(h.createdAt)}</span>
              <span className="flex-1 min-w-0 truncate">
                {h.reasonLabel} · by {h.reporter.name || h.reporter.username || h.reporter.uid}
              </span>
              <Badge variant="outline" className={`text-xs ${STATUS_TONE[h.status]}`}>
                {STATUS_LABEL[h.status]}
              </Badge>
              {h.id === report.id && <span className="text-xs text-muted-foreground">this report</span>}
            </Link>
          ))}
        </div>
      </div>

      {/* Current standing of the reported account */}
      <div className="bg-card rounded-2xl border border-border/60 p-5">
        <h2 className="text-sm font-semibold text-foreground mb-2">Reported account today</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="outline" className={ACCOUNT_TONE[reported.standing.status]}>
            {ACCOUNT_LABEL[reported.standing.status]}
          </Badge>
          <span className="text-muted-foreground">
            {reported.standing.warnings} warning{reported.standing.warnings === 1 ? "" : "s"}
          </span>
          {reported.standing.autoCallsDisabled && <Badge variant="outline">Auto calls disabled</Badge>}
          {reported.standing.suspendedUntil && (
            <span className="text-muted-foreground">until {dateTime(reported.standing.suspendedUntil)}</span>
          )}
        </div>
      </div>

      {/* Pipeline + actions */}
      <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Review</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {(["new", "reviewing", "resolved"] as const).map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span>→</span>}
              <span className={report.status === s ? "font-semibold text-foreground" : ""}>{STATUS_LABEL[s]}</span>
            </span>
          ))}
        </div>

        {report.status === "new" && (
          <Button size="sm" disabled={busy} onClick={() => void act({ action: "start_review" })}>
            Start review
          </Button>
        )}

        {resolved ? (
          <>
            <p className="text-sm text-muted-foreground">
              Resolved{report.outcome ? `: ${OUTCOME_LABEL[report.outcome].toLowerCase()}` : ""}
              {report.resolvedAt ? ` on ${dateTime(report.resolvedAt)}` : ""}
              {report.resolvedBy ? ` by ${report.resolvedBy}` : ""}. Notes can still be added; to act on the
              account again, use their profile.
            </p>
            <ModerationActionForm
              choices={REPORT_ACTIONS.filter((c) => c.action === "note")}
              busy={busy}
              onSubmit={act}
            />
          </>
        ) : (
          <ModerationActionForm choices={REPORT_ACTIONS} busy={busy} onSubmit={act} />
        )}
      </div>

      {/* Notes + audit trail */}
      <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Admin notes</h2>
        {report.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {report.notes.map((n, i) => (
              <li key={i} className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="whitespace-pre-wrap">{n.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.adminName || n.adminEmail} · {dateTime(n.at)}
                </p>
              </li>
            ))}
          </ul>
        )}

        <h2 className="text-sm font-semibold text-foreground pt-2">Audit trail</h2>
        {report.actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has been done on this report yet.</p>
        ) : (
          <ul className="space-y-2">
            {report.actions.map((a, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-foreground">{ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="text-muted-foreground">
                  {" "}by {a.adminName || a.adminEmail} · {dateTime(a.at)}
                </span>
                {a.reason && <p className="text-xs text-muted-foreground">Why: {a.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
