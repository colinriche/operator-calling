"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WaitlistImagePicker, describeImageChoice } from "@/components/admin/WaitlistImagePicker";
import { WaitlistWordingEditor } from "@/components/admin/WaitlistWordingEditor";
import { useAuth } from "@/hooks/useAuth";
import { useWaitlistLibrary } from "@/hooks/useWaitlistLibrary";
import { cn } from "@/lib/utils";
import { FALLBACK_DEFAULT_IMAGE_CHOICE } from "@/lib/waitlist/builtin-images";
import {
  LIBRARY_IMAGE_CATEGORIES,
  WORDING_VARIANTS,
  sameWording,
  type WaitlistWording,
  type WordingVariant,
} from "@/lib/waitlist/library";

// ─── Defaults and the library ────────────────────────────────────────────────
//
// What every waitlist page shows until someone chooses otherwise, and the
// housekeeping for what can be chosen. On both the outreach page and the
// spreadsheet, collapsed, because it is visited rarely and each page's own
// editor is where most choosing happens.

/* eslint-disable @next/next/no-img-element */

export function WaitlistDefaultsPanel() {
  const { user } = useAuth();
  const { library, loaded, reload } = useWaitlistLibrary();
  const [open, setOpen] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [variant, setVariant] = useState<WordingVariant>("global");
  // Drafts per variant; undefined means "not edited here yet — show what is stored".
  const [drafts, setDrafts] = useState<Partial<Record<WordingVariant, WaitlistWording | null>>>({});
  const [savingWording, setSavingWording] = useState(false);

  async function authed(url: string, init: RequestInit) {
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function chooseDefaultImage(choice: string) {
    setSavingImage(true);
    try {
      await authed("/api/admin/waitlist-library/defaults", {
        method: "PATCH",
        body: JSON.stringify({ imageChoice: choice }),
      });
      await reload();
      toast.success("Default image changed — live on every page without its own picture");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingImage(false);
    }
  }

  const stored = library.defaults.wording[variant] ?? null;
  const draft = drafts[variant] === undefined ? stored : drafts[variant]!;
  const wordingDirty = !sameWording(draft, stored);

  async function saveWording() {
    setSavingWording(true);
    try {
      await authed("/api/admin/waitlist-library/defaults", {
        method: "PATCH",
        body: JSON.stringify({ variant, wording: draft }),
      });
      await reload();
      setDrafts((d) => ({ ...d, [variant]: undefined }));
      toast.success(
        draft === null
          ? "Back to the built-in wording"
          : "Default wording saved — live on every page without its own wording"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingWording(false);
    }
  }

  async function updateImage(id: string, patch: Record<string, unknown>) {
    try {
      await authed(`/api/admin/waitlist-library/images/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function deleteTemplate(id: string, label: string) {
    try {
      await authed(`/api/admin/waitlist-library/templates/${id}`, { method: "DELETE" });
      await reload();
      toast.success(`Deleted “${label}”. Pages that used it keep their wording.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const currentDefault = describeImageChoice(
    library.defaults.imageChoice || FALLBACK_DEFAULT_IMAGE_CHOICE,
    library
  );
  const sectionTitle = "text-sm font-medium text-foreground mb-1";
  const fieldClass =
    "h-8 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          {currentDefault && (
            <img
              src={currentDefault.src}
              alt=""
              className="w-14 h-10 rounded-md border border-border/60 object-contain bg-muted"
            />
          )}
          <span>
            <span className="block font-heading font-semibold text-foreground">
              Waitlist defaults &amp; library
            </span>
            <span className="block text-xs text-muted-foreground">
              The default image and wording, uploaded images and saved wording templates.
            </span>
          </span>
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border/60 px-5 py-5 space-y-8">
          {!loaded && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </p>
          )}

          <section>
            <p className={sectionTitle}>Default image</p>
            <p className="text-xs text-muted-foreground mb-3">
              Shown on the global waitlist page, its link preview, and every page
              whose picture is set to Default. Choosing one saves it straight away.
            </p>
            <WaitlistImagePicker
              value={library.defaults.imageChoice || FALLBACK_DEFAULT_IMAGE_CHOICE}
              onChange={(choice) => void chooseDefaultImage(choice)}
              allowDefault={false}
              disabled={savingImage}
            />
          </section>

          <section>
            <p className={sectionTitle}>Default wording</p>
            <p className="text-xs text-muted-foreground mb-3">
              Used by every page of this kind that has no wording of its own.
              Pages that were given their own wording keep it.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {WORDING_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariant(v.id)}
                  title={v.hint}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    variant === v.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {v.label}
                  {library.defaults.wording[v.id] ? " · edited" : ""}
                </button>
              ))}
            </div>
            <WaitlistWordingEditor
              key={variant}
              variant={variant}
              scope="default"
              value={draft}
              onChange={(wording) => setDrafts((d) => ({ ...d, [variant]: wording }))}
              disabled={savingWording}
            />
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button size="sm" disabled={!wordingDirty || savingWording} onClick={() => void saveWording()}>
                {savingWording && <Loader2 className="w-4 h-4 animate-spin" />}
                Save default wording
              </Button>
              {stored && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingWording}
                  onClick={() => setDrafts((d) => ({ ...d, [variant]: null }))}
                >
                  Reset to built-in
                </Button>
              )}
              {wordingDirty && (
                <span className="text-xs text-muted-foreground">Unsaved.</span>
              )}
            </div>
          </section>

          <section>
            <p className={sectionTitle}>Uploaded images</p>
            <p className="text-xs text-muted-foreground mb-3">
              Rename or recategorise freely. Archiving hides an image from the
              picker; pages already using it keep showing it.
            </p>
            {library.images.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing uploaded yet — use Upload new in any image picker.
              </p>
            ) : (
              <ul className="space-y-2">
                {library.images.map((image) => (
                  <li
                    key={image.id}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2",
                      image.archived && "opacity-60"
                    )}
                  >
                    <img src={image.url} alt="" className="w-16 h-12 rounded-md object-cover bg-muted" />
                    <input
                      defaultValue={image.label}
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label && label !== image.label) void updateImage(image.id, { label });
                      }}
                      className={cn(fieldClass, "flex-1 min-w-40 text-sm")}
                      aria-label="Image name"
                    />
                    <select
                      value={image.category}
                      onChange={(e) => void updateImage(image.id, { category: e.target.value })}
                      className={fieldClass}
                      aria-label="Category"
                    >
                      {LIBRARY_IMAGE_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void updateImage(image.id, { archived: !image.archived })}
                    >
                      {image.archived ? (
                        <ArchiveRestore className="w-3.5 h-3.5" />
                      ) : (
                        <Archive className="w-3.5 h-3.5" />
                      )}
                      {image.archived ? "Restore" : "Archive"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className={sectionTitle}>Wording templates</p>
            <p className="text-xs text-muted-foreground mb-3">
              Saved from any wording editor with Save as template. Deleting one
              does not change pages that started from it — they hold their own copy.
            </p>
            {library.templates.length === 0 ? (
              <p className="text-xs text-muted-foreground">No templates saved yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {library.templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <span className="text-sm text-foreground min-w-0">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {" · "}
                        {WORDING_VARIANTS.find((v) => v.id === t.variant)?.label}
                        {" · "}
                        {t.wording.heading}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void deleteTemplate(t.id, t.label)}
                      aria-label={`Delete ${t.label}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
