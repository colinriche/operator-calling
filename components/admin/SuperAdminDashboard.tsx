"use client";

import { useEffect, useMemo, useState } from "react";
import { Users, BarChart3, Shield, Settings, Search, AlertTriangle, CheckCircle2, Phone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { seedDashboardStarterData } from "@/lib/dashboardSeed";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "suspended";
  joinedAt: Date | null;
}

interface ReportRow {
  id: string;
  reporter: string;
  reported: string;
  reason: string;
  createdAt: Date | null;
  targetUserId: string | null;
}

export function SuperAdminDashboard() {
  const { user, profile } = useAuth();
  const [userSearch, setUserSearch] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [newUserSignups, setNewUserSignups] = useState(true);
  const [strangerCalls, setStrangerCalls] = useState(true);
  const [isSeedingDashboardData, setIsSeedingDashboardData] = useState(false);
  const [isSavingControls, setIsSavingControls] = useState(false);

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [groupsCount, setGroupsCount] = useState(0);
  const [callsToday, setCallsToday] = useState(0);
  const [completedCalls30d, setCompletedCalls30d] = useState(0);
  const [failedCalls30d, setFailedCalls30d] = useState(0);

  const canSeedDashboardData = profile?.role === "admin";

  const filteredUsers = users.filter(
    (u) =>
      !userSearch ||
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const openReports = useMemo(() => reports.slice(0, 10), [reports]);
  const openReportsCount = reports.length;

  const platformStats = useMemo(
    () => [
      { icon: Users, label: "Total users", value: users.length.toLocaleString() },
      { icon: Globe, label: "Active groups", value: groupsCount.toLocaleString() },
      { icon: Phone, label: "Calls today", value: callsToday.toLocaleString() },
      {
        icon: CheckCircle2,
        label: "Connection rate (30d)",
        value: percentage(completedCalls30d, completedCalls30d + failedCalls30d),
      },
    ],
    [callsToday, completedCalls30d, failedCalls30d, groupsCount, users.length]
  );

  const systemHealth = useMemo(
    () => [
      { label: "Open reports", value: openReportsCount.toString(), ok: openReportsCount < 10 },
      { label: "Suspended users", value: users.filter((u) => u.status === "suspended").length.toString(), ok: true },
      { label: "Completed calls (30d)", value: completedCalls30d.toString(), ok: true },
      { label: "Failed calls (30d)", value: failedCalls30d.toString(), ok: failedCalls30d < completedCalls30d + 5 },
    ],
    [completedCalls30d, failedCalls30d, openReportsCount, users]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const [usersSnap, groupsSnap, reportsSnap, schedulesSnap, controlsSnap] = await Promise.all([
          getDocs(collection(db, "user")),
          getDocs(collection(db, "groups")),
          getDocs(collection(db, "reports")),
          getDocs(collection(db, "schedules")),
          getDoc(doc(db, "admin_controls", "platform")),
        ]);

        if (cancelled) return;

        const loadedUsers: UserRow[] = usersSnap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            name: toStringOrFallback(data.displayName, "Unnamed user"),
            email: toStringOrFallback(data.email, `${docSnap.id}@unknown`),
            role: toStringOrFallback(data.role, "user"),
            status: data.banned === true ? "suspended" : "active",
            joinedAt: toDate(data.createdAt),
          };
        });

        const loadedReports: ReportRow[] = reportsSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            const status = toStringOrFallback(data.status, "open");
            if (status === "resolved" || status === "dismissed") return null;
            return {
              id: docSnap.id,
              reporter: toStringOrFallback(data.reporterName, toStringOrFallback(data.reporterId, "Unknown reporter")),
              reported: toStringOrFallback(data.reportedName, toStringOrFallback(data.reportedId, "Unknown user")),
              reason: toStringOrFallback(data.reason, "No reason provided"),
              createdAt: toDate(data.createdAt),
              targetUserId: asOptionalString(data.reportedId),
            } satisfies ReportRow;
          })
          .filter((value): value is ReportRow => value !== null)
          .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        let todayCount = 0;
        let completed30d = 0;
        let failed30d = 0;
        for (const scheduleDoc of schedulesSnap.docs) {
          const data = scheduleDoc.data() as Record<string, unknown>;
          const scheduledAt = toDate(data.scheduledAt);
          if (!scheduledAt) continue;
          if (scheduledAt >= startOfToday) todayCount += 1;
          if (scheduledAt < thirtyDaysAgo) continue;
          const status = toStringOrFallback(data.status, "pending");
          if (status === "completed" || status === "confirmed") completed30d += 1;
          if (status === "missed" || status === "cancelled") failed30d += 1;
        }

        const controls = controlsSnap.exists()
          ? (controlsSnap.data() as Record<string, unknown>)
          : {};

        setUsers(
          loadedUsers.sort(
            (a, b) => (b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0)
          )
        );
        setReports(loadedReports);
        setGroupsCount(groupsSnap.size);
        setCallsToday(todayCount);
        setCompletedCalls30d(completed30d);
        setFailedCalls30d(failed30d);
        setNewUserSignups(Boolean(controls.allowNewUserSignups ?? true));
        setStrangerCalls(Boolean(controls.enableStrangerCalls ?? true));
        setMaintenanceMode(Boolean(controls.maintenanceMode ?? false));
      } catch (error) {
        toast.error(
          `Failed loading admin data: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSeedDashboardData() {
    if (!user) {
      toast.error("Please sign in first.");
      return;
    }

    if (!canSeedDashboardData) {
      toast.error("Admin role required for this action.");
      return;
    }

    try {
      setIsSeedingDashboardData(true);
      const result = await seedDashboardStarterData({
        uid: user.uid,
        email: user.email,
        displayName: profile?.displayName ?? user.displayName,
      });

      const seededCount =
        result.users +
        result.groups +
        result.memberships +
        result.schedules +
        result.callbacks +
        result.notifications;

      if (result.failures.length === 0) {
        toast.success(
          `Seed complete: ${result.schedules} schedules, ${result.callbacks} callbacks, ${result.notifications} notifications.`
        );
        return;
      }

      if (seededCount > 0) {
        toast.warning(
          `Seeded ${seededCount} records, but some writes failed (${result.failures.map((f) => f.collection).join(", ")}).`
        );
      } else {
        const firstFailure = result.failures[0];
        toast.error(
          `Failed to seed: ${firstFailure.collection}${firstFailure.code ? ` (${firstFailure.code})` : ""}.`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error while seeding dashboard data.";
      toast.error(`Failed to seed dashboard data: ${message}`);
    } finally {
      setIsSeedingDashboardData(false);
    }
  }

  async function updateUserRole(userId: string, role: string, name: string) {
    try {
      await updateDoc(doc(db, "user", userId), {
        role,
        updatedAt: serverTimestamp(),
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success(`Role updated for ${name}`);
    } catch (error) {
      toast.error(
        `Failed to update role: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async function setUserSuspended(userId: string, suspended: boolean, name: string) {
    try {
      await updateDoc(doc(db, "user", userId), {
        banned: suspended,
        updatedAt: serverTimestamp(),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: suspended ? "suspended" : "active" } : u))
      );
      toast.success(`${name} ${suspended ? "suspended" : "reinstated"}`);
    } catch (error) {
      toast.error(
        `Failed updating user status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async function dismissReport(reportId: string) {
    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: "dismissed",
        updatedAt: serverTimestamp(),
      });
      setReports((prev) => prev.filter((report) => report.id !== reportId));
      toast.success("Report dismissed");
    } catch (error) {
      toast.error(
        `Failed to dismiss report: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async function suspendFromReport(report: ReportRow) {
    if (!report.targetUserId) {
      toast.error("No target user on this report.");
      return;
    }

    await Promise.all([
      setUserSuspended(report.targetUserId, true, report.reported),
      dismissReport(report.id),
    ]);
  }

  async function savePlatformControls(next: {
    allowNewUserSignups?: boolean;
    enableStrangerCalls?: boolean;
    maintenanceMode?: boolean;
  }) {
    try {
      setIsSavingControls(true);
      await setDoc(
        doc(db, "admin_controls", "platform"),
        {
          ...next,
          updatedBy: user?.uid ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      toast.error(
        `Failed saving platform control: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsSavingControls(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Super Admin</h1>
          <p className="text-muted-foreground">Platform-wide management and oversight.</p>
        </div>
        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {openReportsCount} open reports
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

      {loading && (
        <div className="mb-6 rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Loading admin data from Firestore...
        </div>
      )}

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
                    <p className="text-xs text-muted-foreground">
                      {u.email} · Joined {formatDate(u.joinedAt)}
                    </p>
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
                      value={u.role}
                      className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      onChange={(event) => {
                        void updateUserRole(u.id, event.target.value, u.name);
                      }}
                    >
                      <option value="user">User</option>
                      <option value="group_admin">Group admin</option>
                      <option value="super_admin">Super admin</option>
                    </select>
                    {u.status !== "suspended" ? (
                      <button
                        className="text-xs text-destructive hover:underline"
                        onClick={() => {
                          void setUserSuspended(u.id, true, u.name);
                        }}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        className="text-xs text-green-600 hover:underline"
                        onClick={() => {
                          void setUserSuspended(u.id, false, u.name);
                        }}
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
              {openReports.map((report) => (
                <div key={report.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-0.5">
                        {report.reporter} reported {report.reported}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Reason: {report.reason} - {formatRelative(report.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void dismissReport(report.id);
                        }}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => {
                          void suspendFromReport(report);
                        }}
                      >
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
                { label: "New users", value: users.filter((u) => isWithinDays(u.joinedAt, 30)).length.toString(), change: "live" },
                { label: "Active groups", value: groupsCount.toString(), change: "live" },
                { label: "Total calls completed", value: completedCalls30d.toString(), change: "30d" },
                {
                  label: "Avg calls per user",
                  value: users.length > 0 ? (completedCalls30d / users.length).toFixed(1) : "0.0",
                  change: "30d",
                },
                { label: "Open reports", value: openReportsCount.toString(), change: "live" },
                { label: "Calls today", value: callsToday.toString(), change: "today" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-heading font-bold text-xl text-foreground">{item.value}</span>
                    <span className="text-xs font-medium text-muted-foreground">
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
                    <CheckCircle2 className={`w-3.5 h-3.5 ${item.ok ? "text-green-500" : "text-amber-500"}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform controls */}
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            <h2 className="font-semibold text-foreground">Platform controls</h2>
            {[
              {
                label: "Allow new user signups",
                desc: "Disable to temporarily freeze registrations.",
                checked: newUserSignups,
                onChange: (value: boolean) => {
                  setNewUserSignups(value);
                  void savePlatformControls({ allowNewUserSignups: value });
                },
              },
              {
                label: "Enable stranger-matched calls",
                desc: "Global toggle for the opt-in matched calling feature.",
                checked: strangerCalls,
                onChange: (value: boolean) => {
                  setStrangerCalls(value);
                  void savePlatformControls({ enableStrangerCalls: value });
                },
              },
              {
                label: "Maintenance mode",
                desc: "Shows a maintenance page to all non-admin users.",
                checked: maintenanceMode,
                onChange: (value: boolean) => {
                  setMaintenanceMode(value);
                  void savePlatformControls({ maintenanceMode: value });
                },
                danger: true,
              },
            ].map((item) => (
              <div key={item.label} className={`flex items-start justify-between gap-4 ${item.danger ? "pt-4 border-t border-destructive/20" : ""}`}>
                <div>
                  <p className={`text-sm font-medium ${item.danger ? "text-destructive" : "text-foreground"}`}>{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch
                  checked={item.checked}
                  disabled={isSavingControls}
                  onCheckedChange={(v) => {
                    item.onChange(v);
                    toast[item.danger && v ? "error" : "success"](`${item.label} ${v ? "enabled" : "disabled"}`);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-4">
            <h2 className="font-semibold text-foreground">Dashboard setup</h2>
            <p className="text-sm text-muted-foreground">
              Seed starter Firestore records for dashboard calls, notifications, and groups in this environment.
            </p>
            <Button
              onClick={handleSeedDashboardData}
              disabled={isSeedingDashboardData || !canSeedDashboardData}
              className="gradient-gold border-0 text-primary-foreground"
            >
              {isSeedingDashboardData ? "Seeding..." : "Seed dashboard starter data"}
            </Button>
            {!canSeedDashboardData && (
              <p className="text-xs text-muted-foreground">
                You must have an admin role in Firestore (`user/&lt;uid&gt;` with `role: "admin"`).
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toStringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function percentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatRelative(date: Date | null): string {
  if (!date) return "unknown time";
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function isWithinDays(date: Date | null, days: number): boolean {
  if (!date) return false;
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= threshold;
}

function formatDate(date: Date | null): string {
  if (!date) return "unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
