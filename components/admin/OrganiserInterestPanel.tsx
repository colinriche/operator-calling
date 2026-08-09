"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ORGANISER_STATUSES } from "@/lib/waitlist/constants";
import { countryName } from "@/lib/waitlist/locales";

// ─── Organiser interest ──────────────────────────────────────────────────────
//
// People who offered to help organise calls. Ticking that box grants nothing —
// this is where a person decides what, if anything, it leads to.
//
// The screen deliberately keeps three things visually apart: what they offered,
// what they claim about the external community, and whether anyone has checked.
// Collapsing them is how a stranger's self-description turns into authority.

interface OrganiserRow {
  id: string;
  email: string;
  displayName: string;
  country: string;
  timezone: string | null;
  createdAt: string | null;
  demandSourceId: string;
  sourceName: string;
  audienceLabel: string;
  sourceUrl: string;
  groupId: string | null;
  groupName: string | null;
  groupAdminId: string | null;
  organiserStatus: string;
  claimsToRunSource: boolean;
  claimVerified: boolean;
  organiserNotes: string;
  organiserReviewedAt: string | null;
  hasAccount: boolean;
  accountUid: string | null;
  isGroupAdmin: boolean;
}

const OPEN = new Set([
  "new",
  "reviewing",
  "contacted",
  "interested",
  "verification_needed",
]);

export function OrganiserInterestPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OrganiserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/organisers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load organisers");
      setRows(data.organisers ?? []);
      setLoaded(true);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load organisers");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !loaded) void load();
  }, [user, loaded, load]);

  async function patch(id: string, body: Record<string, unknown>) {
    if (!user) return;
    setBusy(id);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/organisers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(null);
    }
  }

  async function appoint(row: OrganiserRow) {
    if (!user || !row.groupId || !row.accountUid) return;
    if (
      !window.confirm(
        `Appoint ${row.displayName || row.email} as group admin of ${row.groupName}?\n\nThis gives them control of the group. It does not switch calls on — they do that themselves.`
      )
    ) {
      return;
    }

    setBusy(row.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/groups/${row.groupId}/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ identifier: row.accountUid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to appoint");
      await patch(row.id, { organiserStatus: "approved" });
      toast.success("Appointed — they turn calls on when ready");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to appoint");
      setBusy(null);
    }
  }

  const visible = useMemo(
    () => (showAll ? rows : rows.filter((r) => OPEN.has(r.organiserStatus))),
    [rows, showAll]
  );

  const openCount = rows.filter((r) => OPEN.has(r.organiserStatus)).length;

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading font-semibold text-base text-foreground flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            Organiser interest
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {openCount} awaiting review of {rows.length} total. Offering to help
            grants nothing until someone here decides.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show open only" : "Show all"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {loaded && visible.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-border/60 bg-background px-4 py-3">
          {rows.length === 0
            ? "Nobody has offered to help organise yet."
            : "Nothing awaiting review."}
        </p>
      )}

      {visible.map((row) => (
        <div
          key={row.id}
          className="rounded-lg border border-border/60 bg-background p-4 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">
                  {row.displayName || "(no name given)"}
                </span>
                <span className="text-xs text-muted-foreground">{row.email}</span>
                <Badge variant="outline" className="text-xs capitalize">
                  {row.organiserStatus.replace(/_/g, " ")}
                </Badge>
                {row.isGroupAdmin && (
                  <Badge className="text-xs gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Group admin
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {row.sourceName}
                {row.audienceLabel && ` · ${row.audienceLabel}`}
                {row.country && ` · ${countryName(row.country)}`}
                {row.timezone && ` · ${row.timezone.replace(/_/g, " ")}`}
              </p>
            </div>

            {row.sourceUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(row.sourceUrl, "_blank", "noopener")}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Source
              </Button>
            )}
          </div>

          {/* What they assert, and whether anyone checked — kept apart. */}
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={row.claimsToRunSource}
                disabled={busy === row.id}
                onChange={(e) =>
                  void patch(row.id, { claimsToRunSource: e.target.checked })
                }
                className="w-4 h-4 rounded border-border accent-primary"
              />
              Claims to run this community
            </label>
            <label className="flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={row.claimVerified}
                disabled={busy === row.id || !row.claimsToRunSource}
                onChange={(e) =>
                  void patch(row.id, { claimVerified: e.target.checked })
                }
                className="w-4 h-4 rounded border-border accent-primary"
              />
              We verified that claim
            </label>
            {row.claimsToRunSource && !row.claimVerified && (
              <span className="text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-primary" />
                Unverified assertion by a stranger
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={row.organiserStatus}
              disabled={busy === row.id}
              onChange={(e) => void patch(row.id, { organiserStatus: e.target.value })}
              className="h-8 px-2 rounded-md border border-border bg-background text-xs"
              aria-label={`Review status for ${row.email}`}
            >
              {ORGANISER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>

            <input
              value={noteDraft[row.id] ?? row.organiserNotes}
              onChange={(e) =>
                setNoteDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
              }
              onBlur={() => {
                const draft = noteDraft[row.id];
                if (draft !== undefined && draft !== row.organiserNotes) {
                  void patch(row.id, { organiserNotes: draft });
                }
              }}
              placeholder="Contact notes…"
              className="flex-1 min-w-[180px] h-8 px-2 rounded-md border border-border bg-background text-xs"
            />

            {/* Appointment needs a group to administer and an account to attach
                authority to. Saying which is missing beats a disabled button. */}
            {row.isGroupAdmin ? null : !row.groupId ? (
              <span className="text-xs text-muted-foreground">
                No group yet for this community
              </span>
            ) : !row.hasAccount ? (
              <span className="text-xs text-muted-foreground">
                No Operator account on this email yet
              </span>
            ) : row.groupAdminId ? (
              <span className="text-xs text-muted-foreground">
                Group already has an admin
              </span>
            ) : (
              <Button
                size="sm"
                disabled={busy === row.id || !row.claimVerified}
                title={
                  row.claimVerified
                    ? undefined
                    : "Verify their claim before giving them the group"
                }
                onClick={() => void appoint(row)}
              >
                {busy === row.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Appoint as group admin
              </Button>
            )}
          </div>

          {row.organiserReviewedAt && (
            <p
              className={cn(
                "text-xs text-muted-foreground",
                busy === row.id && "opacity-50"
              )}
            >
              Last reviewed {new Date(row.organiserReviewedAt).toLocaleString()}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
