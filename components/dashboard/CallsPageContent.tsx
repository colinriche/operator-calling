"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDashboardData } from "@/hooks/useDashboardData";

const statusColor: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800",
  pending: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  missed: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-700",
};

export function CallsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { loading, allCalls } = useDashboardData();

  const statusFilter = useMemo(() => {
    const value = searchParams.get("status") ?? "all";
    return ["all", "upcoming", "pending", "completed", "missed", "cancelled"].includes(value)
      ? value
      : "all";
  }, [searchParams]);
  const typeFilter = useMemo(() => {
    const value = searchParams.get("type") ?? "all";
    return ["all", "scheduled", "callback", "group"].includes(value) ? value : "all";
  }, [searchParams]);
  const queryText = (searchParams.get("q") ?? "").slice(0, 80);

  const filteredCalls = useMemo(() => {
    return allCalls.filter((call) => {
      const matchesStatus = statusFilter === "all" || call.status === statusFilter;
      const normalizedType =
        call.type === "Scheduled" ? "scheduled" : call.type === "Callback request" ? "callback" : "group";
      const matchesType = typeFilter === "all" || normalizedType === typeFilter;
      const matchesQuery =
        queryText.length === 0 ||
        call.name.toLowerCase().includes(queryText.toLowerCase()) ||
        call.dateLabel.toLowerCase().includes(queryText.toLowerCase());
      return matchesStatus && matchesType && matchesQuery;
    });
  }, [allCalls, queryText, statusFilter, typeFilter]);

  function updateParams(next: { status?: string; type?: string; q?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextStatus = next.status ?? statusFilter;
    const nextType = next.type ?? typeFilter;
    const nextQ = next.q ?? queryText;

    if (nextStatus === "all") params.delete("status");
    else params.set("status", nextStatus);

    if (nextType === "all") params.delete("type");
    else params.set("type", nextType);

    const trimmedQ = nextQ.trim();
    if (!trimmedQ) params.delete("q");
    else params.set("q", trimmedQ);

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-heading font-bold text-3xl text-foreground mb-2">Calls</h1>
      <p className="text-muted-foreground mb-8">Upcoming, completed, and missed calls.</p>

      <div className="mb-5 flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-3 sm:flex-row sm:items-center">
        <input
          value={queryText}
          onChange={(e) => updateParams({ q: e.target.value })}
          placeholder="Search calls"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="all">All statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => updateParams({ type: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="all">All types</option>
          <option value="scheduled">Scheduled</option>
          <option value="callback">Callback</option>
          <option value="group">Group</option>
        </select>
      </div>

      {loading && (
        <div className="bg-card rounded-2xl p-4 border border-border/60 text-sm text-muted-foreground">
          Loading call history...
        </div>
      )}

      {!loading && filteredCalls.length === 0 && (
        <div className="bg-card rounded-2xl p-4 border border-border/60 text-sm text-muted-foreground">
          No calls match this view yet.
        </div>
      )}

      <div className="space-y-3">
        {!loading &&
          filteredCalls.map((call) => (
            <div key={call.id} className="bg-card rounded-2xl p-4 border border-border/60 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-sm shrink-0">
                {call.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">{call.name}</p>
                <p className="text-xs text-muted-foreground">
                  {call.dateLabel}
                  {call.durationLabel ? ` · ${call.durationLabel}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                  {call.type}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[call.status]}`}>
                  {call.status}
                </span>
              </div>
            </div>
          ))}
      </div>

    </div>
  );
}
