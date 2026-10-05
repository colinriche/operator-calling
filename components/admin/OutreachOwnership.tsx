"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

// ─── Who owns outreach work, as the admin sees it ────────────────────────────
//
// Presentation only. What an admin is allowed to see is decided by the server
// from their role in the `admins` collection (lib/waitlist/ownership.ts); these
// controls only ask. An ordinary admin is never offered the scope selector, and
// were they to send the same request by hand the routes would answer 403.

export interface OwnerChoice {
  /** Firebase UID. */
  id: string;
  name: string;
  email?: string;
}

/** `mine`, `all`, `unassigned` or `owner:<admin id>` - the server's `?scope=`. */
export type OutreachScope = string;

export const LEGACY_LABEL = "Unassigned (legacy)";

/** Which admin's work is being shown. Super admins only: others render nothing. */
export function OwnerScopeSelect({
  scope,
  onChange,
  owners,
  isSuperAdmin,
  className,
}: {
  scope: OutreachScope;
  onChange: (scope: OutreachScope) => void;
  owners: OwnerChoice[];
  isSuperAdmin: boolean;
  className?: string;
}) {
  if (!isSuperAdmin) return null;
  return (
    <select
      // Empty is the server's default for a super admin: everything.
      value={scope || "all"}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ?? "h-9 px-2 rounded-lg border border-border bg-background text-sm"
      }
      aria-label="Whose outreach work to show"
    >
      <option value="mine">My work</option>
      <option value="all">All admins combined</option>
      {owners.map((o) => (
        <option key={o.id} value={`owner:${o.id}`}>
          {o.name}&apos;s work
        </option>
      ))}
      <option value="unassigned">{LEGACY_LABEL}</option>
    </select>
  );
}

/** Whose record this is. Legacy records say so rather than naming anyone. */
export function OwnerBadge({
  ownerId,
  ownerName,
  ownerEmail,
  viewerId,
}: {
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail?: string | null;
  viewerId?: string;
}) {
  if (!ownerId) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground" title="Predates ownership - a super admin can assign it">
        {LEGACY_LABEL}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs" title={ownerEmail || undefined}>
      Owner: {ownerName || ownerId}
      {viewerId && ownerId === viewerId ? " (you)" : ""}
    </Badge>
  );
}

/** Hand a source to an admin. Super admins only; the route enforces it too. */
export function OwnerAssign({
  sourceId,
  ownerId,
  owners,
  isSuperAdmin,
  onAssigned,
}: {
  sourceId: string;
  ownerId: string | null;
  owners: OwnerChoice[];
  isSuperAdmin: boolean;
  onAssigned: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function assign(next: string) {
    if (!user || !next || next === ownerId) return;
    setBusy(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/demand-sources/${sourceId}/owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ownerId: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not reassign");
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reassign");
    } finally {
      setBusy(false);
    }
  }

  if (!isSuperAdmin) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-muted-foreground" htmlFor={`owner-${sourceId}`}>
        Owner
      </label>
      <select
        id={`owner-${sourceId}`}
        value={ownerId ?? ""}
        disabled={busy}
        onChange={(e) => void assign(e.target.value)}
        className="h-8 px-2 rounded-lg border border-border bg-background text-sm"
      >
        {!ownerId && <option value="">{LEGACY_LABEL}</option>}
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">
        Its links and outreach records move with it.
      </span>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

// ─── Activity ────────────────────────────────────────────────────────────────

interface AdminActivityItem {
  id: string;
  at: string | null;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  summary: string;
}

interface VisitorItem {
  kind: "visit" | "share";
  at: string | null;
  sourceCode: string;
  unique: boolean;
  shareChannel: string | null;
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/**
 * What admins did - and, given one source, what visitors did to it, kept in a
 * separate list. Admin entries carry names; visitor entries are anonymous and
 * show only that a link was opened or shared.
 */
export function AdminActivityFeed({
  scope,
  sourceId,
}: {
  scope?: OutreachScope;
  /** One source's story, visitor traffic included. */
  sourceId?: string;
}) {
  const { user } = useAuth();
  const [admin, setAdmin] = useState<AdminActivityItem[] | null>(null);
  const [visitors, setVisitors] = useState<VisitorItem[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const token = await user.getIdToken();
      const qs = sourceId
        ? `demandSourceId=${encodeURIComponent(sourceId)}`
        : scope
          ? `scope=${encodeURIComponent(scope)}`
          : "";
      const res = await fetch(`/api/admin/admin-activity?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load activity");
      setAdmin(data.adminActivity ?? []);
      setVisitors(data.visitorActivity ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activity");
    }
  }, [user, scope, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!admin) return <p className="text-sm text-muted-foreground">Loading activity…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h4 className="text-sm font-semibold mb-2">Admin activity</h4>
        {admin.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {admin.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.actorName || a.actorEmail}</span>{" "}
                <span className="text-muted-foreground">
                  {a.summary} · {when(a.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {visitors && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Visitor activity</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Anonymous. Counts of link opens and share clicks, never people.
          </p>
          {visitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {visitors.slice(0, 30).map((v, i) => (
                <li key={`${v.at}-${i}`} className="text-muted-foreground">
                  {v.kind === "share"
                    ? `Share clicked${v.shareChannel ? ` (${v.shareChannel})` : ""}`
                    : v.unique
                      ? "New visitor"
                      : "Repeat visit"}{" "}
                  via {v.sourceCode} · {when(v.at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** The feed behind a button, so it is fetched only when somebody asks for it. */
export function ActivityToggle({
  label = "Activity",
  scope,
  sourceId,
}: {
  label?: string;
  scope?: OutreachScope;
  sourceId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-primary underline underline-offset-2"
        aria-expanded={open}
      >
        {open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      </button>
      {open && (
        <div className="mt-3">
          <AdminActivityFeed scope={scope} sourceId={sourceId} />
        </div>
      )}
    </div>
  );
}
