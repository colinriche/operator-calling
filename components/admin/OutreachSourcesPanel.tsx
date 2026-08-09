"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  AlertTriangle,
  UsersRound,
  GitBranch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  DEMAND_STATUSES,
  PLATFORMS,
  RELATIONSHIP_STATUSES,
  SOURCE_TYPES,
  platformLabel,
} from "@/lib/waitlist/constants";
import { countryName, languageName } from "@/lib/waitlist/locales";
import type { DemandSourceRow } from "@/lib/waitlist/types";

// ─── Outreach sources ────────────────────────────────────────────────────────
//
// Where a possible calling group is tracked before it becomes a real group:
// the audience, the tracked links posted for it, and how much demand those
// links have actually produced.
//
// Adding a source here creates no Operator group. One is created automatically
// when demand clears the threshold, then flagged for review — with its calls
// off until a group admin is appointed and turns them on.

type SortKey =
  | "recent"
  | "signups"
  | "visits"
  | "conversion"
  | "closest"
  | "name";

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "recent", label: "Most recent" },
  { id: "signups", label: "Most registrations" },
  { id: "visits", label: "Most visits" },
  { id: "conversion", label: "Best conversion" },
  { id: "closest", label: "Closest to threshold" },
  { id: "name", label: "Source name" },
];

interface SimilarGroup {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  score: number;
  reason: string;
}

interface GroupOption {
  id: string;
  name: string;
  memberCount: number;
}

interface ReviewState {
  similar: SimilarGroup[];
  groups: GroupOption[];
  strongDuplicateScore: number;
  groupProject: string;
  suggestedName: string;
}

interface RegistrationRow {
  id: string;
  email: string;
  displayName: string;
  interestedInOrganising: boolean;
  communityInterest: boolean;
  testerStatus: string;
  testerConsentAt: string | null;
  testerConsentVersion: string | null;
  timezone: string | null;
  country: string;
  englishFirstLanguage: boolean;
  firstLanguage: string | null;
  sourceCode: string | null;
  shareChannel: string | null;
  createdAt: string | null;
}

const BLANK_FORM = {
  sourceName: "",
  platformId: "reddit",
  sourceType: "subreddit",
  topicName: "",
  sourceUrl: "",
  publicAudienceLabel: "",
  postingRules: "",
  internalNotes: "",
  demandThreshold: "",
};

