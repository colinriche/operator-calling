"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getIdToken, signOut } from "firebase/auth";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { User, Phone, Shield, Bell, Users, X, QrCode, Copy, Share2, RefreshCcw, Download } from "lucide-react";
import { toDataURL } from "qrcode";

const INTEREST_SUGGESTIONS = [
  "Running", "Remote work", "Music", "Language learning", "Startups",
  "Philosophy", "Tech", "Fitness", "Books", "Travel", "Photography", "Gaming",
];

const PROFILE_TABS = ["basics", "calls", "privacy", "notifs"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

function normalizeProfileTab(value: string | null): ProfileTab {
  return PROFILE_TABS.includes(value as ProfileTab) ? (value as ProfileTab) : "basics";
}

export function ProfileEditor() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile, profileDocId, loading } = useAuth();
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState("");

  const [availStart, setAvailStart] = useState("09:00");
  const [availEnd, setAvailEnd] = useState("22:00");
  const [allowUnknown, setAllowUnknown] = useState(false);

  const [showOnline, setShowOnline] = useState(true);
  const [allowDiscovery, setAllowDiscovery] = useState(true);

  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [reminderNotifs, setReminderNotifs] = useState(true);
  const [qrInviteUrl, setQrInviteUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>(() =>
    normalizeProfileTab(searchParams.get("tab"))
  );

  useEffect(() => {
    const nextTab = normalizeProfileTab(searchParams.get("tab"));
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams]);

  function handleTabChange(nextTab: string) {
    const normalized = normalizeProfileTab(nextTab);
    setActiveTab(normalized);

    const params = new URLSearchParams(searchParams.toString());
    if (normalized === "basics") {
      params.delete("tab");
    } else {
      params.set("tab", normalized);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // Seed form once when profile first arrives
  if (!seeded && profile) {
    setSeeded(true);
    setDisplayName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
    setInterests(profile.interests ?? []);
    setAvailStart(profile.callPreferences?.availableHours?.start ?? "09:00");
    setAvailEnd(profile.callPreferences?.availableHours?.end ?? "22:00");
    setAllowUnknown(profile.callPreferences?.allowUnknownCalls ?? false);
    setShowOnline(profile.privacy?.showOnlineStatus ?? true);
    setAllowDiscovery(profile.privacy?.allowGroupDiscovery ?? true);
    setEmailNotifs(profile.notifications?.email ?? true);
    setPushNotifs(profile.notifications?.push ?? true);
    setReminderNotifs(profile.notifications?.upcomingCallReminder ?? true);
  }

  const completeness = Math.min(
    100,
    (displayName ? 20 : 0) +
    (bio ? 20 : 0) +
    (interests.length > 0 ? 20 : 0) +
    20 + // availability always set
    20   // privacy always set
  );

  function addInterest(val: string) {
    const trimmed = val.trim();
    if (trimmed && !interests.includes(trimmed) && interests.length < 10) {
      setInterests((prev) => [...prev, trimmed]);
    }
    setNewInterest("");
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "user", user.uid), {
        displayName,
        bio,
        interests,
        completeness,
        "callPreferences.availableHours.start": availStart,
        "callPreferences.availableHours.end": availEnd,
        "callPreferences.allowUnknownCalls": allowUnknown,
        "privacy.showOnlineStatus": showOnline,
        "privacy.allowGroupDiscovery": allowDiscovery,
        "notifications.email": emailNotifs,
        "notifications.push": pushNotifs,
        "notifications.upcomingCallReminder": reminderNotifs,
        updatedAt: serverTimestamp(),
      });
      toast.success("Profile saved");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;

    const reason = window.prompt(
      "Please tell us why you are deleting your account. This reason is stored in the archive record.",
      "User requested account deletion"
    );
    if (reason === null) return;

    const confirmed = window.confirm(
      "Delete your account? Your account data will be archived first to protect other users' records. If this website account is linked to your app account, the linked app account will be deleted too."
    );
    if (!confirmed) return;

    try {
      setDeletingAccount(true);
      const token = await getIdToken(user);
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          profileDocId,
          reason: reason.trim() || "User requested account deletion",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete account");
      await signOut(auth);
      toast.success("Your account has been archived and deleted.");
      router.replace("/");
    } catch (error) {
      toast.error(
        `Failed to delete account: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  async function generateProfileQr(forceNew = false) {
    if (!user) return;
    setLoadingQr(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch("/api/qrinvite/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: "personal", forceNew }),
      });

      const data = await res.json();
      if (!res.ok || !data.publicUrl) {
        throw new Error(data.error ?? "Failed to generate QR");
      }

      const url = data.publicUrl as string;
      const dataUrl = await toDataURL(url, { width: 700, margin: 1 });
      setQrInviteUrl(url);
      setQrDataUrl(dataUrl);
      setQrExpiresAt(data.expiresAt ?? null);
      toast.success(forceNew ? "Fresh profile QR created." : "Profile QR ready.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate QR.");
    } finally {
      setLoadingQr(false);
    }
  }

  async function copyQrLink() {
    if (!qrInviteUrl) return;
    try {
      await navigator.clipboard.writeText(qrInviteUrl);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  }

  async function shareQrLink() {
    if (!qrInviteUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Connect with me on The Operator",
          text: "Scan this QR or open this invite link.",
          url: qrInviteUrl,
        });
      } else {
        await copyQrLink();
      }
    } catch {
      // User cancelled share; no toast needed.
    }
  }

  useEffect(() => {
    if (!user || qrInviteUrl) return;
    void generateProfileQr(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return <div className="max-w-2xl mx-auto py-10 text-sm text-muted-foreground">Loading profile…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-heading font-bold text-3xl text-foreground">Your profile</h1>
          {profile?.banned === true && (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/5 text-destructive">
              Banned
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">Manage how you appear and how calls reach you.</p>
      </div>

      {profile?.banned === true && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">Account status: Banned</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your account is banned. Calling features may be restricted until an admin reinstates you.
          </p>
        </div>
      )}

      {/* Completeness */}
      <div className="bg-card rounded-2xl p-5 border border-border/60 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Profile completeness</span>
          <span className="text-sm font-bold text-primary">{completeness}%</span>
        </div>
        <Progress value={completeness} className="h-2" />
        {completeness < 100 && (
          <p className="text-xs text-muted-foreground mt-2">
            {completeness < 40 ? "Add a bio and interests to get better matched calls." : "Almost there — a few more details improve your call quality."}
          </p>
        )}
      </div>

      <div className="bg-card rounded-2xl p-5 border border-border/60 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Your share QR</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateProfileQr(true)}
            disabled={loadingQr}
            className="gap-1.5"
          >
            {loadingQr ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Regenerate
          </Button>
        </div>

        {loadingQr && !qrDataUrl ? (
          <div className="text-xs text-muted-foreground">Generating QR…</div>
        ) : qrDataUrl ? (
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Your profile invite QR"
              className="w-40 h-40 rounded-xl border border-border bg-white p-2"
            />
            <div className="flex-1 space-y-2 text-xs text-muted-foreground">
              <p>Share this QR publicly so people can add you on The Operator.</p>
              {qrExpiresAt && (
                <p>Expires: {new Date(qrExpiresAt).toLocaleString("en-GB")}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={copyQrLink}>
                  <Copy className="w-3.5 h-3.5" /> Copy link
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={shareQrLink}>
                  <Share2 className="w-3.5 h-3.5" /> Share
                </Button>
                <a
                  href={qrDataUrl}
                  download="operator-profile-qr.png"
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download PNG
                </a>
              </div>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => generateProfileQr(false)}>
            Generate QR
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-4 w-full mb-6">
          <TabsTrigger value="basics" className="gap-1.5 text-xs"><User className="w-3.5 h-3.5" />Basics</TabsTrigger>
          <TabsTrigger value="calls" className="gap-1.5 text-xs"><Phone className="w-3.5 h-3.5" />Calls</TabsTrigger>
          <TabsTrigger value="privacy" className="gap-1.5 text-xs"><Shield className="w-3.5 h-3.5" />Privacy</TabsTrigger>
          <TabsTrigger value="notifs" className="gap-1.5 text-xs"><Bell className="w-3.5 h-3.5" />Notifications</TabsTrigger>
        </TabsList>

        {/* Basics */}
        <TabsContent value="basics" className="space-y-5">
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">Email</Label>
              <Input value={user?.email ?? ""} disabled className="opacity-60 cursor-not-allowed" />
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">Bio</Label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A line or two about yourself — helps with matched calls."
                className="w-full min-h-[80px] resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground text-right mt-1">{bio.length}/200</p>
            </div>

            {/* Interests */}
            <div>
              <Label className="text-sm font-medium mb-2 block flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Interests
                <span className="text-muted-foreground font-normal">({interests.length}/10)</span>
              </Label>
              <div className="flex flex-wrap gap-2 mb-3">
                {interests.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={() => setInterests((prev) => prev.filter((t) => t !== tag))}
                  >
                    {tag} <X className="w-3 h-3" />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  placeholder="Add an interest..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInterest(newInterest))}
                />
                <Button type="button" variant="outline" onClick={() => addInterest(newInterest)}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {INTEREST_SUGGESTIONS.filter((s) => !interests.includes(s)).slice(0, 6).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addInterest(s)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Call preferences */}
        <TabsContent value="calls" className="space-y-4">
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            <div>
              <Label className="text-sm font-medium mb-3 block">Available for calls</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
                  <Input type="time" value={availStart} onChange={(e) => setAvailStart(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Until</Label>
                  <Input type="time" value={availEnd} onChange={(e) => setAvailEnd(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">The Operator will only attempt calls within this window.</p>
            </div>

            <div className="flex items-start justify-between gap-4 pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Allow matched calls with strangers</p>
                <p className="text-xs text-muted-foreground mt-0.5">Opt into privacy-first calls with people outside your network, matched by interest.</p>
              </div>
              <Switch checked={allowUnknown} onCheckedChange={setAllowUnknown} />
            </div>
          </div>
        </TabsContent>

        {/* Privacy */}
        <TabsContent value="privacy" className="space-y-4">
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            {[
              { label: "Show online status", desc: "Let contacts see when you're available.", checked: showOnline, onCheckedChange: setShowOnline },
              { label: "Allow group discovery", desc: "Let people find and invite you to groups.", checked: allowDiscovery, onCheckedChange: setAllowDiscovery },
            ].map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch checked={item.checked} onCheckedChange={item.onCheckedChange} />
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifs" className="space-y-4">
          <div className="bg-card rounded-2xl p-6 border border-border/60 space-y-5">
            {[
              { label: "Email notifications", desc: "Receive call confirmations and summaries by email.", checked: emailNotifs, onCheckedChange: setEmailNotifs },
              { label: "Push notifications", desc: "Get real-time alerts on your device.", checked: pushNotifs, onCheckedChange: setPushNotifs },
              { label: "Upcoming call reminders", desc: "Get a reminder 15 minutes before a scheduled call.", checked: reminderNotifs, onCheckedChange: setReminderNotifs },
            ].map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch checked={item.checked} onCheckedChange={item.onCheckedChange} />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gradient-gold border-0 text-primary-foreground font-semibold px-8"
        >
          {saving ? "Saving..." : "Save profile"}
        </Button>
      </div>

      <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <h2 className="text-sm font-semibold text-destructive">Delete account</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This archives your account record first. Permanent archive removal requires a written request and super admin approval.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={deletingAccount}
          className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={handleDeleteAccount}
        >
          {deletingAccount ? "Deleting..." : "Delete my account"}
        </Button>
      </div>
    </div>
  );
}
