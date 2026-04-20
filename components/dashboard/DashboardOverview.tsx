"use client";

import { useAuth } from "@/hooks/useAuth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Phone, Calendar, Bell, Users, Clock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function DashboardOverview() {
  const { user, profile } = useAuth();
  const { loading, error, stats, upcomingCalls, notifications } = useDashboardData();
  const firstName = profile?.displayName?.split(" ")[0] ?? user?.displayName?.split(" ")[0] ?? "there";
  const recentNotifications = notifications.slice(0, 4);
  const statCards = [
    { icon: Phone, label: "Calls this week", value: stats.callsThisWeek.toString() },
    { icon: Clock, label: "Hours talking", value: stats.hoursTalking.toFixed(1) },
    { icon: Users, label: "Groups", value: stats.groups.toString() },
    { icon: Bell, label: "Pending callbacks", value: stats.pendingCallbacks.toString() },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading font-bold text-3xl text-foreground">
          Hey, {firstName} 👋
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your calls today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-card rounded-2xl p-4 border border-border/60">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className="font-heading font-bold text-2xl text-foreground">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Upcoming calls */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg text-foreground">Upcoming calls</h2>
            <Link href="/dashboard/calls" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-primary gap-1")}>
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {loading && (
              <div className="bg-card rounded-2xl p-4 border border-border/60 text-sm text-muted-foreground">
                Loading upcoming calls...
              </div>
            )}

            {!loading && upcomingCalls.length === 0 && (
              <div className="bg-card rounded-2xl p-4 border border-border/60 text-sm text-muted-foreground">
                No upcoming calls yet. Schedule your first call to get started.
              </div>
            )}

            {!loading &&
              upcomingCalls.map((call) => (
                <div key={call.id} className="bg-card rounded-2xl p-4 border border-border/60 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-sm shrink-0">
                    {call.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{call.name}</p>
                    <p className="text-xs text-muted-foreground">{call.dateLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{call.type}</Badge>
                    <Badge
                      className={`text-xs ${
                        call.status === "upcoming" || call.status === "completed"
                          ? "bg-green-100 text-green-800 hover:bg-green-100"
                          : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                      }`}
                    >
                      {call.status}
                    </Badge>
                  </div>
                </div>
              ))}
          </div>

          <div className="mt-4 p-4 bg-primary/5 rounded-2xl border border-primary/15 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Schedule a new call</p>
              <p className="text-xs text-muted-foreground mt-0.5">Find a time that works for both of you</p>
            </div>
            <Link href="/dashboard/schedule" className={cn(buttonVariants({ size: "sm" }), "gradient-gold border-0 text-primary-foreground font-semibold")}>
              Schedule
            </Link>
          </div>
        </div>

        {/* Notifications */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg text-foreground">Notifications</h2>
            <Link href="/dashboard/notifications" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-primary gap-1")}>
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {loading && (
              <div className="bg-card rounded-xl p-4 border border-border/60 text-sm text-muted-foreground">
                Loading notifications...
              </div>
            )}

            {!loading && recentNotifications.length === 0 && (
              <div className="bg-card rounded-xl p-4 border border-border/60 text-sm text-muted-foreground">
                No notifications yet.
              </div>
            )}

            {!loading &&
              recentNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`bg-card rounded-xl p-4 border transition-colors ${
                    n.read ? "border-border/40" : "border-primary/20 bg-primary/3"
                  }`}
                >
                  {!n.read && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mb-2" />
                  )}
                  <p className="text-sm text-foreground leading-snug">{n.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.timeLabel}</p>
                </div>
              ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive mt-4">
          Could not load some dashboard data: {error}
        </p>
      )}
    </div>
  );
}
