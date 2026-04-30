"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  Plus,
  Settings,
  Shield,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

// ─── Interfaces ───────────────────────────────────────────────────────────────

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

interface AppUser {
  uid: string;
  name: string;
  fcmToken: string;
  voipToken: string;
}

interface ScheduledCallRecord {
  id: string;
  creatorId: string;
  creatorName: string;
  participantIds: string[];
  scheduledAt: Date;
  callType: string;
  status: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalDatetimeMin(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function formatScheduledAt(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

// ─── Component ────────────────────────────────────────────────────────────────

export function GroupAdminDashboard({ defaultTab = "members" }: { defaultTab?: string }) {
  const { user } = useAuth();

  // ── Members / Settings tab state (real Firestore data) ───────────────────
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

  // ── Schedule tab state ────────────────────────────────────────────────────
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCallRecord[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [durationMinutes, setDurationMinutes] = useState<number | "">("");
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // ── Load group admin data ─────────────────────────────────────────────────

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

        let groupMembersDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
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
            const scheduledAtDate = toDate(data.scheduledAt);
            const status = toStringOrFallback(data.status, "pending");
            if (scheduledAtDate && scheduledAtDate >= thisMonthStart) monthCalls += 1;
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
          toast.warning(`Some admin sections are limited by Firestore rules: ${blockedCollections.join(", ")}`);
        }
      } catch (error) {
        toast.error(`Failed loading group admin data: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => { cancelled = true; };
  }, [user]);

  // ── Schedule data loaders ─────────────────────────────────────────────────

  const loadScheduledCalls = useCallback(async () => {
    setLoadingCalls(true);
    try {
      const snap = await getDocs(
        query(collection(db, "scheduledGroupCalls"), where("status", "==", "scheduled"))
      );
      const calls: ScheduledCallRecord[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            creatorId: (d.creatorId as string) ?? "",
            creatorName: (d.creatorName as string) ?? "Unknown",
            participantIds: (d.participantIds as string[]) ?? [],
            scheduledAt: (d.scheduledAt as Timestamp).toDate(),
            callType: (d.callType as string) ?? "audio",
            status: (d.status as string) ?? "scheduled",
          };
        })
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      setScheduledCalls(calls);
    } catch {
      toast.error("Failed to load scheduled calls");
    } finally {
      setLoadingCalls(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const snap = await getDocs(collection(db, "user"));
      const users: AppUser[] = [];
      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        const fcmToken = d.fcmToken as string | undefined;
        if (!fcmToken) continue;
        users.push({
          uid: docSnap.id,
          name: ((d.name ?? d.username ?? d.displayName ?? d.email ?? "Unknown") as string),
          fcmToken,
          voipToken: (d.voipToken as string) ?? "",
        });
      }
      setAppUsers(users);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadScheduledCalls();
  }, [loadScheduledCalls]);

  useEffect(() => {
    if (showForm && appUsers.length === 0) {
      void loadUsers();
    }
  }, [showForm, appUsers.length, loadUsers]);

  // ── Handlers ─────────────────────────────────────────────────────────────

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
      toast.error(`Failed to send invite: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async function updateMemberRole(membershipId: string, role: string, name: string) {
    try {
      await updateDoc(doc(db, "memberships", membershipId), { role });
      setMembers((prev) => prev.map((m) => (m.membershipId === membershipId ? { ...m, role } : m)));
      toast.success(`Role updated for ${name}`);
    } catch (error) {
      toast.error(`Failed to update role: ${error instanceof Error ? error.message : "Unknown error"}`);
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
      toast.error(`Failed to remove member: ${error instanceof Error ? error.message : "Unknown error"}`);
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
      toast.error(`Failed saving schedule settings: ${error instanceof Error ? error.message : "Unknown error"}`);
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
      toast.error(`Failed saving group settings: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  function toggleParticipant(uid: string) {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function handleScheduleCall(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { toast.error("Not signed in"); return; }
    if (!scheduledAt) { toast.error("Pick a date and time"); return; }
    if (selectedUids.size === 0) { toast.error("Select at least one participant"); return; }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      toast.error("Scheduled time must be in the future");
      return;
    }

    setSubmitting(true);
    try {
      const callId = crypto.randomUUID();
      const participantIds = [
        user.uid,
        ...Array.from(selectedUids).filter((uid) => uid !== user.uid),
      ];

      const participantFcmTokens: Record<string, string> = {};
      const participantNames: Record<string, string> = {};
      const participantVoipTokens: Record<string, string> = {};

      for (const uid of participantIds) {
        const appUser = appUsers.find((u) => u.uid === uid);
        if (appUser) {
          participantFcmTokens[uid] = appUser.fcmToken;
          participantNames[uid] = appUser.name;
          if (appUser.voipToken) participantVoipTokens[uid] = appUser.voipToken;
        }
      }

      await setDoc(doc(db, "scheduledGroupCalls", callId), {
        callId,
        creatorId: user.uid,
        creatorName: user.displayName ?? user.email ?? "Operator",
        participantIds,
        participantNames,
        participantFcmTokens,
        participantVoipTokens,
        scheduledAt: Timestamp.fromDate(scheduledDate),
        callType,
        ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
        status: "scheduled",
        createdAt: Timestamp.now(),
      });

      toast.success("Call scheduled — it will fire automatically at the chosen time");
      setShowForm(false);
      setScheduledAt("");
      setSelectedUids(new Set());
      setCallType("audio");
      setDurationMinutes("");
      await loadScheduledCalls();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule call");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelCall(callId: string) {
    setCancelling(callId);
    try {
      await updateDoc(doc(db, "scheduledGroupCalls", callId), { status: "cancelled" });
      toast.success("Scheduled call cancelled");
      setScheduledCalls((prev) => prev.filter((c) => c.id !== callId));
    } catch {
      toast.error("Failed to cancel call");
    } finally {
      setCancelling(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

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

        {/* ── Members ── */}
        <TabsContent value="members" className="space-y-5">
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
                      onChange={(event) => { void updateMemberRole(m.membershipId, event.target.value, m.name); }}
                    >
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      className="text-xs text-destructive hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!m.canManage}
                      onClick={() => { void banMember(m.membershipId, m.name); }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Schedule ── */}
        <TabsContent value="schedule" className="space-y-4">

          {/* Scheduled calls list + create form */}
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground">Scheduled calls</h2>
              <Button
                size="sm"
                className="gradient-gold border-0 text-primary-foreground font-semibold gap-1.5"
                onClick={() => setShowForm((v) => !v)}
              >
                <Plus className="w-3.5 h-3.5" />
                {showForm ? "Cancel" : "Schedule call"}
              </Button>
            </div>

            {showForm && (
              <form onSubmit={handleScheduleCall} className="p-5 border-b border-border/60 space-y-4 bg-muted/30">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Date &amp; time</Label>
                    <Input
                      type="datetime-local"
                      min={toLocalDatetimeMin()}
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      required
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Call type</Label>
                    <select
                      value={callType}
                      onChange={(e) => setCallType(e.target.value as "audio" | "video")}
                      className="w-full h-9 border border-input rounded-lg px-3 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="audio">Audio</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Max duration (minutes) — optional</Label>
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    placeholder="No limit"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value === "" ? "" : Number(e.target.value))}
                    className="text-sm w-40"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Participants{appUsers.length > 0 && (
                      <span className="text-foreground font-medium"> ({selectedUids.size} selected)</span>
                    )}
                  </Label>

                  {loadingUsers ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading users…
                    </div>
                  ) : appUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No users with FCM tokens found. Users must have the mobile app installed and notifications enabled to receive calls.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
                      {appUsers.map((u) => (
                        <label
                          key={u.uid}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/40 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUids.has(u.uid)}
                            onChange={() => toggleParticipant(u.uid)}
                            className="rounded border-border accent-primary"
                          />
                          <div className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
                            {u.name[0]?.toUpperCase() ?? "?"}
                          </div>
                          <span className="text-sm text-foreground truncate">{u.name}</span>
                          {u.uid === user?.uid && (
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">you</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowForm(false); setSelectedUids(new Set()); setScheduledAt(""); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="gradient-gold border-0 text-primary-foreground font-semibold"
                    disabled={submitting || selectedUids.size === 0 || !scheduledAt}
                  >
                    {submitting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Scheduling…</>
                    ) : (
                      "Confirm schedule"
                    )}
                  </Button>
                </div>
              </form>
            )}

            {loadingCalls ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading…
              </div>
            ) : scheduledCalls.length === 0 ? (
              <div className="p-5 text-center text-sm text-muted-foreground">
                No upcoming scheduled calls.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {scheduledCalls.map((call) => {
                  const isPast = call.scheduledAt <= new Date();
                  return (
                    <div key={call.id} className="p-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        {call.callType === "video" ? (
                          <Video className="w-4 h-4 text-primary" />
                        ) : (
                          <Phone className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {call.callType === "video" ? "Video" : "Audio"} call — {call.participantIds.length} participant{call.participantIds.length !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatScheduledAt(call.scheduledAt)} · {call.creatorName}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${isPast ? "border-amber-300 text-amber-700 bg-amber-50" : "border-green-300 text-green-700 bg-green-50"}`}
                      >
                        {isPast ? "firing soon" : "scheduled"}
                      </Badge>
                      <button
                        onClick={() => { void handleCancelCall(call.id); }}
                        disabled={cancelling === call.id}
                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 ml-1"
                        aria-label="Cancel"
                      >
                        {cancelling === call.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Call window settings */}
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            <h2 className="font-semibold text-foreground text-sm">Default call window</h2>
            <p className="text-xs text-muted-foreground -mt-3">
              Used when the platform auto-schedules calls for your group.
            </p>
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
              onClick={() => { void saveScheduleSettings(); }}
            >
              Save settings
            </Button>
          </div>
        </TabsContent>

        {/* ── Moderation ── */}
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

        {/* ── Settings ── */}
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
            <Button
              className="gradient-gold border-0 text-primary-foreground font-semibold"
              onClick={() => { void saveGroupSettings(); }}
            >
              Save settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
