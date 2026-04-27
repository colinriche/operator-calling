"use client";

import { useDashboardData } from "@/hooks/useDashboardData";

export function NotificationsPageContent() {
  const { loading, notifications } = useDashboardData();

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-heading font-bold text-3xl text-foreground mb-2">Notifications</h1>
      <p className="text-muted-foreground mb-8">Stay on top of your calls and activity.</p>

      {loading && (
        <div className="bg-card rounded-xl p-4 border border-border/60 text-sm text-muted-foreground">
          Loading notifications...
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <div className="bg-card rounded-xl p-4 border border-border/60 text-sm text-muted-foreground">
          No notifications yet.
        </div>
      )}

      <div className="space-y-2">
        {!loading &&
          notifications.map((notification) => (
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
    </div>
  );
}
