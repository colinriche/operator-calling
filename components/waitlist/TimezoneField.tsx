"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import {
  detectTimezone,
  formatZoneLabel,
  listTimezones,
  zoneOffsetLabel,
} from "@/lib/waitlist/timezone";
import type { TimezoneSource } from "@/lib/waitlist/constants";

// ─── Time zone ───────────────────────────────────────────────────────────────
//
// Detected from the browser and shown plainly, because it decides what time
// their calls appear to be at. Never asked for via location permission — the
// browser already knows, and prompting for GPS to work out what "7pm" means
// would be wildly disproportionate.
//
// Shown as read-only text with a "change" affordance rather than a dropdown by
// default: the detected value is almost always right, and a 400-entry select is
// a poor first impression on a signup form.

interface TimezoneFieldProps {
  value: string;
  source: TimezoneSource;
  onChange: (zone: string, source: TimezoneSource) => void;
}

export function TimezoneField({ value, source, onChange }: TimezoneFieldProps) {
  const [editing, setEditing] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    const zone = detectTimezone();
    setDetected(zone);
    // Only adopt the detected zone if the user has not chosen one themselves.
    if (zone && source === "detected" && zone !== value) {
      onChange(zone, "detected");
    }
    // Runs once on mount; re-detecting would fight the user's own choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zones = useMemo(() => listTimezones(value || detected), [value, detected]);
  const offset = value ? zoneOffsetLabel(value) : "";

  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Globe className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="text-muted-foreground">Times shown in</span>
        <span className="text-foreground font-medium">
          {value ? formatZoneLabel(value) : "your local time"}
          {offset && (
            <span className="text-muted-foreground font-normal"> ({offset})</span>
          )}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-primary underline underline-offset-2"
          >
            change
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-2">
          <label htmlFor="waitlist-timezone" className="sr-only">
            Time zone
          </label>
          <select
            id="waitlist-timezone"
            value={value}
            onChange={(e) => {
              onChange(e.target.value, "user_selected");
              setEditing(false);
            }}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {formatZoneLabel(zone)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
