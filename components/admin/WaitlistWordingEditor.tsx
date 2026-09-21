"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useWaitlistLibrary } from "@/hooks/useWaitlistLibrary";
import { cn } from "@/lib/utils";
import {
  WORDING_FIELDS,
  WORDING_VARIANTS,
  type WaitlistWording,
  type WordingVariant,
} from "@/lib/waitlist/library";
import { BUILTIN_WORDING, defaultWording } from "@/lib/waitlist/presentation";

// ─── Editing a waitlist page's main wording ──────────────────────────────────
//
// Controlled: the caller holds the draft and decides when it is saved. Used for
// a single source (where null means "follow the default") and for a variant's
// default itself (where null means "the built-in wording").
//
// Choosing a template copies its text into the draft. Nothing links the page
// to the template afterwards, so editing a template later never changes a page
// that already used it.

interface Props {
  variant: WordingVariant;
  /** The draft; null follows the fallback (the default, or the built-in). */
  value: WaitlistWording | null;
  /** Where the draft was copied from, if a template. Display only. */
  templateLabel?: string | null;
  onChange: (wording: WaitlistWording | null, templateLabel: string | null) => void;
  /** "source": null follows the default. "default": null is the built-in. */
  scope: "source" | "default";
  disabled?: boolean;
}

export function WaitlistWordingEditor({
  variant,
  value,
  templateLabel = null,
  onChange,
  scope,
  disabled = false,
}: Props) {
  const { user } = useAuth();
  const { library, reload } = useWaitlistLibrary();
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const variantInfo = WORDING_VARIANTS.find((v) => v.id === variant)!;
  const fallback =
    scope === "source" ? defaultWording(variant, library.defaults) : BUILTIN_WORDING[variant];
  const shown = value ?? fallback;
  const templates = library.templates.filter((t) => t.variant === variant);
  const fields = WORDING_FIELDS.filter((f) => !f.familyOnly || variant === "family");

  const status =
    value === null
      ? scope === "source"
        ? library.defaults.wording[variant]
          ? "Following the default wording (edited)."
          : "Following the default wording."
        : "Using the built-in wording."
      : scope === "source"
        ? `This page has its own wording${templateLabel ? `, started from “${templateLabel}”` : ""}.`
        : "The default has been edited.";

  function startFrom(key: string) {
    if (key === "") return;
    if (key === "__fallback") {
      onChange(null, null);
      return;
    }
    if (key === "__builtin") {
      onChange({ ...BUILTIN_WORDING[variant] }, "Built-in wording");
      return;
    }
    const template = templates.find((t) => t.id === key);
    if (template) onChange({ ...template.wording }, template.label);
  }

  async function saveAsTemplate() {
    if (!user || !templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/waitlist-library/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: templateName.trim(), variant, wording: shown }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save the template");
      toast.success(`Saved “${templateName.trim()}” - it can now be chosen for other pages`);
      setTemplateName("");
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save the template");
    } finally {
      setSavingTemplate(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{status}</p>
        <select
          value=""
          disabled={disabled}
          onChange={(e) => startFrom(e.target.value)}
          className="h-8 px-2 rounded-lg border border-border bg-background text-xs"
          aria-label="Start from"
        >
          <option value="">Start from…</option>
          <option value="__fallback">
            {scope === "source" ? "The default wording" : "The built-in wording"}
          </option>
          {scope === "source" && library.defaults.wording[variant] && (
            <option value="__builtin">The built-in wording</option>
          )}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              Template: {t.label}
            </option>
          ))}
        </select>
      </div>

      {variantInfo.placeholders.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground">{variantInfo.placeholders.join(" ")}</span>{" "}
          {variant === "family"
            ? "is replaced with the family name."
            : variant === "community_known"
              ? "is replaced with the group's name (the source's topic)."
              : "is replaced with the source's topic, so one wording works for many sources."}
        </p>
      )}

      {fields.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium text-foreground mb-1">
            {field.label}
          </label>
          {field.rows === 1 ? (
            <input
              value={shown[field.key]}
              maxLength={field.max}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...shown, [field.key]: e.target.value }, value ? templateLabel : null)
              }
              className={cn(inputClass, "h-9 py-0")}
            />
          ) : (
            <textarea
              value={shown[field.key]}
              maxLength={field.max}
              rows={field.rows}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...shown, [field.key]: e.target.value }, value ? templateLabel : null)
              }
              className={cn(inputClass, "leading-relaxed")}
            />
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="Template name, e.g. Tennis clubs"
          className="h-8 px-2.5 rounded-lg border border-border bg-background text-sm flex-1 min-w-40"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!templateName.trim() || savingTemplate}
          onClick={() => void saveAsTemplate()}
        >
          {savingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save as template
        </Button>
      </div>
    </div>
  );
}
