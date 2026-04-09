"use client";

import { useState } from "react";
import { Users, BarChart3, Shield, Settings, Search, AlertTriangle, CheckCircle2, Phone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const platformStats = [
  { icon: Users, label: "Total users", value: "12,847" },
  { icon: Globe, label: "Active groups", value: "341" },
  { icon: Phone, label: "Calls today", value: "2,104" },
  { icon: CheckCircle2, label: "Avg connection rate", value: "81%" },
];

const recentUsers = [
  { name: "Alex B.", email: "alex@example.com", role: "user", status: "active", joined: "Today" },
  { name: "Chloe M.", email: "chloe@example.com", role: "group_admin", status: "active", joined: "Yesterday" },
  { name: "James R.", email: "james@example.com", role: "user", status: "suspended", joined: "3 days ago" },
  { name: "Nina P.", email: "nina@example.com", role: "user", status: "active", joined: "1 week ago" },
];

const openReports = [
  { reporter: "Marcus T.", reported: "Unknown user #4421", reason: "Inappropriate behaviour", time: "1h ago" },
  { reporter: "Priya N.", reported: "James R.", reason: "Harassment", time: "3h ago" },
];

const systemHealth = [
  { label: "API response time", value: "92ms", ok: true },
  { label: "Firebase read latency", value: "45ms", ok: true },
  { label: "Failed call connections (24h)", value: "3.2%", ok: true },
  { label: "Error rate", value: "0.04%", ok: true },
];

export function SuperAdminDashboard() {
  const [userSearch, setUserSearch] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [newUserSignups, setNewUserSignups] = useState(true);
  const [strangercalls, setStrangerCalls] = useState(true);

  const filteredUsers = recentUsers.filter(
    (u) =>
      !userSearch ||
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Super Admin</h1>
          <p className="text-muted-foreground">Platform-wide management and oversight.</p>
        </div>
        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          2 open reports
        </Badge>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {platformStats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-2xl p-4 border border-border/60">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className="font-heading font-bold text-2xl text-foreground">{stat.value}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid grid-cols-4 w-full mb-6">
          <TabsTrigger value="users" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" />Users</TabsTrigger>
          <TabsTrigger value="moderation" className="gap-1.5 text-xs"><Shield className="w-3.5 h-3.5" />Moderation</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 text-xs"><BarChart3 className="w-3.5 h-3.5" />Analytics</TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5 text-xs"><Settings className="w-3.5 h-3.5" />System</TabsTrigger>
        </TabsList>

        {/* Users */}
        <TabsContent value="users" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search users by name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>

          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="divide-y divide-border/60">
              {filteredUsers.map((u) => (
                <div key={u.email} className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-xs shrink-0">
                    {u.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email} · Joined {u.joined}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-xs capitalize ${
                        u.status === "suspended" ? "border-destructive/40 text-destructive bg-destructive/5" : ""
                      }`}
                    >
                      {u.status}
                    </Badge>
                    <select
                      defaultValue={u.role}
                      className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      onChange={() => toast.success(`Role updated for ${u.name}`)}
                    >
                      <option value="user">User</option>
                      <option value="group_admin">Group admin</option>
                      <option value="super_admin">Super admin</option>
                    </select>
                    {u.status !== "suspended" ? (
                      <button
                        className="text-xs text-destructive hover:underline"
                        onClick={() => toast.error(`${u.name} suspended`)}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        className="text-xs text-green-600 hover:underline"
                        onClick={() => toast.success(`${u.name} reinstated`)}
                      >
                        Reinstate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Moderation */}
        <TabsContent value="moderation" className="space-y-4">
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <h2 className="font-semibold text-sm text-foreground">Open reports ({openReports.length})</h2>
            </div>
            <div className="divide-y divide-border/60">
              {openReports.map((report, i) => (
                <div key={i} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-0.5">
                        {report.reporter} reported {report.reported}
                      </p>
                      <p className="text-xs text-muted-foreground">Reason: {report.reason} · {report.time}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => toast.success("Report dismissed")}>
                        Dismiss
                      </Button>
                      <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => toast.error("User suspended")}>
                        Suspend user
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="bg-card rounded-2xl p-6 border border-border/60">
            <h2 className="font-semibold text-foreground mb-6">Platform overview (last 30 days)</h2>
            <div className="grid grid-cols-2 gap-y-6 gap-x-8">
              {[
                { label: "New users", value: "1,204", change: "+18%" },
                { label: "New groups created", value: "42", change: "+6%" },
                { label: "Total calls completed", value: "48,291", change: "+22%" },
                { label: "Avg calls per user", value: "3.8", change: "+0.4" },
                { label: "Stranger call opt-in rate", value: "34%", change: "+2%" },
                { label: "Reported incidents", value: "7", change: "-3" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-heading font-bold text-xl text-foreground">{item.value}</span>
                    <span className={`text-xs font-medium ${item.change.startsWith("+") ? "text-green-600" : "text-destructive"}`}>
                      {item.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* System */}
        <TabsContent value="system" className="space-y-4">
          {/* Health */}
          <div className="bg-card rounded-2xl p-6 border border-border/60">
            <h2 className="font-semibold text-foreground mb-4">System health</h2>
            <div className="space-y-3">
              {systemHealth.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.value}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform controls */}
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            <h2 className="font-semibold text-foreground">Platform controls</h2>
            {[
              { label: "Allow new user signups", desc: "Disable to temporarily freeze registrations.", checked: newUserSignups, onChange: setNewUserSignups },
              { label: "Enable stranger-matched calls", desc: "Global toggle for the opt-in matched calling feature.", checked: strangercalls, onChange: setStrangerCalls },
              { label: "Maintenance mode", desc: "Shows a maintenance page to all non-admin users.", checked: maintenanceMode, onChange: setMaintenanceMode, danger: true },
            ].map((item) => (
              <div key={item.label} className={`flex items-start justify-between gap-4 ${item.danger ? "pt-4 border-t border-destructive/20" : ""}`}>
                <div>
                  <p className={`text-sm font-medium ${item.danger ? "text-destructive" : "text-foreground"}`}>{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch
                  checked={item.checked}
                  onCheckedChange={(v) => {
                    item.onChange(v);
                    toast[item.danger && v ? "error" : "success"](`${item.label} ${v ? "enabled" : "disabled"}`);
                  }}
                />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
