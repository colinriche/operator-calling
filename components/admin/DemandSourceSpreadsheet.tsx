"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AlertCircle,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Download,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  CONNECTION_TYPES,
  DEMAND_STATUSES,
  PLATFORMS,
  RELATIONSHIP_STATUSES,
  SOURCE_TYPES,
  WAITLIST_MODES,
} from "@/lib/waitlist/constants";
import { csvFilename, demandSourcesToCsv, downloadCsv } from "@/lib/waitlist/csv";
import { DuplicateSourceWarning } from "@/components/admin/DuplicateSourceWarning";
import { RowWaitlistImageButton } from "@/components/admin/RowWaitlistImageButton";
import type { DemandSourceRow, SimilarSourceRow } from "@/lib/waitlist/types";

// ─── Demand sources, as a spreadsheet ────────────────────────────────────────
//
// The same records the outreach panel manages one card at a time, in a grid
// built for changing forty of them in an afternoon. Same collection, same API
// routes, same validation — this is a second view of the data, not a second
// copy of it, and every edit is a PATCH to the record itself.
//
// There is no importer, deliberately. A spreadsheet round-trip cannot tell a
// renamed source from a new one, and guessing wrong would split registrations
// across two records. Editing the real records directly makes the question
// impossible to ask.
//
// Nothing here deletes. A source is pointed at by tracked links people have
// already posted, by registrations, visits and outreach history; archiving is
// the removal this system has, and it keeps all of it.

type Kind = "text" | "number" | "select" | "boolean" | "readonly";

interface Column {
  key: string;
  label: string;
  width: number;
  kind: Kind;
  options?: readonly { id: string; label: string }[];
  /** Display text. */
  text: (s: DemandSourceRow) => string;
  /** Sortable value; falls back to the display text. */
  sortBy?: (s: DemandSourceRow) => string | number;
  numeric?: boolean;
}

const PLATFORM_OPTIONS = PLATFORMS as readonly { id: string; label: string }[];
const TYPE_OPTIONS = SOURCE_TYPES as readonly { id: string; label: string }[];
const STATUS_OPTIONS = DEMAND_STATUSES as readonly { id: string; label: string }[];
const RELATIONSHIP_OPTIONS =
  RELATIONSHIP_STATUSES as readonly { id: string; label: string }[];
const MODE_OPTIONS = WAITLIST_MODES as readonly { id: string; label: string }[];
const CONNECTION_OPTIONS =
  CONNECTION_TYPES as readonly { id: string; label: string }[];

function optionLabel(
  options: readonly { id: string; label: string }[] | undefined,
  id: string
): string {
  if (!id) return "";
  return options?.find((o) => o.id === id)?.label ?? id;
}

