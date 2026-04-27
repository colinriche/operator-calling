"use client";

import { useDashboardData } from "@/hooks/useDashboardData";

const statusColor: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800",
  pending: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  missed: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-700",
};

export function CallsPageContent() {
  const { loading, allCalls } = useDashboardData();

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-heading font-bold text-3xl text-foreground mb-2">Calls</h1>
      <p className="text-muted-foreground mb-8">Upcoming, completed, and missed calls.</p>

      {loading && (
        <div className="bg-card rounded-2xl p-4 border border-border/60 text-sm text-muted-foreground">
          Loading call history...
        </div>
      )}

      {!loading && allCalls.length === 0 && (
        <div className="bg-card rounded-2xl p-4 border border-border/60 text-sm text-muted-foreground">
          No calls yet. Calls will appear here once they are scheduled or completed.
        </div>
      )}

      <div className="space-y-3">
        {!loading &&
          allCalls.map((call) => (
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
