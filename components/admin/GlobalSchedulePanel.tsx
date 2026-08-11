"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { WEEKDAY_NAMES } from "@/lib/waitlist/schedule";
import { FALLBACK_TIMEZONES, formatZoneLabel } from "@/lib/waitlist/timezone";

// ─── Global pool schedule ────────────────────────────────────────────────────
//
// Community groups get a weekly window automatically when they activate. The
// global pool has no equivalent trigger, so without this an early access tester
// has consented to test and is waiting for a call that has no time.

interface ScheduleRow {
  id: string;
  weekday: number;
  localTime: string;
  zone: string;
  label: string;
  active: boolean;
  nextRun: string | null;
  notifiedAt: string | null;
}

export function GlobalSchedulePanel() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [testerCount, setTesterCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [weekday, setWeekday] = useState(0);
  const [localTime, setLocalTime] = useState("19:00");
  const [zone, setZone] = useState("Europe/London");
  const [label, setLabel] = useState("");
  const [notify, setNotify] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/global-schedule", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load schedules");
      setSchedules(data.schedules ?? []);
      setTesterCount(data.activeTesterCount ?? 0);
      setLoaded(true);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !loaded) void load();
  }, [user, loaded, load]);

  async function create() {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/global-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ weekday, localTime, zone, label, notify }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      toast.success(
        !notify
          ? "Window added"
          : data.notified?.skipped === "email_disabled"
            ? "Window added — email sending is off, so nobody was notified"
            : `Window added — ${data.notified?.sent ?? 0} tester(s) emailed`
      );
      setLabel("");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/global-schedule", {
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
    }
  }

  const inputClass =
    "h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading font-semibold text-base text-foreground flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            Early access call windows
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            When the global pool runs. {testerCount} active tester
            {testerCount !== 1 ? "s" : ""}.
          </p>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {loaded && schedules.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-border/60 bg-background px-4 py-3">
          No windows set. Testers have joined but have no call to attend.
        </p>
      )}

      {schedules.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5"
        >
          <span className="text-sm text-foreground font-medium">
            {WEEKDAY_NAMES[s.weekday]} {s.localTime}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatZoneLabel(s.zone)}
          </span>
          {s.label && (
            <span className="text-xs text-muted-foreground">· {s.label}</span>
          )}
          {s.nextRun && (
            <span className="text-xs text-muted-foreground">
              next {new Date(s.nextRun).toLocaleString()}
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {s.notifiedAt ? "testers notified" : "not notified"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void patch(s.id, { active: !s.active })}
          >
            {s.active ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm("Delete this call window?")) {
                void patch(s.id, { delete: true });
              }
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Day
          </label>
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className={inputClass}
          >
            {WEEKDAY_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Time
          </label>
          <input
            type="time"
            value={localTime}
            onChange={(e) => setLocalTime(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Time zone
          </label>
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className={inputClass}
          >
            {FALLBACK_TIMEZONES.map((z) => (
              <option key={z} value={z}>
                {formatZoneLabel(z)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Label (optional)
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sunday evening"
            className={`${inputClass} w-full`}
          />
        </div>
        <Button size="sm" onClick={() => void create()} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Add window
        </Button>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-primary"
        />
        Email active testers that their calls now have a time
      </label>
    </section>
  );
}