export function OutreachSourcesPanel() {
  const { user } = useAuth();
  const [sources, setSources] = useState<DemandSourceRow[]>([]);
  const [globalThreshold, setGlobalThreshold] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [platformFilter, setPlatformFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);

  // Registrations are loaded per source on demand — emails are the most
  // sensitive thing here, so they are never bulk-loaded with the list. The
  // route is open to admin and super_admin.
  const [openRegistrations, setOpenRegistrations] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);

  // Demand review — creating or linking a group. Loaded per source on demand,
  // since it scans the groups collection for possible duplicates.
  const [openReview, setOpenReview] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewMode, setReviewMode] = useState<"create" | "link">("create");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupPrivate, setGroupPrivate] = useState(true);
  const [linkGroupId, setLinkGroupId] = useState("");
  const [acknowledgeDuplicates, setAcknowledgeDuplicates] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);

  // Threshold editing — global default, and per-source overrides.
  const [thresholdDraft, setThresholdDraft] = useState("");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [togglingCalls, setTogglingCalls] = useState<string | null>(null);
  const [sourceThresholdDraft, setSourceThresholdDraft] = useState<
    Record<string, string>
  >({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/demand-sources", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load sources");
      setSources(data.sources ?? []);
      setGlobalThreshold(data.globalThreshold ?? 0);
      setThresholdDraft(String(data.globalThreshold ?? ""));
      setLoaded(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !loaded) void load();
  }, [user, loaded, load]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy — check clipboard permissions");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!form.sourceName.trim()) {
      toast.error("Source name is required");
      return;
    }

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const threshold = parseInt(form.demandThreshold, 10);
      const res = await fetch("/api/admin/demand-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          demandThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create source");

      await copy(data.trackedUrl, "Source created — waitlist link copied");
      setForm({ ...BLANK_FORM });
      setShowForm(false);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create source");
    } finally {
      setSaving(false);
    }
  }

  async function addLink(sourceId: string) {
    if (!user) return;
    const label = window.prompt(
      "Label for this tracked link (e.g. 'Comment on weekly thread, 6 Aug')"
    );
    if (label === null) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/source-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ demandSourceId: sourceId, label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create link");

      await copy(data.trackedUrl, "New tracked link copied");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create link");
    }
  }

  async function toggleRegistrations(sourceId: string) {
    if (openRegistrations === sourceId) {
      setOpenRegistrations(null);
      return;
    }
    if (!user) return;

    setOpenRegistrations(sourceId);
    setRegistrations([]);
    setLoadingRegistrations(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/demand-sources/${sourceId}/registrations`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load registrations");
      setRegistrations(data.registrations ?? []);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to load registrations"
      );
      setOpenRegistrations(null);
    } finally {
      setLoadingRegistrations(false);
    }
  }

  async function saveGlobalThreshold() {
    if (!user) return;
    const value = parseInt(thresholdDraft, 10);
    if (!Number.isFinite(value) || value < 1) {
      toast.error("Threshold must be 1 or more");
      return;
    }

    setSavingThreshold(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/demand-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ minimumWaitlistSignups: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save threshold");
      toast.success(`Default threshold set to ${value}`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save threshold");
    } finally {
      setSavingThreshold(false);
    }
  }

  async function saveSourceThreshold(sourceId: string, raw: string) {
    if (!user) return;
    const trimmed = raw.trim();
    // Empty clears the override and falls back to the global default.
    const value = trimmed === "" ? null : parseInt(trimmed, 10);
    if (value !== null && (!Number.isFinite(value) || value < 1)) {
      toast.error("Threshold must be 1 or more, or blank to use the default");
      return;
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/demand-sources/${sourceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ demandThreshold: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success(
        value === null ? "Using the default threshold" : `Threshold set to ${value}`
      );
      setSourceThresholdDraft((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function appointGroupAdmin(groupId: string) {
    if (!user || !groupId) return;
    const identifier = window.prompt(
      "Appoint a group admin — username, email address or uid.\n\nThis does not switch calls on; they turn them on themselves when ready."
    );
    if (!identifier?.trim()) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/groups/${groupId}/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to appoint");
      toast.success(
        `${data.displayName ?? "Group admin"} appointed — calls unchanged, they turn them on`
      );
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to appoint");
    }
  }

  async function toggleCalls(groupId: string, enable: boolean) {
    if (!user || !groupId) return;
    setTogglingCalls(groupId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/groups/${groupId}/calls`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ callsEnabled: enable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change calls");
      toast.success(
        enable
          ? "Calls on — resuming from the next scheduled occurrence"
          : "Calls paused — the schedule is unchanged"
      );
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to change calls");
    } finally {
      setTogglingCalls(null);
    }
  }

  async function toggleReview(source: DemandSourceRow) {
    if (openReview === source.id) {
      setOpenReview(null);
      return;
    }
    if (!user) return;

    setOpenReview(source.id);
    setReview(null);
    setReviewMode("create");
    setAcknowledgeDuplicates(false);
    setLinkGroupId("");
    setLoadingReview(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/demand-sources/${source.id}/group`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load review");
      setReview(data);
      setGroupName(data.suggestedName || source.sourceName);
      setGroupDescription(
        source.publicDescription ||
          `Calling group for people interested in ${source.publicAudienceLabel || source.topicName || source.sourceName}.`
      );
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load review");
      setOpenReview(null);
    } finally {
      setLoadingReview(false);
    }
  }

  async function submitGroup(sourceId: string) {
    if (!user) return;
    setSavingGroup(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/demand-sources/${sourceId}/group`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          reviewMode === "link"
            ? { action: "link", groupId: linkGroupId }
            : {
                action: "create",
                name: groupName,
                description: groupDescription,
                isPrivate: groupPrivate,
                acknowledgeDuplicates,
              }
        ),
      });
      const data = await res.json();

      // The server repeats the duplicate check even though the UI shows it, so
      // a 409 here means a strong match the reviewer has not acknowledged.
      if (res.status === 409 && data.requiresAcknowledgement) {
        setReview((prev) => (prev ? { ...prev, similar: data.similar } : prev));
        toast.error("Possible duplicate group — review and confirm to continue");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      toast.success(
        reviewMode === "link" ? "Linked to existing group" : "Group created"
      );
      setOpenReview(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingGroup(false);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = sources.filter((s) => {
      if (platformFilter !== "all" && s.platformId !== platformFilter) return false;
      if (!q) return true;
      return [
        s.sourceName,
        s.topicName,
        s.publicAudienceLabel,
        s.sourceUrl,
        s.internalNotes,
        s.postingRules,
        platformLabel(s.platformId),
        ...s.links.map((l) => l.sourceCode),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "signups":
          return b.uniqueRegistrationCount - a.uniqueRegistrationCount;
        case "visits":
          return b.uniqueVisitCount - a.uniqueVisitCount;
        case "conversion":
          return b.conversionRate - a.conversionRate;
        case "closest": {
          // Sources already over the line first, then by proportion complete.
          const ratio = (s: DemandSourceRow) =>
            s.effectiveThreshold > 0
              ? s.uniqueRegistrationCount / s.effectiveThreshold
              : 0;
          return ratio(b) - ratio(a);
        }
        case "name":
          return a.sourceName.localeCompare(b.sourceName);
        case "recent":
        default:
          return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      }
    });
    return sorted;
  }, [sources, query, sort, platformFilter]);

  // Only sources still awaiting a decision. thresholdReachedAt stays stamped
  // after review as a historical fact, so filtering on it alone would leave the
  // banner up forever once a group had been created.
  const thresholdReached = sources.filter(
    (s) => s.thresholdReachedAt && !s.groupId
  );

  const inputClass =
    "w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="space-y-4">
      {/* Threshold alerts */}
      {thresholdReached.length > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-heading font-semibold text-sm text-foreground mb-1">
                {thresholdReached.length} source
                {thresholdReached.length !== 1 ? "s have" : " has"} reached the demand
                threshold
              </p>
              <p className="text-sm text-muted-foreground">
                {thresholdReached.map((s) => s.sourceName).join(", ")} — review the
                demand before creating any group. Nothing is created automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search sources, topics, notes, tracking codes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="h-9 px-2 rounded-lg border border-border bg-background text-sm"
          aria-label="Filter by platform"
        >
          <option value="all">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 px-2 rounded-lg border border-border bg-background text-sm"
          aria-label="Sort sources"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>

        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4" />
          Add source
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}

      {/* Global threshold — editable here so changing it needs no deploy. */}
      <div className="rounded-xl border border-border/60 bg-card px-4 py-3 flex flex-wrap items-center gap-3">
        <label
          htmlFor="global-threshold"
          className="text-sm text-foreground font-medium"
        >
          Default demand threshold
        </label>
        <input
          id="global-threshold"
          type="number"
          min={1}
          value={thresholdDraft}
          onChange={(e) => setThresholdDraft(e.target.value)}
          className="h-9 w-24 px-3 rounded-lg border border-border bg-background text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void saveGlobalThreshold()}
          disabled={savingThreshold || thresholdDraft === String(globalThreshold)}
        >
          {savingThreshold && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </Button>
        <span className="text-xs text-muted-foreground">
          Registrations needed before a source is flagged for review. Sources with
          their own override are unaffected.
        </span>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-border/60 bg-card p-5 space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            Creates a demand source and its first tracked link. No Operator group is
            created.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Source name *
              </label>
              <input
                required
                value={form.sourceName}
                onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                placeholder="e.g. r/phonecalls"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Topic
              </label>
              <input
                value={form.topicName}
                onChange={(e) => setForm({ ...form, topicName: e.target.value })}
                placeholder="e.g. Talking with new people"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Platform
              </label>
              <select
                value={form.platformId}
                onChange={(e) => setForm({ ...form, platformId: e.target.value })}
                className={inputClass}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Source type
              </label>
              <select
                value={form.sourceType}
                onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                className={inputClass}
              >
                {SOURCE_TYPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Source URL
              </label>
              <input
                value={form.sourceUrl}
                onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                placeholder="https://…"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Public audience label
              </label>
              <input
                value={form.publicAudienceLabel}
                onChange={(e) =>
                  setForm({ ...form, publicAudienceLabel: e.target.value })
                }
                placeholder="e.g. live poker — completes “people interested in …”"
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Shown publicly. Leave blank to use the neutral fallback. Don&apos;t use
                &ldquo;official&rdquo;, &ldquo;partner&rdquo; or &ldquo;approved&rdquo;
                unless it is accurate.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Threshold override
              </label>
              <input
                type="number"
                min={1}
                value={form.demandThreshold}
                onChange={(e) =>
                  setForm({ ...form, demandThreshold: e.target.value })
                }
                placeholder={`Default: ${globalThreshold}`}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Posting rules
              </label>
              <input
                value={form.postingRules}
                onChange={(e) => setForm({ ...form, postingRules: e.target.value })}
                placeholder="e.g. No repetitive promotion"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Internal notes
              </label>
              <textarea
                value={form.internalNotes}
                onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Create source and link
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Rows */}
      {loaded && visible.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-xl border border-border/60 bg-card p-6 text-center">
          {sources.length === 0
            ? "No outreach sources yet. Add one to generate a tracked waitlist link."
            : "No sources match those filters."}
        </p>
      )}

      <div className="space-y-3">
        {visible.map((source) => {
          // Progress tracks the count the threshold is actually judged on.
          const registrationCount = source.uniqueRegistrationCount;
          const pct =
            source.effectiveThreshold > 0
              ? Math.min(
                  100,
                  Math.round((registrationCount / source.effectiveThreshold) * 100)
                )
              : 0;
          const statusLabel =
            DEMAND_STATUSES.find((s) => s.id === source.status)?.label ?? source.status;
          const relLabel =
            RELATIONSHIP_STATUSES.find((r) => r.id === source.relationshipStatus)
              ?.label ?? source.relationshipStatus;

          return (
            <div
              key={source.id}
              className="rounded-xl border border-border/60 bg-card p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-heading font-semibold text-base text-foreground">
                      {source.sourceName}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {platformLabel(source.platformId)}
                    </Badge>
                    <Badge
                      variant={source.thresholdReachedAt ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {statusLabel}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        source.relationshipStatus === "unverified" &&
                          "text-muted-foreground"
                      )}
                    >
                      {relLabel}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {source.topicName || "No topic recorded"}
                    {source.publicAudienceLabel && (
                      <>
                        {" · public label: "}
                        <span className="text-foreground">
                          {source.publicAudienceLabel}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  {source.sourceUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(source.sourceUrl, "_blank", "noopener")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open source
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void addLink(source.id)}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    New link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void toggleRegistrations(source.id)}
                  >
                    <UsersRound className="w-3.5 h-3.5" />
                    {openRegistrations === source.id ? "Hide" : "Registrations"}
                  </Button>
                  {!source.groupId && (
                    <Button
                      variant={source.thresholdReachedAt ? "default" : "outline"}
                      size="sm"
                      onClick={() => void toggleReview(source)}
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      {openReview === source.id ? "Cancel" : "Review demand"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Demand */}
              <div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground mb-1.5">
                  <span>
                    {registrationCount} of {source.effectiveThreshold} registrations
                    {source.demandThreshold === null && " (global default)"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <label htmlFor={`threshold-${source.id}`} className="sr-only">
                      Threshold override for {source.sourceName}
                    </label>
                    <input
                      id={`threshold-${source.id}`}
                      type="number"
                      min={1}
                      placeholder={String(globalThreshold)}
                      value={
                        sourceThresholdDraft[source.id] ??
                        (source.demandThreshold === null
                          ? ""
                          : String(source.demandThreshold))
                      }
                      onChange={(e) =>
                        setSourceThresholdDraft((prev) => ({
                          ...prev,
                          [source.id]: e.target.value,
                        }))
                      }
                      className="h-7 w-16 px-2 rounded-md border border-border bg-background text-xs"
                    />
                    {sourceThresholdDraft[source.id] !== undefined && (
                      <button
                        type="button"
                        className="text-primary underline underline-offset-2"
                        onClick={() =>
                          void saveSourceThreshold(
                            source.id,
                            sourceThresholdDraft[source.id]
                          )
                        }
                      >
                        Save
                      </button>
                    )}
                    <span>{pct}%</span>
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-sm">
                {[
                  { label: "Visits", value: source.totalVisitCount },
                  { label: "Unique", value: source.uniqueVisitCount },
                  { label: "Registrations", value: registrationCount },
                  { label: "Testers", value: source.testerCount },
                  { label: "Organisers", value: source.organiserInterestCount },
                  {
                    label: "Conversion",
                    value: `${Math.round(source.conversionRate * 100)}%`,
                  },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="font-heading font-semibold text-foreground">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Tracked links */}
              <div className="space-y-2 pt-1">
                {source.links.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No tracked links yet.
                  </p>
                )}
                {source.links.map((link) => (
                  <div
                    key={link.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                  >
                    <code className="text-xs font-mono text-foreground">
                      {link.sourceCode}
                    </code>
                    <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {link.label}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {link.uniqueVisitCount} unique · {link.signupCount} joined ·{" "}
                      {link.shareClickCount} shares
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void copy(link.trackedUrl, "Link copied")}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        window.open(
                          `${link.trackedUrl}&preview=1`,
                          "_blank",
                          "noopener"
                        )
                      }
                    >
                      Preview
                    </Button>
                  </div>
                ))}
              </div>

              {source.groupId && (
                <div className="border-t border-border/60 pt-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-primary shrink-0" />
                    {source.autoCreatedGroupAt
                      ? "Group activated automatically"
                      : "Linked to group"}{" "}
                    <code className="font-mono text-foreground">
                      {source.groupId}
                    </code>
                  </p>
                  {/* Interest and membership are different things — a group can
                      open on 20 expressions of interest while only 2 of those
                      people have accounts yet. Showing one number would imply
                      20 callable members. */}
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">
                      {registrationCount} interested
                    </strong>{" "}
                    ·{" "}
                    <strong className="text-foreground">
                      {source.activeMemberCount} active member
                      {source.activeMemberCount !== 1 ? "s" : ""}
                    </strong>{" "}
                    · {source.pendingMemberCount} awaiting an account, joined
                    automatically when they sign up
                  </p>
                  {/* Whether the group is actually calling is a different
                      question from whether it exists, and needs to be obvious
                      at a glance. */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full border font-medium",
                        source.callsEnabled
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border bg-muted/60 text-muted-foreground"
                      )}
                    >
                      {source.callsEnabled ? "Calls on" : "Calls paused"}
                    </span>
                    {!source.callsEnabled && source.callsPausedReason && (
                      <span className="text-xs text-muted-foreground">
                        {source.callsPausedReason === "awaiting_group_admin"
                          ? "awaiting group admin"
                          : source.callsPausedReason === "admin_paused"
                            ? "paused by an administrator"
                            : "paused by the group admin"}
                      </span>
                    )}
                    {source.callsPausedReason === "awaiting_group_admin" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void appointGroupAdmin(source.groupId!)}
                      >
                        <UsersRound className="w-3.5 h-3.5" />
                        Appoint group admin
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={togglingCalls === source.groupId}
                      onClick={() =>
                        void toggleCalls(source.groupId!, !source.callsEnabled)
                      }
                    >
                      {togglingCalls === source.groupId && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      {source.callsEnabled ? "Turn calls off" : "Turn calls on"}
                    </Button>
                  </div>
                  {source.reviewRequiredAfterCreate && (
                    <p className="text-xs text-primary flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Created without review — check the name and that it is not a
                      duplicate.
                    </p>
                  )}
                </div>
              )}

              {openReview === source.id && (
                <div className="border-t border-border/60 pt-4 space-y-4">
                  {loadingReview ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Checking for similar groups…
                    </p>
                  ) : review ? (
                    <>
                      {review.similar.length > 0 && (
                        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3">
                          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-primary" />
                            {review.similar.length} existing group
                            {review.similar.length !== 1 ? "s" : ""} may already cover
                            this audience
                          </p>
                          <ul className="space-y-1.5">
                            {review.similar.map((s) => (
                              <li
                                key={s.id}
                                className="text-xs text-muted-foreground flex flex-wrap gap-x-2"
                              >
                                <span className="text-foreground font-medium">
                                  {s.name}
                                </span>
                                <span>
                                  {s.memberCount} member
                                  {s.memberCount !== 1 ? "s" : ""}
                                </span>
                                <span>· {s.reason}</span>
                                <button
                                  type="button"
                                  className="text-primary underline underline-offset-2"
                                  onClick={() => {
                                    setReviewMode("link");
                                    setLinkGroupId(s.id);
                                  }}
                                >
                                  Link to this instead
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex gap-2">
                        {(["create", "link"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setReviewMode(mode)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                              reviewMode === mode
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:border-primary/40"
                            )}
                          >
                            {mode === "create"
                              ? "Create new group"
                              : "Link existing group"}
                          </button>
                        ))}
                      </div>

                      {reviewMode === "create" ? (
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1.5">
                              Group name *
                            </label>
                            <input
                              value={groupName}
                              onChange={(e) => setGroupName(e.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 text-xs text-foreground">
                              <input
                                type="checkbox"
                                checked={groupPrivate}
                                onChange={(e) => setGroupPrivate(e.target.checked)}
                                className="w-4 h-4 rounded border-border accent-primary"
                              />
                              Private group
                            </label>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-foreground mb-1.5">
                              Description
                            </label>
                            <textarea
                              value={groupDescription}
                              onChange={(e) => setGroupDescription(e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1.5">
                            Existing group
                          </label>
                          <select
                            value={linkGroupId}
                            onChange={(e) => setLinkGroupId(e.target.value)}
                            className={inputClass}
                          >
                            <option value="">Select a group…</option>
                            {review.groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name} ({g.memberCount} member
                                {g.memberCount !== 1 ? "s" : ""})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {reviewMode === "create" &&
                        review.similar.some(
                          (s) => s.score >= review.strongDuplicateScore
                        ) && (
                          <label className="flex items-start gap-2 text-xs text-foreground">
                            <input
                              type="checkbox"
                              checked={acknowledgeDuplicates}
                              onChange={(e) =>
                                setAcknowledgeDuplicates(e.target.checked)
                              }
                              className="mt-0.5 w-4 h-4 shrink-0 rounded border-border accent-primary"
                            />
                            I&apos;ve checked the groups above and this is genuinely a
                            different audience.
                          </label>
                        )}

                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          disabled={
                            savingGroup ||
                            (reviewMode === "link"
                              ? !linkGroupId
                              : !groupName.trim())
                          }
                          onClick={() => void submitGroup(source.id)}
                        >
                          {savingGroup && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                          {reviewMode === "link"
                            ? "Link this group"
                            : "Create group"}
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Group lands in the{" "}
                          <code className="font-mono">{review.groupProject}</code>{" "}
                          project
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {openRegistrations === source.id && (
                <div className="border-t border-border/60 pt-3">
                  {loadingRegistrations ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading registrations…
                    </p>
                  ) : registrations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No registrations yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="pb-2 pr-3 font-medium">Email</th>
                            <th className="pb-2 pr-3 font-medium">Name</th>
                            <th className="pb-2 pr-3 font-medium">Country</th>
                            <th className="pb-2 pr-3 font-medium">First language</th>
                            <th className="pb-2 pr-3 font-medium">Tester</th>
                            <th className="pb-2 pr-3 font-medium">Time zone</th>
                            <th className="pb-2 pr-3 font-medium">Organiser</th>
                            <th className="pb-2 pr-3 font-medium">Code</th>
                            <th className="pb-2 font-medium">Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {registrations.map((r) => (
                            <tr key={r.id} className="border-t border-border/40">
                              <td className="py-2 pr-3 text-foreground">{r.email}</td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {r.displayName || "—"}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {r.country ? countryName(r.country) : "—"}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {r.englishFirstLanguage
                                  ? "English"
                                  : r.firstLanguage
                                    ? languageName(r.firstLanguage)
                                    : "—"}
                              </td>
                              <td className="py-2 pr-3">
                                {r.testerStatus === "none" ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <span
                                    title={
                                      r.testerConsentAt
                                        ? `Consented ${new Date(r.testerConsentAt).toLocaleString()} (${r.testerConsentVersion ?? "unknown version"})`
                                        : undefined
                                    }
                                    className={cn(
                                      "capitalize",
                                      r.testerStatus === "active"
                                        ? "text-primary font-medium"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    {r.testerStatus}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {r.timezone ?? "—"}
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {r.interestedInOrganising ? "Yes" : "—"}
                              </td>
                              <td className="py-2 pr-3 font-mono text-muted-foreground">
                                {r.sourceCode ?? "—"}
                              </td>
                              <td className="py-2 text-muted-foreground">
                                {r.createdAt
                                  ? new Date(r.createdAt).toLocaleDateString()
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {source.postingRules && (
                <p className="text-xs text-muted-foreground border-t border-border/60 pt-3">
                  <span className="font-medium text-foreground">Posting rules:</span>{" "}
                  {source.postingRules}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
