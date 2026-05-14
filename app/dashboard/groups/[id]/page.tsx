"use client";

import { useState, useEffect, useCallback, use } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged, getIdToken } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { toast } from "sonner";
import {
  Users, Calendar, Settings, Shield, ArrowLeft,
  UserPlus, Loader2, Crown, Trash2, MoreHorizontal,
  Clock, Video, Mic, X, ChevronRight, Lock, Unlock,
  Phone, QrCode, Copy, Share2, RefreshCcw, Download, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toDataURL } from "qrcode";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupDetail {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  memberCount: number;
  isPrivate: boolean;
  type: string;
  allowMemberCalls: boolean;
  scheduleSettings: {
    allowedDays: number[];
    allowedHours: { start: string; end: string };
    maxCallsPerDay?: number;
  } | null;
  createdAt: string | null;
}

interface Member {
  uid: string;
  name: string;
  username: string;
  email: string;
  joinedAt: string | null;
  isCreator: boolean;
  role?: string;
}

interface PendingInvite {
  id: string;
  inviteeId: string;
  inviteeName: string;
  inviteeUsername: string;
  createdAt: string | null;
}

interface JoinRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterUsername: string;
  via: string;
  createdAt: string | null;
}

interface Schedule {
  id: string;
  creatorId: string;
  creatorName: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  scheduledAt: string | null;
  callType: "audio" | "video";
  note: string;
  status: string;
}

const GROUP_TABS = ["overview", "schedule", "settings", "moderation"] as const;
type GroupTab = (typeof GROUP_TABS)[number];
const SCHEDULE_EDIT_LOCK_MS = 2 * 60 * 1000;

