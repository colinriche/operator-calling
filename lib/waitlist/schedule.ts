import { SCHEDULE_ZONE } from "./timezone";

// ─── Weekly call windows ─────────────────────────────────────────────────────
//
// A window is defined as a wall-clock time in a zone — Sunday 19:00
// Europe/London — and resolved to a UTC instant per occurrence.
//
// Storing only the UTC instant would drift an hour at each British Summer Time
// boundary, so a call advertised as 7pm would silently become 8pm in late
// October. Storing only local time loses the instant needed to actually fire
// anything. Both are kept, and each occurrence is resolved fresh.

/** Indexed by weekday number, 0 = Sunday. Safe to import from the browser. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Sunday. Matches JS `getUTCDay()` numbering. */
export const DEFAULT_SCHEDULE_WEEKDAY = 0;
export const DEFAULT_SCHEDULE_LOCAL_TIME = "19:00";

export interface WeeklyWindow {
  /** 0 = Sunday. */
  weekday: number;
  /** "HH:MM" in `zone`. */
  localTime: string;
  /** IANA zone the wall-clock time is defined in. */
  zone: string;
}

export const DEFAULT_WINDOW: WeeklyWindow = {
  weekday: DEFAULT_SCHEDULE_WEEKDAY,
  localTime: DEFAULT_SCHEDULE_LOCAL_TIME,
  zone: SCHEDULE_ZONE,
};

/**
 * How far `zone` is from UTC at a given instant, in milliseconds.
 *
 * Derived by asking Intl what the wall clock reads in that zone at that
 * instant, rather than from a table — so DST transitions are the runtime's
 * problem, not ours.
 */
function zoneOffsetMs(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;

  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    // Intl renders midnight as 24 in some locales/versions.
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second)
  );
  return asIfUtc - instant.getTime();
}

/**
 * The UTC instant at which a given wall-clock time occurs in a zone.
 *
 * Two passes: guess by treating the wall time as UTC, correct by the offset at
 * that guess, then re-check — because the offset can itself differ either side
 * of a DST boundary, and the naive single-pass version lands an hour out on
 * exactly the weekends people would notice.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = zoneOffsetMs(new Date(guess), zone);
  let utc = guess - firstOffset;

  const secondOffset = zoneOffsetMs(new Date(utc), zone);
  if (secondOffset !== firstOffset) utc = guess - secondOffset;

  return new Date(utc);
}

/** The wall-clock date in `zone` at a given instant. */
function zonedDateParts(instant: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdays.indexOf(map.weekday),
  };
}

/**
 * Next occurrence of a weekly window, strictly after `from`.
 *
 * Walks forward day by day in the window's own zone rather than adding
 * milliseconds, so a week is always seven local days even across a DST change.
 */
export function nextOccurrenceUtc(
  window: WeeklyWindow = DEFAULT_WINDOW,
  from: Date = new Date()
): Date {
  const [hourStr, minuteStr] = window.localTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  const today = zonedDateParts(from, window.zone);
  let daysAhead = (window.weekday - today.weekday + 7) % 7;

  for (let attempt = 0; attempt < 9; attempt++) {
    // Advance the local calendar date, letting Date.UTC normalise overflow.
    const target = new Date(
      Date.UTC(today.year, today.month - 1, today.day + daysAhead)
    );
    const candidate = zonedWallTimeToUtc(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
      hour,
      minute,
      window.zone
    );
    if (candidate.getTime() > from.getTime()) return candidate;
    // Today's slot has already passed — try next week.
    daysAhead += 7;
  }

  // Unreachable in practice; return something sane rather than throw.
  return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/** Stored representation of a window, keeping both local definition and instant. */
export function serialiseWindow(window: WeeklyWindow, from?: Date) {
  return {
    scheduleZone: window.zone,
    scheduleLocalTime: window.localTime,
    scheduleWeekday: window.weekday,
    scheduleNextRunUtc: nextOccurrenceUtc(window, from),
  };
}
