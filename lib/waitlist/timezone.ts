// ─── Time zones ──────────────────────────────────────────────────────────────
//
// Detected from the browser only, via
// `Intl.DateTimeFormat().resolvedOptions().timeZone`. No GPS, no IP lookup, no
// Google location services — a calling app asking for location permission to
// work out what "7pm" means would be wildly disproportionate, and the browser
// already knows.
//
// The detected zone is shown to the user and can be changed. Every stored
// instant is UTC; the zone only affects display.

/** The zone community call windows are defined in. */
export const SCHEDULE_ZONE = "Europe/London";

/**
 * Zones offered in the dropdown when the browser cannot enumerate its own.
 * Not exhaustive — the detected zone is always included even if absent here,
 * so nobody is forced to pick a wrong one.
 */
export const FALLBACK_TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Zurich",
  "Europe/Rome",
  "Europe/Vienna",
  "Europe/Prague",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Bucharest",
  "Europe/Kyiv",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Atlantic/Reykjavik",
  "America/St_Johns",
  "America/Halifax",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Winnipeg",
  "America/Denver",
  "America/Edmonton",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Africa/Casablanca",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Colombo",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Hobart",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "UTC",
];

/**
 * Whether a string is a time zone this runtime understands. Works on both
 * server and client: constructing a formatter with an unknown zone throws.
 */
export function isValidTimezone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The browser's own zone. Returns null when unavailable rather than guessing. */
export function detectTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/**
 * Every zone this runtime knows, for the dropdown. Falls back to the curated
 * list on browsers without `Intl.supportedValuesOf` (pre-2022 Safari/Firefox).
 */
export function listTimezones(include?: string | null): string[] {
  let zones: string[];
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    zones = supported ? supported("timeZone") : [...FALLBACK_TIMEZONES];
  } catch {
    zones = [...FALLBACK_TIMEZONES];
  }

  // Never drop the user's own zone just because our list is incomplete.
  if (include && isValidTimezone(include) && !zones.includes(include)) {
    zones = [include, ...zones];
  }
  return zones;
}

/** "Europe/London" → "Europe / London" for display. */
export function formatZoneLabel(zone: string): string {
  return zone.replace(/_/g, " ").replace("/", " / ");
}

/**
 * Current UTC offset of a zone, e.g. "GMT+1". Computed rather than stored,
 * because it changes twice a year.
 */
export function zoneOffsetLabel(zone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * Render an instant in a zone, e.g. "Sunday 7:00 pm".
 *
 * This is the whole point of storing UTC: one instant, displayed correctly
 * wherever the reader is, with British Summer Time handled by the runtime
 * rather than by us.
 */
export function formatInZone(instant: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(instant);
  } catch {
    return instant.toISOString();
  }
}
