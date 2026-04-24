"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDashboardData } from "@/hooks/useDashboardData";

export function NotificationsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { loading, error, notifications } = useDashboardData();

  const filter = useMemo(() => {
    const value = searchParams.get("filter") ?? "all";
    return value === "unread" ? "unread" : "all";
  }, [searchParams]);
  const queryText = (searchParams.get("q") ?? "").slice(0, 80);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      const matchesFilter = filter === "all" || !notification.read;
      const matchesQuery =
        queryText.length === 0 ||
        notification.text.toLowerCase().includes(queryText.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [filter, notifications, queryText]);

  function updateParams(next: { filter?: string; q?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilter = next.filter ?? filter;
    const nextQ = next.q ?? queryText;

    if (nextFilter === "all") params.delete("filter");
    else params.set("filter", "unread");

    const trimmedQ = nextQ.trim();
    if (!trimmedQ) params.delete("q");
    else params.set("q", trimmedQ);

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-heading font-bold text-3xl text-foreground mb-2">Notifications</h1>
      <p className="text-muted-foreground mb-8">Stay on top of your calls and activity.</p>

      <div className="mb-5 flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 sm:flex-row sm:items-center">
        <input
          value={queryText}
          onChange={(e) => updateParams({ q: e.target.value })}
          placeholder="Search notifications"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <select
          value={filter}
          onChange={(e) => updateParams({ filter: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="all">All notifications</option>
          <option value="unread">Unread only</option>
        </select>
      </div>

      {loading && (
        <div className="bg-card rounded-xl p-4 border border-border/60 text-sm text-muted-foreground">
          Loading notifications...
        </div>
      )}

      {!loading && filteredNotifications.length === 0 && (
        <div className="bg-card rounded-xl p-4 border border-border/60 text-sm text-muted-foreground">
          No notifications match this view.
        </div>
      )}

      <div className="space-y-2">
        {!loading &&
          filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-card rounded-xl p-4 border flex items-start gap-3 transition-colors ${
                notification.read ? "border-border/40" : "border-primary/20 bg-primary/3"
              }`}
            >
              <span className="text-xl shrink-0">{notification.icon}</span>
              <div className="flex-1">
                <p className="text-sm text-foreground">{notification.text}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{notification.timeLabel}</p>
              </div>
              {!notification.read && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              )}
            </div>
          ))}
      </div>

      {error && (
        <p className="text-xs text-destructive mt-4">
          Could not load notifications: {error}
        </p>
      )}
    </div>
  );
}
