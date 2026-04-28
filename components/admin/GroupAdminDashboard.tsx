"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  doc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import {
  Users,
  Calendar,
  Shield,
  Settings,
  UserPlus,
  BarChart3,
  Clock,
  CheckCircle2,
  Plus,
  Loader2,
  Phone,
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

// ─── Static mock data (Members / Moderation / Settings tabs) ──────────────────

const members = [
  { name: "Sarah K.", email: "sarah@example.com", role: "moderator", status: "active", joined: "Jan 2025" },
  { name: "Marcus T.", email: "marcus@example.com", role: "member", status: "active", joined: "Feb 2025" },
  { name: "Jordan W.", email: "jordan@example.com", role: "member", status: "pending", joined: "Mar 2025" },
  { name: "Priya N.", email: "priya@example.com", role: "member", status: "active", joined: "Mar 2025" },
];

const pendingInvites = [
  { email: "alex@example.com", sentAt: "2 days ago" },
  { email: "chloe@example.com", sentAt: "5 days ago" },
];

const stats = [
  { icon: Users, label: "Total members", value: "23" },
  { icon: BarChart3, label: "Calls this month", value: "147" },
  { icon: Clock, label: "Avg call length", value: "9 min" },
  { icon: CheckCircle2, label: "Connection rate", value: "84%" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

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
  // Round up to the next minute so the min is always in the future
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

// ─── Component ────────────────────────────────────────────────────────────────

export function GroupAdminDashboard({ defaultTab = "members" }: { defaultTab?: string }) {
  const { user } = useAuth();

  // Members tab state
  const [inviteEmail, setInviteEmail] = useState("");

  // Settings tab state
  const [allowWeekends, setAllowWeekends] = useState(true);
  const [callWindowStart, setCallWindowStart] = useState("07:00");
  const [callWindowEnd, setCallWindowEnd] = useState("21:00");
  const [maxCallsPerDay, setMaxCallsPerDay] = useState("3");

  // Schedule tab state
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCallRecord[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // ── Data loaders ─────────────────────────────────────────────────────────

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

  // Load users only when the form is opened
  useEffect(() => {
    if (showForm && appUsers.length === 0) {
      void loadUsers();
    }
  }, [showForm, appUsers.length, loadUsers]);

  // ── Schedule form handlers ────────────────────────────────────────────────

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
      // Creator is always first in participantIds (matches Flutter GroupCallService)
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

      const creatorName = user.displayName ?? user.email ?? "Operator";

      await setDoc(doc(db, "scheduledGroupCalls", callId), {
        callId,
        creatorId: user.uid,
        creatorName,
        participantIds,
        participantNames,
        participantFcmTokens,
        participantVoipTokens,
        scheduledAt: Timestamp.fromDate(scheduledDate),
        callType,
        status: "scheduled",
        createdAt: Timestamp.now(),
      });

      toast.success("Call scheduled — it will fire automatically at the chosen time");
      setShowForm(false);
      setScheduledAt("");
      setSelectedUids(new Set());
      setCallType("audio");
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

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteEmail("");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Group Admin</h1>
        <p className="text-muted-foreground">Running Club — manage your group, members, and calls.</p>
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
                    <span className="text-muted-foreground">Sent {inv.sentAt}</span>
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
                    <p className="text-xs text-muted-foreground">{m.email} · Joined {m.joined}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs capitalize ${m.status === "pending" ? "border-amber-300 text-amber-700 bg-amber-50" : ""}`}
                    >
                      {m.status}
                    </Badge>
                    <select
                      defaultValue={m.role}
                      className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      onChange={() => toast.success(`Role updated for ${m.name}`)}
                    >
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                    </select>
                    <button
                      className="text-xs text-destructive hover:underline"
                      onClick={() => toast.error(`${m.name} removed`)}
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

          {/* Upcoming scheduled calls */}
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

            {/* ── Create form ── */}
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

                {/* Participant picker */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Participants{" "}
                    {appUsers.length > 0 && (
                      <span className="text-foreground font-medium">
                        ({selectedUids.size} selected)
                      </span>
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
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Scheduling…
                      </>
                    ) : (
                      "Confirm schedule"
                    )}
                  </Button>
                </div>
              </form>
            )}

            {/* Scheduled calls list */}
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
                          {formatScheduledAt(call.scheduledAt)}
                          {" · "}{call.creatorName}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${isPast ? "border-amber-300 text-amber-700 bg-amber-50" : "border-green-300 text-green-700 bg-green-50"}`}
                      >
                        {isPast ? "firing soon" : "scheduled"}
                      </Badge>
                      <button
                        onClick={() => handleCancelCall(call.id)}
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

          {/* Call window settings (informational — not yet wired to Cloud Function) */}
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            <h2 className="font-semibold text-foreground text-sm">Default call window</h2>
            <p className="text-xs text-muted-foreground -mt-3">
              These preferences are saved per-group and used when the platform auto-schedules calls on your behalf.
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
              onClick={() => toast.success("Window settings saved")}
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
                { action: "View reported calls", desc: "0 open reports", variant: "outline" as const },
                { action: "View banned members", desc: "0 banned members", variant: "outline" as const },
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
              <Input defaultValue="Morning Runners" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Description</Label>
              <textarea
                defaultValue="Early morning runners based in London. We do weekly call check-ins on Monday mornings."
                className="w-full min-h-[80px] resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {[
              { label: "Private group", desc: "Only invited members can join.", checked: true },
              { label: "Allow member-to-member calls", desc: "Members can initiate calls with each other outside scheduled windows.", checked: false },
            ].map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4 pt-2 border-t border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch defaultChecked={item.checked} />
              </div>
            ))}
            <Button className="gradient-gold border-0 text-primary-foreground font-semibold" onClick={() => toast.success("Group settings saved")}>
              Save settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
