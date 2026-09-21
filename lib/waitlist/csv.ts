// ─── CSV export ──────────────────────────────────────────────────────────────
//
// One-way only. The database is the source of truth and there is deliberately
// no importer: a spreadsheet round-trip cannot tell a renamed source from a new
// one, and getting that wrong would silently split demand that took weeks to
// collect. Editing happens in the spreadsheet view, against the real records.
//
// Client-safe: no firebase-admin imports. Built in the browser from the rows
// the panel already fetched, so exporting needs no extra round trip and always
// matches exactly what is on screen.

import {
  CONNECTION_TYPES,
  DEMAND_STATUSES,
  RELATIONSHIP_STATUSES,
  SOURCE_TYPES,
  WAITLIST_MODES,
  platformLabel,
} from "./constants";
import type { DemandSourceRow } from "./types";

function labelFrom(
  list: readonly { id: string; label: string }[],
  id: string
): string {
  return list.find((entry) => entry.id === id)?.label ?? id ?? "";
}

/**
 * Quote a single field for RFC 4180.
 *
 * The leading-apostrophe guard is the reason this is not a one-liner: Sheets
 * and Excel treat a cell starting with `=`, `+`, `-` or `@` as a formula, and
 * these cells carry admin-written notes and URLs pasted from anywhere. A note
 * beginning "=/= what they asked for" would otherwise open as a broken formula
 * at best, and as a live one at worst.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Rows to an RFC 4180 document. CRLF, because Excel still wants it. */
export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * `2026-09-07 14:32` in UTC. Sheets parses this as a real datetime, which the
 * stored ISO string with its `Z` suffix is not - it lands as text and will not
 * sort chronologically, which is the one thing a date column is for.
 */
function utcDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

interface Column {
  header: string;
  value: (source: DemandSourceRow) => unknown;
}

/**
 * Column order is the export's contract with whoever reads it. Identity first,
 * then what the source is, then what it produced, then bookkeeping - so the
 * left-hand freeze in Sheets lands somewhere useful.
 */
const COLUMNS: Column[] = [
  { header: "ID", value: (s) => s.id },
  { header: "Source name", value: (s) => s.sourceName },
  { header: "Platform", value: (s) => platformLabel(s.platformId) },
  { header: "Platform ID", value: (s) => s.platformId },
  { header: "Source type", value: (s) => labelFrom(SOURCE_TYPES, s.sourceType) },
  { header: "Source URL", value: (s) => s.sourceUrl },
  { header: "Topic", value: (s) => s.topicName },
  { header: "Status", value: (s) => labelFrom(DEMAND_STATUSES, s.status) },
  { header: "Status ID", value: (s) => s.status },
  {
    header: "Relationship",
    value: (s) => labelFrom(RELATIONSHIP_STATUSES, s.relationshipStatus),
  },
  { header: "Page mode", value: (s) => labelFrom(WAITLIST_MODES, s.waitlistMode) },
  {
    header: "Connection type",
    value: (s) => labelFrom(CONNECTION_TYPES, s.connectionType),
  },
  { header: "Public display name", value: (s) => s.publicDisplayName },
  { header: "Public audience label", value: (s) => s.publicAudienceLabel },
  { header: "Public description", value: (s) => s.publicDescription },
  { header: "Family name", value: (s) => s.familyName },
  { header: "Internal notes", value: (s) => s.internalNotes },
  { header: "Posting rules", value: (s) => s.postingRules },

  // Blank rather than 0 when there is no override - 0 would read as "nobody
  // needed", which is a different claim from "use the default".
  { header: "Threshold override", value: (s) => s.demandThreshold ?? "" },
  { header: "Effective threshold", value: (s) => s.effectiveThreshold },
  { header: "Registrations", value: (s) => s.uniqueRegistrationCount },
  { header: "Signups (counter)", value: (s) => s.signupCount },
  { header: "Unique visits", value: (s) => s.uniqueVisitCount },
  { header: "Total visits", value: (s) => s.totalVisitCount },
  {
    header: "Conversion %",
    value: (s) => (s.uniqueVisitCount > 0 ? (s.conversionRate * 100).toFixed(1) : ""),
  },
  { header: "Organiser interest", value: (s) => s.organiserInterestCount },
  { header: "Testers", value: (s) => s.testerCount },
  { header: "Outreach posts", value: (s) => s.outreachCount },
  { header: "Share clicks", value: (s) => s.shareClickCount },

  { header: "Group ID", value: (s) => s.groupId ?? "" },
  { header: "Calls enabled", value: (s) => (s.groupId ? String(s.callsEnabled) : "") },

  // Reference only. Links are managed on the outreach page, not here.
  { header: "Tracked links", value: (s) => s.links.length },
  { header: "Source codes", value: (s) => s.links.map((l) => l.sourceCode).join(" ") },
  {
    header: "Tracked URLs",
    value: (s) => s.links.map((l) => l.trackedUrl).join(" | "),
  },
  { header: "Link labels", value: (s) => s.links.map((l) => l.label).join(" | ") },

  { header: "Threshold reached (UTC)", value: (s) => utcDateTime(s.thresholdReachedAt) },
  { header: "Last posted (UTC)", value: (s) => utcDateTime(s.lastPostedAt) },
  { header: "Created (UTC)", value: (s) => utcDateTime(s.createdAt) },
  { header: "Updated (UTC)", value: (s) => utcDateTime(s.updatedAt) },
];

/** The rows exactly as passed - already filtered and sorted by the caller. */
export function demandSourcesToCsv(sources: DemandSourceRow[]): string {
  return toCsv([
    COLUMNS.map((c) => c.header),
    ...sources.map((source) => COLUMNS.map((c) => c.value(source))),
  ]);
}

/** `operator-outreach-sources-2026-09-07.csv` */
export function csvFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}

/**
 * Hand the file to the browser.
 *
 * The BOM is not optional: without it Sheets and Excel read the file as the
 * local codepage and every accented community name in the export comes back
 * mangled.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
