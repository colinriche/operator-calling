"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import {
  CALL_TYPE_LABELS,
  type Party,
  type QueueCounts,
  type ReportCallType,
  type ReportOutcome,
  type ReportStatus,
  type StatusFilter,
} from "@/lib/moderation-model";
import { OUTCOME_LABEL, STATUS_LABEL, STATUS_TONE, shortDate } from "./moderationFormat";

interface Row {
  id: string;
  createdAt: string | null;
  reported: Party;
  reporter: Party;
  reasonLabel: string;
  callType: ReportCallType;
  previousReports: number;
  status: ReportStatus;
  outcome: ReportOutcome | null;
  legacy: boolean;
}

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "new", label: "New" },
  { id: "reviewing", label: "Reviewing" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

function who(p: Party) {
  const name = p.name || p.username || p.uid || "Unknown";
  return (
    <>
      <span className="font-medium text-foreground">{name}</span>
      {p.username && <span className="text-muted-foreground"> / @{p.username}</span>}
    </>
  );
}

/**
 * The moderation queue: a table of reports, filtered New / Reviewing / Resolved
 * / All. Opening a report (the row link) never changes its status; an admin
 * moves it to Reviewing deliberately with Start review.
 */
export function ReportsQueue({ onCounts }: { onCounts?: (counts: QueueCounts) => void }) {
  const adminFetch = useAdminFetch();
  const [filter, setFilter] = useState<StatusFilter>("new");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<{ reports: Row[]; counts: QueueCounts }>(
        `/api/admin/reports?status=${filter}`
      );
      setRows(data.reports);
      setCounts(data.counts);
      onCounts?.(data.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, filter, onCounts]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report status">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`text-sm rounded-lg border px-3 py-1.5 transition-colors ${
              filter === f.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            {counts && <span className="ml-1.5 text-xs opacity-70">{counts[f.id]}</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Reported user</th>
              <th className="p-3 font-medium">Reported by</th>
              <th className="p-3 font-medium">Reason</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium text-center">Previous reports</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="p-3 whitespace-nowrap">
                  <Link href={`/admin/super/reports/${r.id}`} className="hover:underline">
                    {shortDate(r.createdAt)}
                  </Link>
                </td>
                <td className="p-3">
                  <Link href={`/admin/super/reports/${r.id}`} className="hover:underline">
                    {who(r.reported)}
                  </Link>
                </td>
                <td className="p-3">{who(r.reporter)}</td>
                <td className="p-3">{r.reasonLabel}</td>
                <td className="p-3 whitespace-nowrap">{CALL_TYPE_LABELS[r.callType]}</td>
                <td className="p-3 text-center">
                  <span className={r.previousReports > 0 ? "font-semibold text-amber-700" : "text-muted-foreground"}>
                    {r.previousReports}
                  </span>
                </td>
                <td className="p-3 whitespace-nowrap">
                  <Badge variant="outline" className={STATUS_TONE[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  {r.outcome && (
                    <span className="ml-2 text-xs text-muted-foreground">{OUTCOME_LABEL[r.outcome]}</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No {filter === "all" ? "" : STATUS_LABEL[filter as ReportStatus].toLowerCase() + " "}reports.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-sm text-muted-foreground">Loading reports…</div>}
      </div>
    </div>
  );
}
