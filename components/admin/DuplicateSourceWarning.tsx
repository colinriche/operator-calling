"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMAND_STATUSES, platformLabel } from "@/lib/waitlist/constants";
import type { SimilarSourceRow } from "@/lib/waitlist/types";

// ─── "You may already be tracking this" ──────────────────────────────────────
//
// Shown when the server refuses a create or an edit with 409. Shared by the
// outreach panel's Add-source form and the spreadsheet view so both refusals
// read identically — the same wording, the same matches, the same override.
//
// The override is a real button rather than a hidden flag: two sources for one
// subreddit is sometimes genuinely right, and the person deciding that should
// be able to say so in one click after seeing what they are duplicating.

function statusLabel(id: string): string {
  return DEMAND_STATUSES.find((s) => s.id === id)?.label ?? id;
}

interface Props {
  matches: SimilarSourceRow[];
  /** What the admin was trying to do, for the heading. */
  action: "create" | "save";
  onDismiss: () => void;
  onOverride: () => void;
  overriding?: boolean;
}

export function DuplicateSourceWarning({
  matches,
  action,
  onDismiss,
  onOverride,
  overriding = false,
}: Props) {
  if (matches.length === 0) return null;

  const exact = matches.some((m) => m.exactUrl);
  const archived = matches.filter((m) => m.status === "archived");

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-heading font-semibold text-sm text-foreground">
            {exact
              ? "A source with this URL already exists"
              : `This looks like ${matches.length === 1 ? "a source" : "sources"} you already track`}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Two records for one place split its registrations, so neither ever
            reaches the threshold. Edit the existing source instead where you
            can.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {matches.map((match) => (
          <li
            key={match.id}
            className="rounded-lg border border-border/60 bg-background px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm text-foreground">
                {match.sourceName}
              </span>
              <Badge variant="secondary" className="text-[11px]">
                {platformLabel(match.platformId)}
              </Badge>
              <Badge
                variant={match.status === "archived" ? "outline" : "secondary"}
                className="text-[11px]"
              >
                {statusLabel(match.status)}
              </Badge>
              {match.exactUrl && (
                <Badge className="text-[11px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40">
                  Same URL
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {match.reason}
              {match.uniqueRegistrationCount > 0 &&
                ` · ${match.uniqueRegistrationCount} registration${
                  match.uniqueRegistrationCount === 1 ? "" : "s"
                } already attributed to it`}
            </p>
            {match.sourceUrl && (
              <a
                href={match.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1 break-all"
              >
                {match.sourceUrl}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )}
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {archived.length === 1 ? "One match is" : `${archived.length} matches are`}{" "}
          archived. Unarchiving keeps the registrations and tracked links it
          already has — adding a second record does not.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Go back and edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOverride}
          disabled={overriding}
          className="text-amber-700 dark:text-amber-500"
        >
          {overriding
            ? "Working…"
            : action === "create"
              ? "Create anyway — it is a different place"
              : "Save anyway — it is a different place"}
        </Button>
      </div>
    </div>
  );
}
