"use client";

import Link from "next/link";
import {
  Fragment,
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
  ChevronDown,
  ChevronRight,
  Copy,
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
import { useAdminRole } from "@/hooks/useAdminRole";
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
import {
  applySourceUrlInference,
  inferSourceFromUrl,
  type SourceUrlInferenceKey,
} from "@/lib/waitlist/parse-source-url";
import type { DemandSourceRow, SimilarSourceRow } from "@/lib/waitlist/types";

// ─── Demand sources, as a spreadsheet ────────────────────────────────────────
//
// The same records the outreach panel manages one card at a time, in a grid
// built for changing forty of them in an afternoon. Same collection, same API
// routes, same validation - this is a second view of the data, not a second
// copy of it, and every edit is a PATCH to the record itself.
//
// There is no importer, deliberately. A spreadsheet round-trip cannot tell a
// renamed source from a new one, and guessing wrong would split registrations
// across two records. Editing the real records directly makes the question
// impossible to ask.
//
// Archiving is the ordinary removal, and it keeps all of that: a source is
// pointed at by tracked links people have already posted, by registrations,
// visits and outreach history. Archived sources collapse into one line at the
// foot of the grid rather than taking a row each.
//
// Permanent deletion lives on that line and on the rows under it, for a super
// admin, and takes the registrations and the history with it. It is a second
// decision after archiving rather than a shortcut past it - see the DELETE
// route in app/api/admin/demand-sources/[id]/route.ts.

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
  /**
   * The cell opens a panel under the row instead of an editor. A source can
   * carry any number of tracked links and the row has one line for them, so
   * the extras have to live somewhere that is not the cell itself.
   */
  expands?: boolean;
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
 * Everything an admin sets is editable; everything the system counts is not -
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
    key: "publicEyebrow",
    label: "Eyebrow line",
    width: 200,
    kind: "text",
    text: (s) => s.publicEyebrow,
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
    // Sorts by how many links a source has, which is the question this column
    // answers at a glance - sorting 22 sources by code text answers nothing.
    key: "sourceCodes",
    label: "Links",
    width: 140,
    kind: "readonly",
    expands: true,
    text: (s) => s.links.map((l) => l.sourceCode).join(" "),
    sortBy: (s) => s.links.length,
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
 * Holds the state dot and up to four icon buttons on one line - an archived
 * row carries a delete beside its restore. It is sized to stop them wrapping,
 * because a wrapped action cell is the one thing that would make the rows
 * taller.
 */
const ACTIONS_WIDTH = 132;

type RowState = "saving" | "saved" | "error";
type StatusFilter = "active" | "archived" | "all" | string;

interface PendingEdit {
  id: string;
  key: string;
  value: unknown;
}

export function DemandSourceSpreadsheet() {
  const { user } = useAuth();
  // Governs what the grid offers, not what it is allowed to do: the delete
  // route re-checks the role. An admin who is not a super admin sees the
  // archived line and the rows, without the destructive buttons.
  const { isSuperAdmin } = useAdminRole();
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
  const [lockedNewFields, setLockedNewFields] = useState<Set<SourceUrlInferenceKey>>(
    () => new Set()
  );
  const [creating, setCreating] = useState(false);

  // Refused as a duplicate. `pendingEdit` is the change that was refused, kept
  // so "save anyway" can replay exactly it rather than reconstructing it.
  const [duplicates, setDuplicates] = useState<SimilarSourceRow[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<"create" | "save">("create");
  // Whether what is shown is a refusal to be overridden or a notice about a
  // write that already happened. Only a matching URL produces the first.
  const [duplicateNotice, setDuplicateNotice] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);

  const cellRefs = useRef<Record<string, HTMLElement | null>>({});
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  // Which rows have their tracked links listed. Per row rather than one open at
  // a time: comparing two sources' links is exactly why anyone opens them.
  const [openLinks, setOpenLinks] = useState<Record<string, boolean>>({});

  // Archived sources are one line until asked for. Closed on every load: the
  // point of the line is that a tidied source stops taking up the grid.
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  // Picking "Archived only" is asking to look at them, so the line opens
  // itself. Without this the filter would answer with a single collapsed row.
  useEffect(() => {
    if (statusFilter === "archived") setArchivedOpen(true);
  }, [statusFilter]);

  // Focus moves after a commit, once the editor has unmounted and the display
  // cell it hands off to is back in the DOM.
  useEffect(() => {
    if (!pendingFocus) return;
    cellRefs.current[pendingFocus]?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  // ─── Filtering and sorting ────────────────────────────────────────────────

  /**
   * The two lists the grid renders: live sources as rows, archived ones behind
   * the single line at the foot.
   *
   * Archived sources are split out here rather than filtered away, because
   * "collapsed" is not "hidden": the line is present on the active view too,
   * so a source that was tidied away can still be found, restored or deleted
   * without first working out which filter puts it back.
   *
   * They are left out entirely when the status filter names a particular
   * status. Asking for "Researching" is asking for one status, not for that
   * status plus the archive.
   */
  const { activeRows, archivedRows } = useMemo(() => {
    const q = query.trim().toLowerCase();

    // Everything except the status, which the two lists answer differently.
    const matches = (s: DemandSourceRow) => {
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
    };

    const column = COLUMNS.find((c) => c.key === sortKey);
    const value = (s: DemandSourceRow) =>
      column?.sortBy ? column.sortBy(s) : (column?.text(s) ?? "");
    const sort = (list: DemandSourceRow[]) =>
      [...list].sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });

    const showsArchive =
      statusFilter === "active" || statusFilter === "all" || statusFilter === "archived";

    return {
      activeRows:
        statusFilter === "archived"
          ? []
          : sort(
              sources.filter((s) => {
                if (s.status === "archived") return false;
                if (statusFilter !== "active" && statusFilter !== "all") {
                  if (s.status !== statusFilter) return false;
                }
                return matches(s);
              })
            ),
      archivedRows: showsArchive
        ? sort(sources.filter((s) => s.status === "archived" && matches(s)))
        : [],
    };
  }, [sources, query, platformFilter, statusFilter, sortKey, sortDir]);

  /** Everything on screen, in the order it appears. */
  const visible = useMemo(
    () => [...activeRows, ...archivedRows],
    [activeRows, archivedRows]
  );

  const archivedCount = sources.filter((s) => s.status === "archived").length;
  const savingCount = Object.values(rowState).filter((v) => v === "saving").length;

  const archivedTotals = archivedRows.reduce(
    (acc, s) => ({
      registrations: acc.registrations + s.uniqueRegistrationCount,
      links: acc.links + s.links.length,
    }),
    { registrations: 0, links: 0 }
  );

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
    ): Promise<{
      ok: boolean;
      duplicates?: SimilarSourceRow[];
      similar?: SimilarSourceRow[];
      error?: string;
    }> => {
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
      return { ok: true, similar: data.similar ?? [] };
    },
    [user]
  );

  /**
   * Write one field.
   *
   * Applied to the local row first so the grid never stalls mid-edit, and
   * rolled back on failure - an optimistic update that quietly survives a
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
        setDuplicateNotice(false);
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
      // Saved, and it resembles something. Shown rather than enforced - see
      // blockingDuplicates in lib/waitlist/duplicate-sources.ts.
      if (result.similar?.length) {
        setDuplicateAction("save");
        setDuplicateNotice(true);
        setDuplicates(result.similar);
      }
      // Server-side effects - statusBeforeArchive, threshold re-evaluation -
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

  function lockNewField(key: SourceUrlInferenceKey) {
    setLockedNewFields((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function updateNewRowField(key: string, value: string) {
    if (key === "sourceName" || key === "platformId" || key === "sourceType") {
      lockNewField(key);
    }
    if (key === "sourceUrl") {
      setNewRow((prev) =>
        applySourceUrlInference(
          { ...prev, sourceUrl: value },
          inferSourceFromUrl(value),
          lockedNewFields
        )
      );
      setDuplicates([]);
      return;
    }
    setNewRow((prev) => ({ ...prev, [key]: value }));
    setDuplicates([]);
  }

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
        setDuplicateNotice(false);
        setDuplicates(data.similar ?? []);
        toast.error(data.error ?? "This may already be tracked");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to create source");

      setDuplicateAction("create");
      setDuplicateNotice(true);
      setDuplicates(data.similar ?? []);
      setNewRow({ ...BLANK_DRAFT });
      setLockedNewFields(new Set());
      setAdding(false);
      toast.success(`Created - tracked link ${data.sourceCode}`);
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
        "Its tracked links keep working - they show the generic waitlist page " +
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

  // ─── Permanent deletion ───────────────────────────────────────────────────
  //
  // Only archived sources, only a super admin, and the name has to be typed.
  // The route enforces all three - this is the part a person sees.

  /** Everything this source would take with it, as a sentence. */
  function deletionSummary(source: DemandSourceRow): string {
    const parts = [
      `${source.uniqueRegistrationCount} registration${source.uniqueRegistrationCount === 1 ? "" : "s"}`,
      `${source.links.length} tracked link${source.links.length === 1 ? "" : "s"}`,
      `${source.uniqueVisitCount} unique visit${source.uniqueVisitCount === 1 ? "" : "s"}`,
      `${source.outreachCount} outreach record${source.outreachCount === 1 ? "" : "s"}`,
    ];
    return parts.join(", ");
  }

  /** The request itself. The caller decides how the human confirmed it. */
  async function deleteSource(
    source: DemandSourceRow
  ): Promise<{ ok: boolean; error?: string }> {
    if (!user) return { ok: false, error: "Not signed in" };
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/demand-sources/${source.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      // The source's own name, which the route checks against the record. It
      // is what the admin typed for a single delete; for "delete all" the
      // confirmation is the one on the whole set, not one prompt per row.
      body: JSON.stringify({ confirmName: source.sourceName }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "Failed to delete" };
  }

  async function removeForGood(source: DemandSourceRow) {
    // A source that became a group is the record of how that group came to
    // exist. The group and its members are untouched by this, which is exactly
    // why it is worth saying out loud before the record of it goes.
    const groupNote = source.groupId
      ? "This source already created a group. The group and its members stay; " +
        "the record of who signed up and where they came from does not.\n\n"
      : "";

    const typed = window.prompt(
      `Permanently delete "${source.sourceName}"?\n\n` +
        `This destroys ${deletionSummary(source)}, its share events, its link ` +
        "preview cards and any uploaded photograph. Its tracked links stop " +
        "resolving to anything. There is no undo and nothing is archived.\n\n" +
        groupNote +
        "Type the source's name to confirm:"
    );
    if (typed === null) return;
    if (typed.trim() !== source.sourceName.trim()) {
      toast.error("That did not match the source's name - nothing was deleted");
      return;
    }

    setDeleting(source.id);
    const result = await deleteSource(source);
    setDeleting(null);
    if (!result.ok) {
      toast.error(result.error ?? "Failed to delete");
      return;
    }
    toast.success(`${source.sourceName} deleted for good`);
    await load();
  }

  async function removeAllArchived() {
    const count = archivedRows.length;
    if (count === 0) return;

    const typed = window.prompt(
      `Permanently delete all ${count} archived source${count === 1 ? "" : "s"}?\n\n` +
        `This destroys ${archivedTotals.registrations} registration` +
        `${archivedTotals.registrations === 1 ? "" : "s"}, ${archivedTotals.links} tracked ` +
        `link${archivedTotals.links === 1 ? "" : "s"} and all of their visits, share events, ` +
        "outreach history, preview cards and uploaded photographs. There is no undo.\n\n" +
        "Type DELETE to confirm:"
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== "DELETE") {
      toast.error("Not confirmed - nothing was deleted");
      return;
    }

    // One at a time, and it stops at the first failure. A partial sweep whose
    // survivors are listed is recoverable; one that carried on past an error
    // nobody saw is not.
    let done = 0;
    for (const source of archivedRows) {
      setDeleting(source.id);
      const result = await deleteSource(source);
      if (!result.ok) {
        setDeleting(null);
        await load();
        toast.error(
          `Stopped at "${source.sourceName}": ${result.error ?? "failed to delete"}` +
            (done > 0 ? ` (${done} already deleted)` : "")
        );
        return;
      }
      done += 1;
    }
    setDeleting(null);
    await load();
    toast.success(`${done} archived source${done === 1 ? "" : "s"} deleted for good`);
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  function exportCsv() {
    if (visible.length === 0) {
      toast.error("Nothing to export - clear the filters or add a source");
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

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy - check clipboard permissions");
    }
  }

  /**
   * The Links cell: the first code, how many more there are, and a toggle for
   * the panel that lists them. It stays one line whatever the count, because a
   * cell that grows with the number of links makes the whole row taller.
   */
  function renderLinksCell(source: DemandSourceRow) {
    const count = source.links.length;
    if (count === 0) {
      return (
        <span className={cn(cellClass, "text-muted-foreground/50")}>no links</span>
      );
    }

    const open = openLinks[source.id] === true;
    const extra = count - 1;
    return (
      <button
        type="button"
        onClick={() =>
          setOpenLinks((prev) => ({ ...prev, [source.id]: !open }))
        }
        aria-expanded={open}
        aria-controls={`links-${source.id}`}
        aria-label={
          count === 1
            ? `Show the tracked link for ${source.sourceName}`
            : `Show all ${count} tracked links for ${source.sourceName}`
        }
        // Not cellClass: that lays a cell out as a block, and this one has to
        // keep a chevron, a code and a count on one line.
        className="flex w-full h-full items-center gap-1 px-2 py-1.5 rounded-sm text-xs text-left text-muted-foreground hover:bg-muted/60 outline-none focus:ring-2 focus:ring-inset focus:ring-primary/60"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        <code className="font-mono truncate min-w-0">
          {source.links[0].sourceCode}
        </code>
        {extra > 0 && <span className="shrink-0 tabular-nums">+{extra}</span>}
      </button>
    );
  }

  function renderCell(source: DemandSourceRow, column: Column) {
    const text = column.text(source);

    if (column.expands) return renderLinksCell(source);

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
              - not set -
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
        {text || "-"}
      </div>
    );
  }

  /**
   * One source's row, and the tracked-link panel under it when open.
   *
   * A function rather than the map's body: the same row is rendered in two
   * places now - above the archived line, and under it once it is opened -
   * and two copies of it would drift.
   */
  function renderRow(source: DemandSourceRow) {
    const state = rowState[source.id];
    const archived = source.status === "archived";
    // Built by the server from this deployment's origin, so the
    // preview opens the same URL that gets posted. This one is the
    // first link; every other link has its own preview in the panel.
    const trackedUrl = source.links[0]?.trackedUrl ?? "";
    return (
      <Fragment key={source.id}>
        <tr
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
                    : `Archive ${source.sourceName} - keeps registrations, links and history`
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
              {/* Only on an archived row, and only for a super admin - the
                  same two conditions the route enforces. Destructive colour
                  because the identical icon one button to the left means
                  "archive", which keeps everything. */}
              {archived && isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => void removeForGood(source)}
                  disabled={deleting !== null}
                  title="Delete for good"
                  aria-label={`Permanently delete ${source.sourceName} and everything kept with it`}
                  className="p-1 rounded text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 shrink-0"
                >
                  {deleting === source.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
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
        {openLinks[source.id] === true && source.links.length > 0 && (
          <tr className="border-b border-border/50 bg-muted/20">
            {/* Spans the grid, and its contents are pinned to the
                left edge: a panel that scrolled away with column 20
                would be unreadable on a table this wide. */}
            <td colSpan={COLUMNS.length + 1} className="p-0">
              <div
                id={`links-${source.id}`}
                className="sticky left-0 w-[760px] max-w-full px-3 py-2 space-y-1"
              >
                {source.links.map((link) => (
                  <div
                    key={link.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-background px-2 py-1.5"
                  >
                    <code className="font-mono text-xs text-foreground">
                      {link.sourceCode}
                    </code>
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {link.label || "Untitled link"}
                    </span>
                    {link.status !== "active" && (
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground border border-border/60 rounded px-1">
                        {link.status}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                      {link.uniqueVisitCount} unique · {link.signupCount}{" "}
                      joined · {link.shareClickCount} shares
                    </span>
                    <button
                      type="button"
                      onClick={() => void copy(link.trackedUrl, "Link copied")}
                      aria-label={`Copy the tracked link ${link.sourceCode}`}
                      title="Copy link"
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={link.trackedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Preview the waitlist page for ${link.sourceCode}`}
                      title="Preview waitlist"
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
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
          <option value="active">Active (archive collapsed)</option>
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
            setDuplicateNotice(false);
            setPendingEdit(null);
          }}
          onOverride={
            // A notice reports a write that already happened, so there is
            // nothing to override and no button for it.
            duplicateNotice
              ? undefined
              : () => {
                  if (duplicateAction === "create") {
                    void createRow(true);
                  } else if (pendingEdit) {
                    const edit = pendingEdit;
                    setDuplicates([]);
                    setPendingEdit(null);
                    void saveField(edit.id, edit.key, edit.value, true);
                  }
                }
          }
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
                      onChange={(e) => updateNewRowField(key, e.target.value)}
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
                      onChange={(e) => updateNewRowField(key, e.target.value)}
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
                setLockedNewFields(new Set());
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
              {/* State dot plus two icon buttons. Sized so nothing wraps -
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
              {activeRows.map(renderRow)}

              {/* Everything archived, as one line. It sits at the foot whatever
                  the sort is: these are records kept for their history, and
                  interleaving them with live sources is what made the grid
                  half history in the first place. */}
              {archivedRows.length > 0 && (
                <Fragment>
                  <tr className="border-b border-border/50 bg-muted/20">
                    <td colSpan={COLUMNS.length + 1} className="p-0">
                      {/* Pinned to the left edge, like the links panel: a
                          summary that scrolled away with column 20 would never
                          be read. */}
                      <div className="sticky left-0 w-[860px] max-w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => setArchivedOpen((v) => !v)}
                          aria-expanded={archivedOpen}
                          className="flex items-center gap-1.5 text-xs font-medium text-foreground rounded px-1 py-0.5 hover:bg-muted"
                        >
                          {archivedOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          {archivedRows.length} archived source
                          {archivedRows.length === 1 ? "" : "s"}
                        </button>

                        <span className="text-xs text-muted-foreground tabular-nums">
                          still holding {archivedTotals.registrations} registration
                          {archivedTotals.registrations === 1 ? "" : "s"} and{" "}
                          {archivedTotals.links} tracked link
                          {archivedTotals.links === 1 ? "" : "s"}
                        </span>

                        {isSuperAdmin ? (
                          <button
                            type="button"
                            onClick={() => void removeAllArchived()}
                            disabled={deleting !== null}
                            aria-label={`Permanently delete all ${archivedRows.length} archived sources and everything kept with them`}
                            className="ml-auto flex items-center gap-1 text-xs text-destructive rounded px-1.5 py-0.5 hover:bg-destructive/10 disabled:opacity-50"
                          >
                            {deleting !== null ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Delete all for good
                          </button>
                        ) : (
                          <span className="ml-auto text-xs text-muted-foreground/70">
                            Deleting for good needs a super admin
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {archivedOpen && archivedRows.map(renderRow)}
                </Fragment>
              )}
            </tbody>
          </table>
        </div>

        {loaded && visible.length === 0 && (
          <p className="text-sm text-muted-foreground p-6 text-center">
            {sources.length === 0
              ? "No demand sources yet. Add one to generate a tracked waitlist link."
              : "No sources match those filters."}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {visible.length} of {sources.length} source
          {sources.length === 1 ? "" : "s"}
          {archivedRows.length > 0 && (
            <> · {archivedRows.length} of them archived</>
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
