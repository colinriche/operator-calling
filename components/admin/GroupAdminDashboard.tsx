"use client";

import { useEffect, useMemo, useState } from "react";
import { Users, Calendar, Shield, Settings, UserPlus, BarChart3, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface MemberRow {
  membershipId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joinedAt: Date | null;
  canManage: boolean;
}

interface PendingInviteRow {
  id: string;
  email: string;
  sentAt: Date | null;
}

export function GroupAdminDashboard({ defaultTab = "members" }: { defaultTab?: string }) {
  const { user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [allowWeekends, setAllowWeekends] = useState(false);
  const [callWindowStart, setCallWindowStart] = useState("09:00");
  const [callWindowEnd, setCallWindowEnd] = useState("22:00");
  const [maxCallsPerDay, setMaxCallsPerDay] = useState("3");
  const [groupName, setGroupName] = useState("Your group");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupPrivate, setGroupPrivate] = useState(false);
  const [allowMemberCalls, setAllowMemberCalls] = useState(true);

  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [callsThisMonth, setCallsThisMonth] = useState(0);
  const [avgCallLength, setAvgCallLength] = useState(0);
  const [connectionRate, setConnectionRate] = useState("0%");
  const [openReports, setOpenReports] = useState(0);
  const [bannedMembers, setBannedMembers] = useState(0);

  const stats = useMemo(
    () => [
      { icon: Users, label: "Total members", value: members.filter((m) => m.status === "active").length.toString() },
      { icon: BarChart3, label: "Calls this month", value: callsThisMonth.toString() },
      { icon: Clock, label: "Avg call length", value: `${avgCallLength.toFixed(1)} min` },
      { icon: CheckCircle2, label: "Connection rate", value: connectionRate },
    ],
    [avgCallLength, callsThisMonth, connectionRate, members]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const myMembershipsSnap = await getDocs(
          query(collection(db, "memberships"), where("userId", "==", user.uid))
        );
        const adminMembership = myMembershipsSnap.docs.find((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const role = typeof data.role === "string" ? data.role : "member";
          const status = typeof data.status === "string" ? data.status : "active";
          return (role === "admin" || role === "moderator") && status !== "banned";
        });

        if (!adminMembership) {
          if (!cancelled) {
            setLoading(false);
            setGroupId(null);
            setMembers([]);
            setPendingInvites([]);
          }
          return;
        }

        const adminMembershipData = adminMembership.data() as Record<string, unknown>;
        const selectedGroupId = adminMembershipData.groupId as string;
        const adminRole = toStringOrFallback(adminMembershipData.role, "admin");

        const groupSnap = await getDoc(doc(db, "groups", selectedGroupId));
        const groupData = groupSnap.exists() ? (groupSnap.data() as Record<string, unknown>) : {};

        const blockedCollections: string[] = [];

        let groupMembersDocs: Array<{
          id: string;
          data: Record<string, unknown>;
        }> = [];
        try {
          const groupMembersSnap = await getDocs(
            query(collection(db, "memberships"), where("groupId", "==", selectedGroupId))
          );
          groupMembersDocs = groupMembersSnap.docs.map((docSnap) => ({
            id: docSnap.id,
            data: docSnap.data() as Record<string, unknown>,
          }));
        } catch {
          blockedCollections.push("memberships");
          const memberIdsFallback = asStringArray(groupData.memberIds);
          groupMembersDocs = memberIdsFallback.map((memberId) => ({
            id: `readonly-${memberId}`,
            data: {
              userId: memberId,
              role: memberId === user.uid ? adminRole : "member",
              status: "active",
              joinedAt: null,
              _readonly: true,
            },
          }));
        }

        const memberIds = groupMembersDocs
          .map((member) => {
            const id = member.data.userId;
            return typeof id === "string" ? id : null;
          })
          .filter((id): id is string => Boolean(id));

        const uniqueMemberIds = [...new Set(memberIds)];
        const userDocs = await Promise.all(uniqueMemberIds.map((id) => getDoc(doc(db, "user", id))));
        const userMap = new Map<string, { name: string; email: string }>();
        for (const profileSnap of userDocs) {
          if (!profileSnap.exists()) continue;
          const data = profileSnap.data() as Record<string, unknown>;
          userMap.set(profileSnap.id, {
            name: toStringOrFallback(data.displayName, "Unknown user"),
            email: toStringOrFallback(data.email, `${profileSnap.id}@unknown`),
          });
        }

        const rows: MemberRow[] = groupMembersDocs.map((memberDoc) => {
          const data = memberDoc.data;
          const memberId = toStringOrFallback(data.userId, memberDoc.id);
          const profile = userMap.get(memberId);
          return {
            membershipId: memberDoc.id,
            name: profile?.name ?? "Unknown user",
            email: profile?.email ?? `${memberId}@unknown`,
            role: toStringOrFallback(data.role, "member"),
            status: toStringOrFallback(data.status, "active"),
            joinedAt: toDate(data.joinedAt),
            canManage: data._readonly === true ? memberId === user.uid : true,
          };
        });

        let inviteRows: PendingInviteRow[] = [];
        try {
          const invitesSnap = await getDocs(
            query(
              collection(db, "invites"),
              where("groupId", "==", selectedGroupId),
              where("status", "==", "pending")
            )
          );
          inviteRows = invitesSnap.docs.map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            return {
              id: docSnap.id,
              email: toStringOrFallback(data.invitedEmail, "Unknown email"),
              sentAt: toDate(data.createdAt),
            };
          });
        } catch {
          blockedCollections.push("invites");
        }

        const thisMonthStart = new Date();
        thisMonthStart.setDate(1);
        thisMonthStart.setHours(0, 0, 0, 0);
        let monthCalls = 0;
        let durationTotal = 0;
        let durationCount = 0;
        let completed = 0;
        let failed = 0;
        try {
          const schedulesSnap = await getDocs(
            query(collection(db, "schedules"), where("groupId", "==", selectedGroupId))
          );
          for (const scheduleDoc of schedulesSnap.docs) {
            const data = scheduleDoc.data() as Record<string, unknown>;
            const scheduledAt = toDate(data.scheduledAt);
            const status = toStringOrFallback(data.status, "pending");
            if (scheduledAt && scheduledAt >= thisMonthStart) monthCalls += 1;
            if (typeof data.durationMinutes === "number") {
              durationTotal += data.durationMinutes;
              durationCount += 1;
            }
            if (status === "completed" || status === "confirmed") completed += 1;
            if (status === "missed" || status === "cancelled") failed += 1;
          }
        } catch {
          blockedCollections.push("schedules");
        }

        if (cancelled) return;

        setGroupId(selectedGroupId);
        setGroupName(toStringOrFallback(groupData.name, "Your group"));
        setGroupDescription(toStringOrFallback(groupData.description, ""));
        setGroupPrivate(Boolean(groupData.isPrivate));
        setAllowMemberCalls(Boolean(groupData.allowMemberCalls ?? true));

        const scheduleSettings =
          groupData.scheduleSettings && typeof groupData.scheduleSettings === "object"
            ? (groupData.scheduleSettings as Record<string, unknown>)
            : {};
        const allowedHours =
          scheduleSettings.allowedHours && typeof scheduleSettings.allowedHours === "object"
            ? (scheduleSettings.allowedHours as Record<string, unknown>)
            : {};

        setCallWindowStart(toStringOrFallback(allowedHours.start, "09:00"));
        setCallWindowEnd(toStringOrFallback(allowedHours.end, "22:00"));
        setAllowWeekends(Boolean(scheduleSettings.allowWeekends ?? false));
        setMaxCallsPerDay(String(scheduleSettings.maxCallsPerDay ?? 3));

        setMembers(rows.sort((a, b) => a.name.localeCompare(b.name)));
        setPendingInvites(inviteRows);
        setCallsThisMonth(monthCalls);
        setAvgCallLength(durationCount > 0 ? durationTotal / durationCount : 0);
        setConnectionRate(percent(completed, completed + failed));
        try {
          const reportsSnap = await getDocs(
            query(collection(db, "reports"), where("groupId", "==", selectedGroupId))
          );
          setOpenReports(
            reportsSnap.docs.filter((docSnap) => {
              const status = toStringOrFallback((docSnap.data() as Record<string, unknown>).status, "open");
              return status !== "resolved" && status !== "dismissed";
            }).length
          );
        } catch {
          blockedCollections.push("reports");
          setOpenReports(0);
        }
        setBannedMembers(rows.filter((member) => member.status === "banned").length);
        if (blockedCollections.length > 0) {
          toast.warning(
            `Some admin sections are limited by Firestore rules: ${blockedCollections.join(", ")}`
          );
        }
      } catch (error) {
        toast.error(
          `Failed loading group admin data: ${
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
  }, [user]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !user || !groupId) return;

    try {
      const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      await addDoc(collection(db, "invites"), {
        groupId,
        invitedEmail: inviteEmail.trim().toLowerCase(),
        invitedBy: user.uid,
        status: "pending",
        createdAt: serverTimestamp(),
        expiresAt,
      });
      setPendingInvites((prev) => [
        { id: `${Date.now()}`, email: inviteEmail.trim().toLowerCase(), sentAt: new Date() },
        ...prev,
      ]);
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
    } catch (error) {
      toast.error(
        `Failed to send invite: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async function updateMemberRole(membershipId: string, role: string, name: string) {
    try {
      await updateDoc(doc(db, "memberships", membershipId), { role });
      setMembers((prev) => prev.map((m) => (m.membershipId === membershipId ? { ...m, role } : m)));
      toast.success(`Role updated for ${name}`);
    } catch (error) {
      toast.error(
        `Failed to update role: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async function banMember(membershipId: string, name: string) {
    try {
      await updateDoc(doc(db, "memberships", membershipId), { status: "banned" });
      setMembers((prev) =>
        prev.map((member) =>
          member.membershipId === membershipId ? { ...member, status: "banned" } : member
        )
      );
      toast.success(`${name} removed`);
    } catch (error) {
      toast.error(
        `Failed to remove member: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async function saveScheduleSettings() {
    if (!groupId) return;
    try {
      await updateDoc(doc(db, "groups", groupId), {
        scheduleSettings: {
          allowedHours: { start: callWindowStart, end: callWindowEnd },
          allowWeekends,
          maxCallsPerDay: Number(maxCallsPerDay),
        },
      });
      toast.success("Schedule settings saved");
    } catch (error) {
      toast.error(
        `Failed saving schedule settings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async function saveGroupSettings() {
    if (!groupId) return;
    try {
      await updateDoc(doc(db, "groups", groupId), {
        name: groupName,
        description: groupDescription,
        isPrivate: groupPrivate,
        allowMemberCalls,
      });
      toast.success("Group settings saved");
    } catch (error) {
      toast.error(
        `Failed saving group settings: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Group Admin</h1>
        <p className="text-muted-foreground">{groupName} — manage your group, members, and calls.</p>
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

      {loading && (
        <div className="mb-6 rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Loading group admin data from Firestore...
        </div>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList className="grid grid-cols-4 w-full mb-6">
          <TabsTrigger value="members" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" />Members</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5 text-xs"><Calendar className="w-3.5 h-3.5" />Schedule</TabsTrigger>
          <TabsTrigger value="moderation" className="gap-1.5 text-xs"><Shield className="w-3.5 h-3.5" />Moderation</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs"><Settings className="w-3.5 h-3.5" />Settings</TabsTrigger>
        </TabsList>

        {/* Members */}
        <TabsContent value="members" className="space-y-5">
          {/* Invite */}
          <div className="bg-card rounded-2xl p-5 border border-border/60">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm text-foreground">Invite a member</h2>
            </div>
            <form onSubmit={handleInvite} className="flex gap-2">
              <Input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" className="gradient-gold border-0 text-primary-foreground font-semibold">
                Send invite
              </Button>
            </form>
            {pendingInvites.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Pending invites</p>
                {pendingInvites.map((inv) => (
                  <div key={inv.email} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{inv.email}</span>
                    <span className="text-muted-foreground">Sent {formatRelativeDate(inv.sentAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Member list */}
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground">Members ({members.length})</h2>
            </div>
            <div className="divide-y divide-border/60">
              {members.map((m) => (
                <div key={m.email} className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-xs shrink-0">
                    {m.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.email} · Joined {formatDate(m.joinedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs capitalize ${m.status === "pending" ? "border-amber-300 text-amber-700 bg-amber-50" : ""}`}
                    >
                      {m.status}
                    </Badge>
                    <select
                      value={m.role}
                      className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      disabled={!m.canManage}
                      onChange={(event) => {
                        void updateMemberRole(m.membershipId, event.target.value, m.name);
                      }}
                    >
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      className="text-xs text-destructive hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!m.canManage}
                      onClick={() => {
                        void banMember(m.membershipId, m.name);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Schedule */}
        <TabsContent value="schedule" className="space-y-4">
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            <h2 className="font-semibold text-foreground">Call window settings</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Window start</Label>
                <Input type="time" value={callWindowStart} onChange={(e) => setCallWindowStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Window end</Label>
                <Input type="time" value={callWindowEnd} onChange={(e) => setCallWindowEnd(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Max calls per member per day</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={maxCallsPerDay}
                onChange={(e) => setMaxCallsPerDay(e.target.value)}
                className="w-24"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Allow weekend calls</p>
                <p className="text-xs text-muted-foreground">Members can be connected on Saturdays and Sundays</p>
              </div>
              <Switch checked={allowWeekends} onCheckedChange={setAllowWeekends} />
            </div>

            <Button
              className="gradient-gold border-0 text-primary-foreground font-semibold"
              onClick={() => {
                void saveScheduleSettings();
              }}
            >
              Save settings
            </Button>
          </div>
        </TabsContent>

        {/* Moderation */}
        <TabsContent value="moderation" className="space-y-4">
          <div className="bg-card rounded-2xl p-6 border border-border/60">
            <h2 className="font-semibold text-foreground mb-4">Moderation tools</h2>
            <div className="space-y-3">
              {[
                { action: "View reported calls", desc: `${openReports} open reports`, variant: "outline" as const },
                { action: "View banned members", desc: `${bannedMembers} banned members`, variant: "outline" as const },
                { action: "Post admin notice", desc: "Send a message to all group members", variant: "default" as const },
              ].map((item) => (
                <div key={item.action} className="flex items-center justify-between p-4 rounded-xl border border-border/60">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.action}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Button size="sm" variant={item.variant} className={item.variant === "default" ? "gradient-gold border-0 text-primary-foreground" : ""}>
                    Open
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="space-y-4">
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            <h2 className="font-semibold text-foreground">Group settings</h2>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Group name</Label>
              <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Description</Label>
              <textarea
                value={groupDescription}
                onChange={(event) => setGroupDescription(event.target.value)}
                className="w-full min-h-[80px] resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex items-start justify-between gap-4 pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Private group</p>
                <p className="text-xs text-muted-foreground mt-0.5">Members need owner approval before joining.</p>
              </div>
              <Switch checked={groupPrivate} onCheckedChange={setGroupPrivate} />
            </div>
            <div className="flex items-start justify-between gap-4 pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Allow member-to-member calls</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Members can initiate calls with each other outside scheduled windows.
                </p>
              </div>
              <Switch checked={allowMemberCalls} onCheckedChange={setAllowMemberCalls} />
            </div>
            <Button className="gradient-gold border-0 text-primary-foreground font-semibold" onClick={() => { void saveGroupSettings(); }}>
              Save settings
            </Button>
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

function toStringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function percent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function formatDate(date: Date | null): string {
  if (!date) return "unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeDate(date: Date | null): string {
  if (!date) return "unknown";
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(date);
}