/** Read a boolean column off a row by key, rather than by knowing which it is. */
function boolValue(source: DemandSourceRow, column: Column): boolean {
  return source[column.key as keyof DemandSourceRow] === true;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Column order follows how a source is actually worked: what it is, where it
 * is, where it stands, then the public wording, then the numbers it produced.
 * Everything an admin sets is editable; everything the system counts is not —
 * typing a registration count would be inventing demand.
 */
const COLUMNS: Column[] = [
  { key: "sourceName", label: "Source name", width: 220, kind: "text", text: (s) => s.sourceName },
  {
    key: "platformId",
    label: "Platform",
    width: 140,
    kind: "select",
    options: PLATFORM_OPTIONS,
    text: (s) => optionLabel(PLATFORM_OPTIONS, s.platformId),
  },
  {
    key: "sourceType",
    label: "Type",
    width: 140,
    kind: "select",
    options: TYPE_OPTIONS,
    text: (s) => optionLabel(TYPE_OPTIONS, s.sourceType),
  },
  {
    key: "status",
    label: "Status",
    width: 170,
    kind: "select",
    options: STATUS_OPTIONS,
    text: (s) => optionLabel(STATUS_OPTIONS, s.status),
  },
  {
    key: "relationshipStatus",
    label: "Relationship",
    width: 170,
    kind: "select",
    options: RELATIONSHIP_OPTIONS,
    text: (s) => optionLabel(RELATIONSHIP_OPTIONS, s.relationshipStatus),
  },
  { key: "topicName", label: "Topic", width: 160, kind: "text", text: (s) => s.topicName },
  { key: "sourceUrl", label: "Source URL", width: 240, kind: "text", text: (s) => s.sourceUrl },
  {
    key: "publicAudienceLabel",
    label: "Audience label",
    width: 200,
    kind: "text",
    text: (s) => s.publicAudienceLabel,
  },
  {
    key: "publicDisplayName",
    label: "Public name",
    width: 170,
    kind: "text",
    text: (s) => s.publicDisplayName,
  },
  {
    key: "waitlistMode",
    label: "Page mode",
    width: 140,
    kind: "select",
    options: MODE_OPTIONS,
    text: (s) => optionLabel(MODE_OPTIONS, s.waitlistMode),
  },
  {
    key: "connectionType",
    label: "Connection",
    width: 180,
    kind: "select",
    options: CONNECTION_OPTIONS,
    text: (s) => optionLabel(CONNECTION_OPTIONS, s.connectionType),
  },
  { key: "familyName", label: "Family name", width: 150, kind: "text", text: (s) => s.familyName },
  {
    key: "includeTopicInUrl",
    label: "Topic in URL",
    width: 100,
    kind: "boolean",
    text: (s) => (s.includeTopicInUrl ? "Yes" : "No"),
    sortBy: (s) => (s.includeTopicInUrl ? 1 : 0),
  },
  {
    key: "demandThreshold",
    label: "Threshold",
    width: 100,
    kind: "number",
    numeric: true,
    text: (s) => (s.demandThreshold === null ? "" : String(s.demandThreshold)),
    sortBy: (s) => s.demandThreshold ?? -1,
  },
  {
    key: "publicDescription",
    label: "Public description",
    width: 240,
    kind: "text",
    text: (s) => s.publicDescription,
  },
  {
    key: "postingRules",
    label: "Posting rules",
    width: 220,
    kind: "text",
    text: (s) => s.postingRules,
  },
  {
    key: "internalNotes",
    label: "Internal notes",
    width: 260,
    kind: "text",
    text: (s) => s.internalNotes,
  },

  // Counted, not typed.
  {
    key: "uniqueRegistrationCount",
    label: "Regs",
    width: 70,
    kind: "readonly",
    numeric: true,
    text: (s) => String(s.uniqueRegistrationCount),
    sortBy: (s) => s.uniqueRegistrationCount,
  },
  {
    key: "effectiveThreshold",
    label: "Needs",
    width: 70,
    kind: "readonly",
    numeric: true,
    text: (s) => String(s.effectiveThreshold),
    sortBy: (s) => s.effectiveThreshold,
  },
  {
    key: "uniqueVisitCount",
    label: "Visits",
    width: 70,
    kind: "readonly",
    numeric: true,
    text: (s) => String(s.uniqueVisitCount),
    sortBy: (s) => s.uniqueVisitCount,
  },
  {
    key: "conversionRate",
    label: "Conv %",
    width: 75,
    kind: "readonly",
    numeric: true,
    text: (s) => (s.uniqueVisitCount > 0 ? (s.conversionRate * 100).toFixed(1) : ""),
    sortBy: (s) => s.conversionRate,
  },
  {
    key: "organiserInterestCount",
    label: "Organisers",
    width: 85,
    kind: "readonly",
    numeric: true,
    text: (s) => String(s.organiserInterestCount),
    sortBy: (s) => s.organiserInterestCount,
  },
  {
    key: "outreachCount",
    label: "Posts",
    width: 70,
    kind: "readonly",
    numeric: true,
    text: (s) => String(s.outreachCount),
    sortBy: (s) => s.outreachCount,
  },
  {
    key: "sourceCodes",
    label: "Codes",
    width: 130,
    kind: "readonly",
    text: (s) => s.links.map((l) => l.sourceCode).join(" "),
  },
  {
    key: "updatedAt",
    label: "Updated",
    width: 105,
    kind: "readonly",
    text: (s) => shortDate(s.updatedAt),
    sortBy: (s) => s.updatedAt ?? "",
  },
  { key: "id", label: "ID", width: 190, kind: "readonly", text: (s) => s.id },
];

const EDITABLE = COLUMNS.filter((c) => c.kind !== "readonly");

/** Fields a new row asks for. The rest are editable the moment it exists. */
const NEW_ROW_KEYS = [
  "sourceName",
  "platformId",
  "sourceType",
  "status",
  "topicName",
  "sourceUrl",
  "publicAudienceLabel",
] as const;

const BLANK_DRAFT: Record<string, string> = {
  sourceName: "",
  platformId: "reddit",
  sourceType: "subreddit",
  status: "active_waitlist",
  topicName: "",
  sourceUrl: "",
  publicAudienceLabel: "",
};

/**
 * Width of the pinned actions column, and therefore the left offset of the
 * pinned name column beside it. One constant because they cannot disagree:
 * if they do, the name column overlaps the icons or floats away from them.
 *
 * Holds the state dot and three icon buttons on one line. It is sized to stop
 * them wrapping, because a wrapped action cell is the one thing that would
 * make the rows taller.
 */
const ACTIONS_WIDTH = 108;

type RowState = "saving" | "saved" | "error";
type StatusFilter = "active" | "archived" | "all" | string;

interface PendingEdit {
  id: string;
  key: string;
  value: unknown;
}

export function DemandSourceSpreadsheet() {
  const { user } = useAuth();
  const [sources, setSources] = useState<DemandSourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({ ...BLANK_DRAFT });
  const [creating, setCreating] = useState(false);

  // Refused as a duplicate. `pendingEdit` is the change that was refused, kept
  // so "save anyway" can replay exactly it rather than reconstructing it.
  const [duplicates, setDuplicates] = useState<SimilarSourceRow[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<"create" | "save">("create");
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);

  const cellRefs = useRef<Record<string, HTMLElement | null>>({});
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

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

  // Focus moves after a commit, once the editor has unmounted and the display
  // cell it hands off to is back in the DOM.
  useEffect(() => {
    if (!pendingFocus) return;
    cellRefs.current[pendingFocus]?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  // ─── Filtering and sorting ────────────────────────────────────────────────

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = sources.filter((s) => {
      // Archived sources are out of the way by default rather than gone. They
      // keep their registrations, links and history, and picking "Archived" or
      // "All" brings them back.
      if (statusFilter === "active") {
        if (s.status === "archived") return false;
      } else if (statusFilter !== "all" && s.status !== statusFilter) {
        return false;
      }
      if (platformFilter !== "all" && s.platformId !== platformFilter) return false;
      if (!q) return true;
      return [
        s.sourceName,
        s.topicName,
        s.publicAudienceLabel,
        s.publicDisplayName,
        s.sourceUrl,
        s.internalNotes,
        s.postingRules,
        s.id,
        ...s.links.map((l) => l.sourceCode),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });

    const column = COLUMNS.find((c) => c.key === sortKey);
    const value = (s: DemandSourceRow) =>
      column?.sortBy ? column.sortBy(s) : (column?.text(s) ?? "");

    const sorted = [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [sources, query, platformFilter, statusFilter, sortKey, sortDir]);

  const archivedCount = sources.filter((s) => s.status === "archived").length;
  const savingCount = Object.values(rowState).filter((v) => v === "saving").length;

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ─── Saving ───────────────────────────────────────────────────────────────

  function markRow(id: string, state: RowState | null) {
    setRowState((prev) => {
      const next = { ...prev };
      if (state === null) delete next[id];
      else next[id] = state;
      return next;
    });
  }

  const patch = useCallback(
    async (
      id: string,
      body: Record<string, unknown>
    ): Promise<{ ok: boolean; duplicates?: SimilarSourceRow[]; error?: string }> => {
      if (!user) return { ok: false, error: "Not signed in" };
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/demand-sources/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 409 && data.requiresAcknowledgement) {
        return { ok: false, duplicates: data.similar ?? [], error: data.error };
      }
      if (!res.ok) return { ok: false, error: data.error ?? "Failed to save" };
      return { ok: true };
    },
    [user]
  );

  /**
   * Write one field.
   *
   * Applied to the local row first so the grid never stalls mid-edit, and
   * rolled back on failure — an optimistic update that quietly survives a
   * rejected write would show an admin a value the database does not have.
   */
  const saveField = useCallback(
    async (id: string, key: string, value: unknown, acknowledge = false) => {
      const before = sources.find((s) => s.id === id);
      if (!before) return;

      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, [key]: value } : s))
      );
      markRow(id, "saving");

      const result = await patch(id, {
        [key]: value,
        ...(acknowledge ? { acknowledgeDuplicates: true } : {}),
      });

      if (result.duplicates?.length) {
        setSources((prev) => prev.map((s) => (s.id === id ? before : s)));
        markRow(id, null);
        setPendingEdit({ id, key, value });
        setDuplicateAction("save");
        setDuplicates(result.duplicates);
        toast.error(result.error ?? "This may already be tracked");
        return;
      }
      if (!result.ok) {
        setSources((prev) => prev.map((s) => (s.id === id ? before : s)));
        markRow(id, "error");
        toast.error(result.error ?? "Failed to save");
        return;
      }

      markRow(id, "saved");
      // Server-side effects — statusBeforeArchive, threshold re-evaluation —
      // are not guessed at locally, so the row is refetched rather than assumed.
      if (key === "status" || key === "demandThreshold") await load();
    },
    [sources, patch, load]
  );

  /** Normalise a cell's draft the way the field's editor implies. */
  function commit(id: string, column: Column, raw: string) {
    const source = sources.find((s) => s.id === id);
    if (!source) return;

    if (column.kind === "number") {
      const trimmed = raw.trim();
      const parsed = trimmed === "" ? null : parseInt(trimmed, 10);
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
        toast.error("Threshold must be 1 or more, or blank for the default");
        return;
      }
      if (parsed === source.demandThreshold) return;
      void saveField(id, column.key, parsed);
      return;
    }

    // Trimmed, and nothing else. The API routes trim every text field already,
    // so an untrimmed value here would report saved and come back different.
    const next = raw.trim();
    if (next === column.text(source).trim() && column.kind === "text") return;
    if (next === (source[column.key as keyof DemandSourceRow] as string)) return;
    void saveField(id, column.key, next);
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  const cellId = (rowId: string, key: string) => `${rowId}:${key}`;

  function moveFocus(rowId: string, key: string, dx: number, dy: number) {
    const rowIndex = visible.findIndex((s) => s.id === rowId);
    const colIndex = EDITABLE.findIndex((c) => c.key === key);
    if (rowIndex < 0 || colIndex < 0) return;

    const nextRow = Math.min(Math.max(rowIndex + dy, 0), visible.length - 1);
    const nextCol = Math.min(Math.max(colIndex + dx, 0), EDITABLE.length - 1);
    setPendingFocus(cellId(visible[nextRow].id, EDITABLE[nextCol].key));
  }

  function displayKeyDown(
    e: ReactKeyboardEvent<HTMLDivElement>,
    source: DemandSourceRow,
    column: Column
  ) {
    if (column.kind === "boolean" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      void saveField(source.id, column.key, !boolValue(source, column));
      return;
    }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      setDraftValue(
        column.kind === "select"
          ? String(source[column.key as keyof DemandSourceRow] ?? "")
          : column.text(source)
      );
      setEditing({ id: source.id, key: column.key });
      return;
    }
    // Tab is left to the browser: the display cells are the only tabbable
    // things in the grid and sit in column order, so it already walks the row.
    if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(source.id, column.key, 0, 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(source.id, column.key, 0, -1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(source.id, column.key, 1, 0); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(source.id, column.key, -1, 0); }
  }

  function editorKeyDown(
    e: ReactKeyboardEvent<HTMLElement>,
    source: DemandSourceRow,
    column: Column
  ) {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(null);
      setPendingFocus(cellId(source.id, column.key));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(source.id, column, draftValue);
      setEditing(null);
      setPendingFocus(cellId(source.id, column.key));
      return;
    }
    if (e.key === "Tab") {
      // The editor unmounts on commit, so the browser has nothing left to move
      // focus from. Committing first and aiming focus by hand keeps Tab doing
      // what it does in a spreadsheet: save this cell, open the next.
      e.preventDefault();
      commit(source.id, column, draftValue);
      setEditing(null);
      moveFocus(source.id, column.key, e.shiftKey ? -1 : 1, 0);
    }
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async function createRow(acknowledge = false) {
    if (!user) return;
    if (!newRow.sourceName.trim()) {
      toast.error("Source name is required");
      return;
    }
    setCreating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/demand-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newRow,
          demandThreshold: null,
          acknowledgeDuplicates: acknowledge,
        }),
      });
      const data = await res.json();

      if (res.status === 409 && data.requiresAcknowledgement) {
        setDuplicateAction("create");
        setDuplicates(data.similar ?? []);
        toast.error(data.error ?? "This may already be tracked");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to create source");

      setDuplicates([]);
      setNewRow({ ...BLANK_DRAFT });
      setAdding(false);
      toast.success(`Created — tracked link ${data.sourceCode}`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create source");
    } finally {
      setCreating(false);
    }
  }

  // ─── Archive ──────────────────────────────────────────────────────────────

  async function archive(source: DemandSourceRow) {
    const registrations = source.uniqueRegistrationCount;
    const confirmed = window.confirm(
      `Archive "${source.sourceName}"?\n\n` +
        "It leaves the active list but nothing is deleted: its " +
        `${registrations} registration${registrations === 1 ? "" : "s"}, tracked links, ` +
        "visits and outreach history all stay.\n\n" +
        "Its tracked links keep working — they show the generic waitlist page " +
        "instead of this community's one. You can restore it at any time."
    );
    if (!confirmed) return;

    markRow(source.id, "saving");
    const result = await patch(source.id, { archive: true });
    if (!result.ok) {
      markRow(source.id, "error");
      toast.error(result.error ?? "Failed to archive");
      return;
    }
    markRow(source.id, null);
    toast.success(`${source.sourceName} archived`);
    await load();
  }

  async function unarchive(source: DemandSourceRow) {
    markRow(source.id, "saving");
    const result = await patch(source.id, { unarchive: true });
    if (!result.ok) {
      markRow(source.id, "error");
      toast.error(result.error ?? "Failed to restore");
      return;
    }
    markRow(source.id, null);
    const restored = source.statusBeforeArchive
      ? optionLabel(STATUS_OPTIONS, String(source.statusBeforeArchive))
      : "Researching";
    toast.success(`${source.sourceName} restored to ${restored}`);
    await load();
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  function exportCsv() {
    if (visible.length === 0) {
      toast.error("Nothing to export — clear the filters or add a source");
      return;
    }
    downloadCsv(csvFilename("operator-outreach-sources"), demandSourcesToCsv(visible));
    toast.success(
      visible.length === sources.length
        ? `Exported ${visible.length} source${visible.length === 1 ? "" : "s"}`
        : `Exported ${visible.length} of ${sources.length} sources (current filters)`
    );
  }

  // ─── Cells ────────────────────────────────────────────────────────────────

  const cellClass =
    "block w-full h-full px-2 py-1.5 text-xs truncate outline-none focus:ring-2 focus:ring-inset focus:ring-primary/60 rounded-sm";

  function renderCell(source: DemandSourceRow, column: Column) {
    const text = column.text(source);

    if (column.kind === "readonly") {
      return (
        <span
          className={cn(
            cellClass,
            "text-muted-foreground",
            column.numeric && "text-right tabular-nums"
          )}
        >
          {text}
        </span>
      );
    }

    const isEditing = editing?.id === source.id && editing.key === column.key;

    if (isEditing && column.kind === "select") {
      const current = String(source[column.key as keyof DemandSourceRow] ?? "");
      const known = column.options?.some((o) => o.id === current);
      return (
        <select
          autoFocus
          value={draftValue}
          onChange={(e) => {
            setDraftValue(e.target.value);
            commit(source.id, column, e.target.value);
            setEditing(null);
            setPendingFocus(cellId(source.id, column.key));
          }}
          onKeyDown={(e) => editorKeyDown(e, source, column)}
          onBlur={() => setEditing(null)}
          className="w-full h-full px-1 text-xs bg-background border border-primary rounded-sm outline-none"
        >
          {!known && (
            <option value={current} disabled>
              — not set —
            </option>
          )}
          {column.options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    if (isEditing) {
      return (
        <input
          autoFocus
          type={column.kind === "number" ? "number" : "text"}
          min={column.kind === "number" ? 1 : undefined}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={(e) => editorKeyDown(e, source, column)}
          onBlur={() => {
            commit(source.id, column, draftValue);
            setEditing(null);
          }}
          className={cn(
            "w-full h-full px-2 text-xs bg-background border border-primary rounded-sm outline-none",
            column.numeric && "text-right tabular-nums"
          )}
        />
      );
    }

    return (
      <div
        ref={(el) => {
          cellRefs.current[cellId(source.id, column.key)] = el;
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => displayKeyDown(e, source, column)}
        onClick={() => {
          if (column.kind === "boolean") {
            void saveField(source.id, column.key, !boolValue(source, column));
            return;
          }
          setDraftValue(
            column.kind === "select"
              ? String(source[column.key as keyof DemandSourceRow] ?? "")
              : text
          );
          setEditing({ id: source.id, key: column.key });
        }}
        className={cn(
          cellClass,
          "cursor-text hover:bg-muted/60",
          column.numeric && "text-right tabular-nums",
          !text && "text-muted-foreground/50"
        )}
      >
        {text || "—"}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const selectClass =
    "h-9 px-2 rounded-lg border border-border bg-background text-sm";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search names, topics, URLs, notes, codes, IDs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="active">Active (hide archived)</option>
          <option value="all">All including archived</option>
          <option value="archived">Archived only{archivedCount ? ` (${archivedCount})` : ""}</option>
          {STATUS_OPTIONS.filter((s) => s.id !== "archived").map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className={selectClass}
          aria-label="Filter by platform"
        >
          <option value="all">All platforms</option>
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
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

        <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>

        <Button
          size="sm"
          onClick={() => {
            setAdding((v) => !v);
            setDuplicates([]);
          }}
        >
          <Plus className="w-4 h-4" />
          New row
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}

      {duplicates.length > 0 && (
        <DuplicateSourceWarning
          matches={duplicates}
          action={duplicateAction}
          overriding={creating}
          onDismiss={() => {
            setDuplicates([]);
            setPendingEdit(null);
          }}
          onOverride={() => {
            if (duplicateAction === "create") {
              void createRow(true);
            } else if (pendingEdit) {
              const edit = pendingEdit;
              setDuplicates([]);
              setPendingEdit(null);
              void saveField(edit.id, edit.key, edit.value, true);
            }
          }}
        />
      )}

      {/* New row */}
      {adding && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Creates the source and its first tracked link, exactly as the outreach
            page does. Everything else is editable in the grid afterwards.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {NEW_ROW_KEYS.map((key) => {
              const column = COLUMNS.find((c) => c.key === key);
              if (!column) return null;
              return (
                <div key={key}>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {column.label}
                    {key === "sourceName" && " *"}
                  </label>
                  {column.kind === "select" ? (
                    <select
                      value={newRow[key]}
                      onChange={(e) => {
                        setNewRow({ ...newRow, [key]: e.target.value });
                        setDuplicates([]);
                      }}
                      className={cn(selectClass, "w-full")}
                    >
                      {column.options?.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={newRow[key]}
                      onChange={(e) => {
                        setNewRow({ ...newRow, [key]: e.target.value });
                        setDuplicates([]);
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void createRow()} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create source
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(false);
                setNewRow({ ...BLANK_DRAFT });
                setDuplicates([]);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="border-collapse text-xs" style={{ minWidth: "max-content" }}>
            <colgroup>
              {/* State dot plus two icon buttons. Sized so nothing wraps —
                  a wrapped action cell is the one thing that would make the
                  rows taller. */}
              <col style={{ width: ACTIONS_WIDTH }} />
              {COLUMNS.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  className="sticky left-0 z-30 bg-muted border-b border-r border-border px-2 py-2 text-left font-medium text-muted-foreground"
                  scope="col"
                >
                  <span className="sr-only">Row actions</span>
                </th>
                {COLUMNS.map((column, index) => (
                  <th
                    key={column.key}
                    scope="col"
                    style={index === 0 ? { left: ACTIONS_WIDTH } : undefined}
                    className={cn(
                      "bg-muted border-b border-border px-2 py-2 text-left font-medium whitespace-nowrap",
                      // The name column stays put while the rest scrolls, so a
                      // row 20 columns wide is still identifiable.
                      index === 0 && "sticky z-30 border-r",
                      column.numeric && "text-right"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground"
                    >
                      {column.label}
                      {sortKey === column.key &&
                        (sortDir === "asc" ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        ))}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((source) => {
                const state = rowState[source.id];
                const archived = source.status === "archived";
                // Built by the server from this deployment's origin, so the
                // preview opens the same URL that gets posted.
                const trackedUrl = source.links[0]?.trackedUrl ?? "";
                return (
                  <tr
                    key={source.id}
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/30",
                      archived && "opacity-60"
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-card border-r border-border px-1 py-1">
                      <div className="flex items-center gap-0.5">
                        {state === "saving" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                        ) : state === "saved" ? (
                          <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                        ) : state === "error" ? (
                          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            archived ? void unarchive(source) : void archive(source)
                          }
                          aria-label={
                            archived
                              ? `Restore ${source.sourceName} to its previous status`
                              : `Archive ${source.sourceName} — keeps registrations, links and history`
                          }
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          {archived ? (
                            <ArchiveRestore className="w-3.5 h-3.5" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <RowWaitlistImageButton source={source} onSaved={load} />
                        {trackedUrl ? (
                          // A real link, not a window.open: middle-click and
                          // ctrl-click work, and it opens the actual waitlist
                          // route rather than any spreadsheet-only rendering of
                          // it, so what loads is what a visitor would get.
                          <a
                            href={trackedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Preview waitlist"
                            aria-label={`Preview the waitlist page for ${source.sourceName}`}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span
                            aria-label="No tracked link to preview"
                            className="p-1 text-muted-foreground/30 shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                    {COLUMNS.map((column, index) => (
                      <td
                        key={column.key}
                        style={index === 0 ? { left: ACTIONS_WIDTH } : undefined}
                        className={cn(
                          "border-r border-border/40 p-0 align-middle",
                          index === 0 && "sticky z-10 bg-card border-r-border"
                        )}
                      >
                        {renderCell(source, column)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loaded && visible.length === 0 && (
          <p className="text-sm text-muted-foreground p-6 text-center">
            {sources.length === 0
              ? "No demand sources yet. Add one to generate a tracked waitlist link."
              : statusFilter === "active" && archivedCount > 0
                ? `No sources match those filters. ${archivedCount} archived source${archivedCount === 1 ? " is" : "s are"} hidden — switch the status filter to see ${archivedCount === 1 ? "it" : "them"}.`
                : "No sources match those filters."}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {visible.length} of {sources.length} source
          {sources.length === 1 ? "" : "s"}
          {statusFilter === "active" && archivedCount > 0 && (
            <> · {archivedCount} archived hidden</>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {savingCount > 0 ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving {savingCount} change{savingCount === 1 ? "" : "s"}…
            </>
          ) : Object.values(rowState).includes("error") ? (
            <>
              <X className="w-3 h-3 text-destructive" />
              Some changes did not save
            </>
          ) : Object.keys(rowState).length > 0 ? (
            <>
              <Check className="w-3 h-3 text-primary" />
              All changes saved
            </>
          ) : (
            "Click a cell or press Enter to edit · Tab moves across · arrows move around · hover the image icon to preview"
          )}
        </span>
      </div>

      <Link
        href="/admin/outreach"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to outreach
      </Link>
    </div>
  );
}
