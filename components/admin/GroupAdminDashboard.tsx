"use client";

import { useState } from "react";
import { Users, Calendar, Shield, Settings, UserPlus, BarChart3, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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

export function GroupAdminDashboard({ defaultTab = "members" }: { defaultTab?: string }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [allowWeekends, setAllowWeekends] = useState(true);
  const [callWindowStart, setCallWindowStart] = useState("07:00");
  const [callWindowEnd, setCallWindowEnd] = useState("21:00");
  const [maxCallsPerDay, setMaxCallsPerDay] = useState("3");

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteEmail("");
  }

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
                    <span className="text-muted-foreground">Sent {inv.sentAt}</span>
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
              onClick={() => toast.success("Schedule settings saved")}
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

        {/* Settings */}
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
