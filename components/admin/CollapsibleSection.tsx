"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Collapsible section with a "something new" arrow ────────────────────────
//
// `activity` is a number that only grows when something new arrives (a count,
// or a timestamp in ms). The last value seen with the section open is kept in
// localStorage; while collapsed, anything above it turns the arrow green.
//
// The children stay mounted while collapsed, only hidden. The panels load their
// own data, so unmounting them would mean nothing could ever report activity.
//
// The first time a section is ever seen it just records a baseline, so a fresh
// browser is not greeted with every old row marked as new.

const STORAGE_PREFIX = "operator:outreach-seen:";

function readSeen(id: string): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeSeen(id: string, value: number) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, String(value));
  } catch {
    // Storage blocked: the arrow just won't remember across visits.
  }
}

export function CollapsibleSection({
  id,
  title,
  summary,
  activity,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  /** Monotonic signal of new activity; undefined until the data has loaded. */
  activity?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [seen, setSeen] = useState<number | null>(null);
  const [seenRead, setSeenRead] = useState(false);
  const panelId = useId();

  useEffect(() => {
    setSeen(readSeen(id));
    setSeenRead(true);
  }, [id]);

  useEffect(() => {
    if (!seenRead || activity === undefined) return;
    // Open (so it is being looked at), never seen before (baseline), or the
    // number fell (rows removed, so the old mark is too high): catch up.
    if (open || seen === null || activity < seen) {
      if (seen !== activity) {
        setSeen(activity);
        writeSeen(id, activity);
      }
    }
  }, [id, open, activity, seen, seenRead]);

  const hasNew =
    !open && seenRead && activity !== undefined && seen !== null && activity > seen;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-5 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="min-w-0">
          <span className="block font-heading font-semibold text-foreground">
            {title}
          </span>
          {summary && (
            <span className="block text-xs text-muted-foreground truncate">
              {summary}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {hasNew && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              New activity
            </span>
          )}
          <ChevronDown
            aria-label={hasNew ? "New activity inside" : undefined}
            className={cn(
              "w-5 h-5 transition-transform",
              open && "rotate-180",
              hasNew
                ? "text-green-500 drop-shadow-[0_0_6px_rgb(34_197_94/0.9)]"
                : "text-muted-foreground"
            )}
          />
        </span>
      </button>

      <div id={panelId} hidden={!open} className="mt-3">
        {children}
      </div>
    </div>
  );
}
