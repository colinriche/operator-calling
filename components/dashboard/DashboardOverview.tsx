"use client";

import { useAuth } from "@/hooks/useAuth";
import { Phone, Calendar, Bell, Users, Clock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

// Mock data for demo UI
const upcomingCalls = [
  { id: "1", name: "Sarah K.", time: "Today, 3:00 PM", type: "Scheduled", status: "confirmed" },
  { id: "2", name: "Marcus T.", time: "Tomorrow, 10:00 AM", type: "Callback request", status: "pending" },
  { id: "3", name: "Running Club call", time: "Fri, 7:30 AM", type: "Group", status: "confirmed" },
];

const recentNotifications = [
  { id: "1", text: "Priya N. accepted your callback request", time: "2h ago", read: false },
  { id: "2", text: "You have a scheduled call with Sarah K. in 1 hour", time: "3h ago", read: false },
  { id: "3", text: "New member joined Running Club", time: "Yesterday", read: true },
];

const stats = [
  { icon: Phone, label: "Calls this week", value: "12" },
  { icon: Clock, label: "Hours talking", value: "4.2" },
  { icon: Users, label: "Groups", value: "3" },
  { icon: Bell, label: "Pending callbacks", value: "2" },
];

export function DashboardOverview() {
  const { user, profile } = useAuth();
  const firstName = profile?.displayName?.split(" ")[0] ?? user?.displayName?.split(" ")[0] ?? "there";

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
        {stats.map((stat) => (
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
            {upcomingCalls.map((call) => (
              <div key={call.id} className="bg-card rounded-2xl p-4 border border-border/60 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-sm shrink-0">
                  {call.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{call.name}</p>
                  <p className="text-xs text-muted-foreground">{call.time}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{call.type}</Badge>
                  <Badge
                    className={`text-xs ${call.status === "confirmed" ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}`}
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
            {recentNotifications.map((n) => (
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
                <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