function normalizeGroupTab(value: string | null): GroupTab {
  return GROUP_TABS.includes(value as GroupTab) ? (value as GroupTab) : "overview";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function authToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return getIdToken(user);
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await authToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateTimeInputValue(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-") + `T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function parseLocalDateTimeInput(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function canEditSchedule(schedule: Schedule) {
  if (!schedule.scheduledAt) return false;
  return new Date(schedule.scheduledAt).getTime() - Date.now() > SCHEDULE_EDIT_LOCK_MS;
}

function sortSchedules(items: Schedule[]) {
  return [...items].sort(
    (a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime()
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [uid, setUid] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<GroupTab>(() =>
    normalizeGroupTab(searchParams.get("tab"))
  );

  useEffect(() => {
    const nextTab = normalizeGroupTab(searchParams.get("tab"));
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams]);

  const handleTabChange = useCallback(
    (tab: string) => {
      const normalized = normalizeGroupTab(tab);
      setActiveTab(normalized);

      const params = new URLSearchParams(searchParams.toString());
      if (normalized === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", normalized);
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const loadGroup = useCallback(async (): Promise<GroupDetail | null> => {
    try {
      const data = await apiFetch(`/api/groups/${id}`);
      setGroup(data.group);
      setMembers(data.members ?? []);
      setPendingInvites(data.pendingInvites ?? []);
      return data.group ?? null;
    } catch {
      toast.error("Could not load group.");
      router.push("/dashboard/groups");
      return null;
    }
  }, [id, router]);

  const loadSchedules = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/groups/${id}/schedules`);
      setSchedules(data.schedules ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not load scheduled calls.");
    }
  }, [id]);

  const loadJoinRequests = useCallback(async (groupData: GroupDetail, currentUid: string) => {
    if (!groupData.isPrivate || groupData.createdBy !== currentUid) return;
    try {
      const data = await apiFetch(`/api/groups/${id}/join-requests`);
      setJoinRequests(data.requests ?? []);
    } catch {}
  }, [id]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);

      // Check super admin status from the user doc
      try {
        const snap = await getDoc(doc(db, "user", user.uid));
        if (snap.exists() && snap.data()?.role === "super_admin") {
          setIsSuperAdmin(true);
        }
      } catch { /* non-fatal */ }

      const [groupData] = await Promise.all([loadGroup(), loadSchedules()]);
      if (groupData) {
        await loadJoinRequests(groupData, user.uid);
      }
      setLoading(false);
    });
    return unsub;
  }, [loadGroup, loadJoinRequests, loadSchedules, router]);

  async function handleResolveJoinRequest(requestId: string, action: "approve" | "deny") {
    setResolvingRequestId(requestId);
    try {
      await apiFetch(`/api/groups/${id}/join-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });

      const resolvedRequest = joinRequests.find((req) => req.id === requestId);
      setJoinRequests((prev) => prev.filter((req) => req.id !== requestId));

      if (action === "approve" && resolvedRequest) {
        const member: Member = {
          uid: resolvedRequest.requesterId,
          name: resolvedRequest.requesterName,
          username: resolvedRequest.requesterUsername,
          email: "",
          joinedAt: new Date().toISOString(),
          isCreator: false,
          role: "member",
        };
        setMembers((prev) =>
          prev.some((m) => m.uid === member.uid) ? prev : [...prev, member]
        );
        setGroup((prev) => prev ? { ...prev, memberCount: prev.memberCount + 1 } : prev);
        toast.success(`${resolvedRequest.requesterName} approved.`);
      } else {
        toast.success("Join request denied.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to resolve join request.");
    } finally {
      setResolvingRequestId(null);
    }
  }

  const isCreator = uid === group?.createdBy;
  const canManageSchedules = isCreator && group?.type === "family";
  const canSeeMembers = isCreator || isSuperAdmin;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!group) return null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <Link href="/dashboard/groups" className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-heading font-bold text-3xl text-foreground">{group.name}</h1>
            {group.isPrivate
              ? <Lock className="w-4 h-4 text-muted-foreground" />
              : <Unlock className="w-4 h-4 text-muted-foreground" />}
          </div>
          {group.description && (
            <p className="text-muted-foreground">{group.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {group.memberCount} {group.memberCount === 1 ? "member" : "members"} · Created {fmtDate(group.createdAt)}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Members", value: group.memberCount, icon: Users },
          { label: "Pending invites", value: pendingInvites.length, icon: UserPlus },
          { label: "Upcoming calls", value: schedules.length, icon: Calendar },
          { label: "Call window", value: group.scheduleSettings?.allowedHours
              ? `${group.scheduleSettings.allowedHours.start}–${group.scheduleSettings.allowedHours.end}`
              : "Any time", icon: Clock },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card rounded-2xl p-4 border border-border/60">
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className="font-heading font-bold text-xl text-foreground">{value}</div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-4 w-full mb-6">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><Users className="w-3.5 h-3.5" />Members</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs gap-1.5"><Calendar className="w-3.5 h-3.5" />Schedule</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs gap-1.5"><Settings className="w-3.5 h-3.5" />Settings</TabsTrigger>
          <TabsTrigger value="moderation" className="text-xs gap-1.5"><Shield className="w-3.5 h-3.5" />Moderation</TabsTrigger>
        </TabsList>

        {/* ── Members tab ──────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-5">
          {isCreator && (
            <InviteMemberCard
              groupId={id}
              onInvited={(invite) => setPendingInvites((prev) => [invite, ...prev])}
            />
          )}

          {isCreator && group.isPrivate && joinRequests.length > 0 && (
            <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
              <div className="p-4 border-b border-border/60">
                <p className="font-semibold text-sm text-foreground">
                  Join requests ({joinRequests.length})
                </p>
              </div>
              <div className="divide-y divide-border/60">
                {joinRequests.map((req) => (
                  <div key={req.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                      {req.requesterName[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{req.requesterName}</p>
                      <p className="text-xs text-muted-foreground">@{req.requesterUsername}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {fmtDate(req.createdAt)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="gradient-gold border-0 text-primary-foreground font-semibold"
                        disabled={resolvingRequestId === req.id}
                        onClick={() => handleResolveJoinRequest(req.id, "approve")}
                      >
                        {resolvingRequestId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolvingRequestId === req.id}
                        onClick={() => handleResolveJoinRequest(req.id, "deny")}
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canSeeMembers && pendingInvites.length > 0 && (
            <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
              <div className="p-4 border-b border-border/60">
                <p className="font-semibold text-sm text-foreground">
                  Pending invites ({pendingInvites.length})
                </p>
              </div>
              <div className="divide-y divide-border/60">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0">
                      {inv.inviteeName[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{inv.inviteeName}</p>
                      <p className="text-xs text-muted-foreground">@{inv.inviteeUsername}</p>
                    </div>
                    <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                      Pending
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {fmtDate(inv.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canSeeMembers ? (
            <MemberList
              members={members}
              groupId={id}
              isCreator={isCreator}
              onMemberRemoved={(removedUid) => {
                setMembers((prev) => prev.filter((m) => m.uid !== removedUid));
                setGroup((prev) => prev ? { ...prev, memberCount: prev.memberCount - 1 } : prev);
              }}
              onRoleChanged={(memberUid, role) => {
                setMembers((prev) =>
                  prev.map((m) => m.uid === memberUid ? { ...m, role } : m)
                );
              }}
            />
          ) : (
            <div className="bg-card rounded-2xl border border-border/60 p-8 text-center text-muted-foreground text-sm">
              Member list is only visible to the group admin.
            </div>
          )}
        </TabsContent>

        {/* ── Schedule tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="schedule" className="space-y-5">
          {canManageSchedules && (
            <CreateScheduleCard
              groupId={id}
              members={members}
              onCreated={(s) => setSchedules((prev) => sortSchedules([s, ...prev]))}
            />
          )}

          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <p className="font-semibold text-sm text-foreground">
                Upcoming calls ({schedules.length})
              </p>
            </div>
            {schedules.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No calls scheduled yet.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {schedules.map((s) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    members={members}
                    canManage={canManageSchedules}
                    groupId={id}
                    onDeleted={(sid) => setSchedules((prev) => prev.filter((x) => x.id !== sid))}
                    onUpdated={(updated) => setSchedules((prev) => sortSchedules(
                      prev.map((x) => x.id === updated.id ? updated : x)
                    ))}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Settings tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="settings">
          {isCreator && (
            <GroupQrShareCard groupId={id} groupName={group.name} />
          )}
          <SettingsCard
            group={group}
            isCreator={isCreator}
            onSaved={(updated) => {
              setGroup((prev) => prev ? { ...prev, ...updated } : prev);
              if (updated.isPrivate === false) {
                setJoinRequests([]);
              }
            }}
            onDeleted={() => router.push("/dashboard/groups")}
          />
        </TabsContent>

        {/* ── Moderation tab ───────────────────────────────────────────────────── */}
        <TabsContent value="moderation">
          <ModerationCard members={members} groupId={id} isCreator={isCreator} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupQrShareCard({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [qrInviteUrl, setQrInviteUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateGroupQr(forceNew = false) {
    setLoading(true);
    try {
      const data = await apiFetch("/api/qrinvite/token", {
        method: "POST",
        body: JSON.stringify({
          type: "group",
          groupId,
          ctx: groupName,
          forceNew,
        }),
      });

      if (!data.publicUrl) throw new Error("Could not generate group QR");
      const url = data.publicUrl as string;
      const qr = await toDataURL(url, { width: 700, margin: 1 });
      setQrInviteUrl(url);
      setQrDataUrl(qr);
      setQrExpiresAt(data.expiresAt ?? null);
      toast.success(forceNew ? "Fresh group QR created." : "Group QR ready.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate group QR.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!qrInviteUrl) return;
    try {
      await navigator.clipboard.writeText(qrInviteUrl);
      toast.success("Group invite link copied.");
    } catch {
      toast.error("Could not copy invite link.");
    }
  }

  async function shareLink() {
    if (!qrInviteUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${groupName} on The Operator`,
          text: "Scan this QR or open this link to join the group.",
          url: qrInviteUrl,
        });
      } else {
        await copyLink();
      }
    } catch {
      // ignore user cancelled share
    }
  }

  useEffect(() => {
    if (qrInviteUrl) return;
    void generateGroupQr(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  return (
    <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-4 mb-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Group share QR</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={loading}
          onClick={() => generateGroupQr(true)}
        >
          {loading ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
          Regenerate
        </Button>
      </div>

      {loading && !qrDataUrl ? (
        <p className="text-xs text-muted-foreground">Generating QR…</p>
      ) : qrDataUrl ? (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`${groupName} group invite QR`}
            className="w-40 h-40 rounded-xl border border-border bg-white p-2"
          />
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>Share this with people who should join this group.</p>
            {qrExpiresAt && <p>Expires: {new Date(qrExpiresAt).toLocaleString("en-GB")}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={copyLink}>
                <Copy className="w-3.5 h-3.5" /> Copy link
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={shareLink}>
                <Share2 className="w-3.5 h-3.5" /> Share
              </Button>
              <a
                href={qrDataUrl}
                download={`${groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr.png`}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download PNG
              </a>
            </div>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => generateGroupQr(false)}>
          Generate QR
        </Button>
      )}
    </div>
  );
}

// ─── InviteMemberCard ─────────────────────────────────────────────────────────

function InviteMemberCard({
  groupId,
  onInvited,
}: {
  groupId: string;
  onInvited: (invite: PendingInvite) => void;
}) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({ username: username.trim().toLowerCase() }),
      });
      toast.success(`Invite sent to ${data.inviteeName}`);
      onInvited({
        id: crypto.randomUUID(),
        inviteeId: "",
        inviteeName: data.inviteeName,
        inviteeUsername: username.trim().toLowerCase(),
        createdAt: new Date().toISOString(),
      });
      setUsername("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl p-5 border border-border/60">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm text-foreground">Invite a member</h2>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          placeholder="Username (from the app)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={loading || !username.trim()}
          className="gradient-gold border-0 text-primary-foreground font-semibold"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Invite"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground mt-2">
        They'll receive an in-app notification to accept.
      </p>
    </div>
  );
}

// ─── MemberList ───────────────────────────────────────────────────────────────

function MemberList({
  members,
  groupId,
  isCreator,
  onMemberRemoved,
  onRoleChanged,
}: {
  members: Member[];
  groupId: string;
  isCreator: boolean;
  onMemberRemoved: (uid: string) => void;
  onRoleChanged: (uid: string, role: string) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  async function handleRemove(memberUid: string, name: string) {
    if (!confirm(`Remove ${name} from the group?`)) return;
    setRemoving(memberUid);
    try {
      await apiFetch(`/api/groups/${groupId}/members/${memberUid}`, { method: "DELETE" });
      toast.success(`${name} removed.`);
      onMemberRemoved(memberUid);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member.");
    } finally {
      setRemoving(null);
    }
  }

  async function handleRoleChange(memberUid: string, role: string, name: string) {
    setUpdatingRole(memberUid);
    try {
      await apiFetch(`/api/groups/${groupId}/members/${memberUid}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      toast.success(`${name} is now a ${role}.`);
      onRoleChanged(memberUid, role);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update role.");
    } finally {
      setUpdatingRole(null);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="p-4 border-b border-border/60">
        <p className="font-semibold text-sm text-foreground">
          Members ({members.length})
        </p>
      </div>
      <div className="divide-y divide-border/60">
        {members.map((m) => (
          <div key={m.uid} className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-sm shrink-0">
              {m.name[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                {m.isCreator && <Crown className="w-3 h-3 text-primary shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground">
                @{m.username}{m.email ? ` · ${m.email}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">Joined {fmtDate(m.joinedAt)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {m.isCreator ? (
                <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
                  Creator
                </Badge>
              ) : isCreator ? (
                <>
                  <select
                    value={m.role ?? "member"}
                    disabled={updatingRole === m.uid}
                    onChange={(e) => handleRoleChange(m.uid, e.target.value, m.name)}
                    className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="member">Member</option>
                    <option value="moderator">Moderator</option>
                  </select>
                  <button
                    onClick={() => handleRemove(m.uid, m.name)}
                    disabled={removing === m.uid}
                    className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    {removing === m.uid
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </>
              ) : (
                <Badge variant="outline" className="text-xs capitalize">
                  {m.role ?? "member"}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CreateScheduleCard ───────────────────────────────────────────────────────

function CreateScheduleCard({
  groupId,
  members,
  onCreated,
}: {
  groupId: string;
  members: Member[];
  onCreated: (s: Schedule) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="gradient-gold border-0 text-primary-foreground font-semibold gap-1.5 w-full sm:w-auto"
      >
        <Calendar className="w-4 h-4" /> Schedule a call
      </Button>

      <AnimatePresence>
        {open && (
          <ScheduleFormModal
            mode="create"
            groupId={groupId}
            members={members}
            onClose={() => setOpen(false)}
            onSaved={onCreated}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ScheduleFormModal({
  mode,
  groupId,
  members,
  schedule,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  groupId: string;
  members: Member[];
  schedule?: Schedule;
  onClose: () => void;
  onSaved: (s: Schedule) => void;
}) {
  const [scheduledAt, setScheduledAt] = useState(
    schedule?.scheduledAt ? toLocalDateTimeInputValue(new Date(schedule.scheduledAt)) : ""
  );
  const [callType, setCallType] = useState<"audio" | "video">(schedule?.callType ?? "audio");
  const [note, setNote] = useState(schedule?.note ?? "");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    schedule?.participantIds?.length ? schedule.participantIds : members.map((m) => m.uid)
  );
  const [loading, setLoading] = useState(false);

  const selectedDate = scheduledAt ? parseLocalDateTimeInput(scheduledAt) : null;
  const isFuture = Boolean(selectedDate && selectedDate > new Date());
  const minDateTime = toLocalDateTimeInputValue(new Date(Date.now() + 60000));

  function toggleMember(uid: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDate || !isFuture) return;
    setLoading(true);
    try {
      const data = await apiFetch(
        mode === "edit" && schedule
          ? `/api/groups/${groupId}/schedules/${schedule.id}`
          : `/api/groups/${groupId}/schedules`,
        {
          method: mode === "edit" ? "PATCH" : "POST",
          body: JSON.stringify({
            scheduledAt: selectedDate.toISOString(),
            callType,
            participantIds: selectedMemberIds,
            note: note.trim(),
          }),
        }
      );

      const fallback: Schedule = {
        id: schedule?.id ?? data.scheduleId,
        creatorId: schedule?.creatorId ?? "",
        creatorName: schedule?.creatorName ?? "You",
        participantIds: selectedMemberIds,
        participantNames: Object.fromEntries(
          members
            .filter((m) => selectedMemberIds.includes(m.uid))
            .map((m) => [m.uid, m.name])
        ),
        scheduledAt: selectedDate.toISOString(),
        callType,
        note: note.trim(),
        status: schedule?.status ?? "scheduled",
      };

      toast.success(mode === "edit" ? "Call updated." : "Call scheduled!");
      onSaved(data.schedule ?? fallback);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save scheduled call.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading font-bold text-lg text-foreground">
            {mode === "edit" ? "Edit scheduled call" : "Schedule a call"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Date &amp; time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={minDateTime}
              required
            />
            {scheduledAt && !isFuture && (
              <p className="text-xs text-destructive mt-1">Choose a future time.</p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Call type</Label>
            <div className="flex gap-2">
              {(["audio", "video"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCallType(type)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    callType === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-foreground"
                  }`}
                >
                  {type === "audio" ? <Mic className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                  {type === "audio" ? "Audio" : "Video"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">
              Participants ({selectedMemberIds.length}/{members.length})
            </Label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {members.map((m) => (
                <label key={m.uid} className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.includes(m.uid)}
                    onChange={() => toggleMember(m.uid)}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground">{m.name}</span>
                  <span className="text-xs text-muted-foreground">@{m.username}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. Monthly check-in"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !scheduledAt || !isFuture || selectedMemberIds.length === 0}
              className="flex-1 gradient-gold border-0 text-primary-foreground font-semibold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "edit" ? "Save" : "Schedule"}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── ScheduleRow ──────────────────────────────────────────────────────────────

function ScheduleRow({
  schedule,
  members,
  groupId,
  canManage,
  onDeleted,
  onUpdated,
}: {
  schedule: Schedule;
  members: Member[];
  groupId: string;
  canManage: boolean;
  onDeleted: (id: string) => void;
  onUpdated: (schedule: Schedule) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    if (!confirm("Cancel this scheduled call?")) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/groups/${groupId}/schedules/${schedule.id}`, { method: "DELETE" });
      toast.success("Call cancelled.");
      onDeleted(schedule.id);
    } catch {
      toast.error("Failed to cancel call.");
    } finally {
      setDeleting(false);
    }
  }

  const participantCount = schedule.participantIds.length;
  const editable = canEditSchedule(schedule);

  return (
    <div className="p-4 flex items-start gap-4">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        {schedule.callType === "video"
          ? <Video className="w-4 h-4 text-primary" />
          : <Phone className="w-4 h-4 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {schedule.callType === "video" ? "Video" : "Audio"} call
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {fmtDateTime(schedule.scheduledAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          {participantCount} participant{participantCount !== 1 ? "s" : ""}
          {schedule.note ? ` · ${schedule.note}` : ""}
        </p>
      </div>
      {canManage && (
        <div className="flex items-center gap-1.5 shrink-0">
          {editable ? (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Edit scheduled call"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="hidden sm:inline text-[11px] text-muted-foreground">Too close to edit</span>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            aria-label="Cancel scheduled call"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
      <AnimatePresence>
        {editing && (
          <ScheduleFormModal
            mode="edit"
            groupId={groupId}
            members={members}
            schedule={schedule}
            onClose={() => setEditing(false)}
            onSaved={(updated) => {
              onUpdated(updated);
              setEditing(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SettingsCard ─────────────────────────────────────────────────────────────

function SettingsCard({
  group,
  isCreator,
  onSaved,
  onDeleted,
}: {
  group: GroupDetail;
  isCreator: boolean;
  onSaved: (updated: Partial<GroupDetail>) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [isPrivate, setIsPrivate] = useState(group.isPrivate);
  const [allowMemberCalls, setAllowMemberCalls] = useState(group.allowMemberCalls);
  const [windowStart, setWindowStart] = useState(group.scheduleSettings?.allowedHours.start ?? "07:00");
  const [windowEnd, setWindowEnd] = useState(group.scheduleSettings?.allowedHours.end ?? "22:00");
  const [allowedDays, setAllowedDays] = useState<number[]>(
    group.scheduleSettings?.allowedDays ?? [1, 2, 3, 4, 5]
  );
  const [maxCalls, setMaxCalls] = useState(
    String(group.scheduleSettings?.maxCallsPerDay ?? 3)
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  function toggleDay(d: number) {
    setAllowedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Name cannot be empty."); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          isPrivate,
          allowMemberCalls,
          scheduleSettings: {
            allowedDays,
            allowedHours: { start: windowStart, end: windowEnd },
            maxCallsPerDay: parseInt(maxCalls, 10) || 3,
          },
        }),
      });
      toast.success("Settings saved.");
      onSaved({ name: name.trim(), description: description.trim(), isPrivate, allowMemberCalls });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${group.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/groups/${group.id}`, { method: "DELETE" });
      toast.success("Group deleted.");
      onDeleted();
    } catch {
      toast.error("Failed to delete group.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
        <h2 className="font-semibold text-foreground">Group details</h2>
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Group name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isCreator} />
        </div>
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Description</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isCreator}
            className="w-full min-h-[80px] resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        </div>
        {[
          {
            key: "isPrivate",
            label: "Private group",
            desc: "Members need owner approval before joining.",
            value: isPrivate,
            set: setIsPrivate,
          },
          {
            key: "allowMemberCalls",
            label: "Allow member-to-member calls",
            desc: "Members can call each other outside scheduled windows.",
            value: allowMemberCalls,
            set: setAllowMemberCalls,
          },
        ].map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-4 pt-2 border-t border-border">
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
            <Switch
              checked={item.value}
              onCheckedChange={item.set}
              disabled={!isCreator}
            />
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
        <h2 className="font-semibold text-foreground">Call window</h2>
        <p className="text-xs text-muted-foreground -mt-2">
          Controls when the app's pairing algorithm schedules calls for this group.
        </p>

        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Allowed days</Label>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => isCreator && toggleDay(i)}
                className={`w-9 h-9 rounded-lg text-xs font-medium border transition-colors ${
                  allowedDays.includes(i)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground"
                } ${!isCreator ? "opacity-60 cursor-default" : "cursor-pointer"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Window start</Label>
            <Input
              type="time"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              disabled={!isCreator}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Window end</Label>
            <Input
              type="time"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              disabled={!isCreator}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Max calls per member per day</Label>
          <Input
            type="number"
            min="1"
            max="20"
            value={maxCalls}
            onChange={(e) => setMaxCalls(e.target.value)}
            disabled={!isCreator}
            className="w-24"
          />
        </div>
      </div>

      {isCreator && (
        <>
          <Button
            className="gradient-gold border-0 text-primary-foreground font-semibold w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save settings"}
          </Button>

          <div className="bg-destructive/5 rounded-2xl p-6 border border-destructive/20 space-y-3">
            <h2 className="font-semibold text-destructive">Danger zone</h2>
            <p className="text-xs text-muted-foreground">
              Permanently deletes the group and removes all members. This cannot be undone.
            </p>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete group
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── ModerationCard ───────────────────────────────────────────────────────────

function ModerationCard({
  members,
  groupId,
  isCreator,
}: {
  members: Member[];
  groupId: string;
  isCreator: boolean;
}) {
  const [banning, setBanning] = useState<string | null>(null);

  async function handleBan(memberUid: string, name: string) {
    if (!confirm(`Remove and ban ${name}? They won't be able to rejoin.`)) return;
    setBanning(memberUid);
    try {
      await apiFetch(`/api/groups/${groupId}/members/${memberUid}`, { method: "DELETE" });
      toast.success(`${name} has been removed.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBanning(null);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
        <div className="p-4 border-b border-border/60">
          <p className="font-semibold text-sm text-foreground">Member actions</p>
          <p className="text-xs text-muted-foreground mt-0.5">Remove members from the group.</p>
        </div>
        {!isCreator ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Only the group creator can use moderation tools.
          </div>
        ) : members.filter((m) => !m.isCreator).length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No other members yet.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {members.filter((m) => !m.isCreator).map((m) => (
              <div key={m.uid} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
                  {m.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">@{m.username}</p>
                </div>
                <button
                  onClick={() => handleBan(m.uid, m.name)}
                  disabled={banning === m.uid}
                  className="text-xs px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 font-medium"
                >
                  {banning === m.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
