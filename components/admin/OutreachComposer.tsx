"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  OUTREACH_TEMPLATES,
  OUTREACH_TYPES,
  composeWithLink,
  findDiscouragedPhrases,
  type OutreachType,
} from "@/lib/waitlist/outreach";

// ─── Preparing and recording outreach ────────────────────────────────────────
//
// Two jobs: write the thing, and remember that it happened.
//
// The second matters more. Knowing this thread already had a link stops
// outreach turning into spam — and nobody remembers across weeks and dozens of
// subreddits, which is exactly the sort of thing a record is for.
//
// There is no generator yet. The textarea starts from a hand-written template
// and is edited by hand. When a generator arrives it fills the same field, and
// nothing here changes shape.

interface OutreachRecord {
  id: string;
  demandSourceId: string;
  type: string;
  destinationUrl: string;
  destinationTitle: string;
  generatedText: string;
  editedFinalText: string;
  notes: string;
  status: string;
  postedAt: string | null;
  copiedAt: string | null;
  createdAt: string | null;
}

interface PriorUse {
  id: string;
  demandSourceId: string;
  type: string;
  status: string;
  postedAt: string | null;
  createdAt: string | null;
}

interface OutreachComposerProps {
  sourceId: string;
  sourceName: string;
  /** Blocks composing entirely. */
  doNotContact: boolean;
  postingRules: string;
  trackedUrl: string;
  sourceCode: string | null;
  lastPostedAt: string | null;
}

const RECENT_DAYS = 14;

export function OutreachComposer({
  sourceId,
  sourceName,
  doNotContact,
  postingRules,
  trackedUrl,
  sourceCode,
  lastPostedAt,
}: OutreachComposerProps) {
  const { user } = useAuth();
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [type, setType] = useState<OutreachType>("public_comment");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [destinationTitle, setDestinationTitle] = useState("");
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [priorUses, setPriorUses] = useState<PriorUse[]>([]);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/outreach?demandSourceId=${encodeURIComponent(sourceId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load history");
      setRecords(data.records ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Check the destination as it is typed, not on submit — a warning is only
  // useful before the effort of writing something.
  useEffect(() => {
    if (!user || !destinationUrl.trim()) {
      setPriorUses([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setChecking(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/admin/outreach?destination=${encodeURIComponent(destinationUrl)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!cancelled) setPriorUses(data.priorUses ?? []);
      } catch {
        /* advisory only */
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destinationUrl, user]);

  async function save(status?: string) {
    if (!user) return;
    if (!text.trim()) {
      toast.error("Write something first");
      return;
    }
    setBusy("save");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          demandSourceId: sourceId,
          type,
          destinationUrl,
          destinationTitle,
          templateId: templateId || null,
          generatedText: OUTREACH_TEMPLATES.find((t) => t.id === templateId)?.text ?? "",
          editedFinalText: text,
          sourceCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      if (status) await patch(data.id, { status });
      toast.success("Saved to outreach history");
      setText("");
      setDestinationUrl("");
      setDestinationTitle("");
      setTemplateId("");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/outreach", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, ...body }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to update");
    }
  }

  async function copyWithLink() {
    // composeWithLink refuses to append a URL the writer already pasted.
    const composed = composeWithLink(text, trackedUrl);
    try {
      await navigator.clipboard.writeText(composed);
      toast.success("Comment and link copied");
      // Copied is not posted. Only a person can say it went anywhere.
      await save("copied");
    } catch {
      toast.error("Could not copy — check clipboard permissions");
    }
  }

  async function markPosted(id: string) {
    setBusy(id);
    try {
      await patch(id, { status: "posted" });
      toast.success("Marked as posted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const discouraged = findDiscouragedPhrases(text);
  const postedRecently =
    lastPostedAt &&
    Date.now() - new Date(lastPostedAt).getTime() < RECENT_DAYS * 86400000;

  if (doNotContact) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm text-foreground font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          {sourceName} is marked do-not-contact
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          No outreach can be prepared for it. Change the source status first if
          that is wrong.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="space-y-4">
      {/* Warnings before writing, not after. */}
      {postingRules && (
        <p className="text-xs rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-foreground">
          <strong>Posting rules:</strong> {postingRules}
        </p>
      )}
      {postedRecently && (
        <p className="text-xs rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-foreground flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          Something was posted for this source in the last {RECENT_DAYS} days.
          Posting again this soon tends to read as spam.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OutreachType)}
            className={inputClass}
          >
            {OUTREACH_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Starting copy
          </label>
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              const tpl = OUTREACH_TEMPLATES.find((t) => t.id === e.target.value);
              if (tpl) setText(tpl.text);
            }}
            className={inputClass}
          >
            <option value="">Start from blank…</option>
            {OUTREACH_TEMPLATES.filter(
              (t) => t.suits.includes(type) || templateId === t.id
            ).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Destination URL
          </label>
          <input
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            placeholder="https://… the exact thread, post or profile"
            className={inputClass}
          />
          {checking && (
            <p className="text-xs text-muted-foreground mt-1">Checking…</p>
          )}
          {priorUses.length > 0 && (
            <p className="text-xs rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 mt-2 text-foreground flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <span>
                This destination has had {priorUses.length} previous outreach
                record{priorUses.length !== 1 ? "s" : ""}
                {priorUses.some((p) => p.status === "posted") && ", one of them posted"}
                . Check the history below before posting again.
              </span>
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Destination title{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            value={destinationTitle}
            onChange={(e) => setDestinationTitle(e.target.value)}
            placeholder="e.g. Weekly chat thread, 9 Aug"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          Comment or message
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Reply to the discussion first. Mention Operator only where it is genuinely relevant."
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {discouraged.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            Reads as marketing: &ldquo;{discouraged.join("&rdquo;, &ldquo;")}&rdquo;
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1.5">
          The tracked link is appended on copy, and never twice if you have
          already pasted it.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copyWithLink()} disabled={busy !== null}>
          <Copy className="w-3.5 h-3.5" />
          Copy comment and link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void save()}
          disabled={busy !== null}
        >
          {busy === "save" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save draft
        </Button>
      </div>

      {/* History */}
      <div className="border-t border-border/60 pt-3 space-y-2">
        <p className="text-xs font-medium text-foreground">
          Outreach history {loading && "· loading…"}
        </p>
        {records.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground">
            Nothing prepared for this source yet.
          </p>
        )}
        {records.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-border/60 bg-background px-3 py-2.5 space-y-1.5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full border capitalize",
                  r.status === "posted"
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-muted/60 text-muted-foreground"
                )}
              >
                {r.status}
              </span>
              <span className="text-muted-foreground">
                {OUTREACH_TYPES.find((t) => t.id === r.type)?.label ?? r.type}
              </span>
              {r.destinationTitle && (
                <span className="text-foreground">{r.destinationTitle}</span>
              )}
              {r.postedAt && (
                <span className="text-muted-foreground">
                  posted {new Date(r.postedAt).toLocaleDateString()}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1">
                {r.destinationUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      window.open(r.destinationUrl, "_blank", "noopener")
                    }
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                )}
                {r.status !== "posted" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === r.id}
                    onClick={() => void markPosted(r.id)}
                  >
                    {busy === r.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Mark posted
                  </Button>
                )}
                {r.status === "posted" && (
                  <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">
              {r.editedFinalText || r.generatedText}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
