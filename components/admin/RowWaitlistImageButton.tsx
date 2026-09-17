"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useWaitlistLibrary } from "@/hooks/useWaitlistLibrary";
import { cn } from "@/lib/utils";
import { HeroImageEditor } from "@/components/admin/HeroImageEditor";
import { SocialImageOverrides } from "@/components/admin/SocialImageOverrides";
import { WaitlistImagePicker, describeImageChoice } from "@/components/admin/WaitlistImagePicker";
import { heroThumbClass } from "@/components/admin/WaitlistPagePanel";
import { WaitlistWordingEditor } from "@/components/admin/WaitlistWordingEditor";
import {
  sameWording,
  wordingVariantFor,
  type SocialImages,
  type WaitlistWording,
} from "@/lib/waitlist/library";
import {
  demandSourcePresentation,
  effectiveImageChoice,
} from "@/lib/waitlist/presentation";
import type { DemandSourceRow } from "@/lib/waitlist/types";

// ─── The waitlist picture and wording, from a spreadsheet row ────────────────
//
// One icon opening one dialog: the picture (saved the moment it is chosen —
// there is no draft to lose, and the row is one click deep), the family's own
// photograph where the page is a family page, and the wording (saved with a
// button, because it is typed).
//
// What the icon previews is read off the presentation, not off the stored
// fields, so it shows the picture the page actually renders.
//
// Everything larger than the icon is drawn outside the table so the row height
// never moves. The hover overlay shows the picture and nothing else; this view
// carries no tooltips, and the buttons name themselves with aria-label.

/* eslint-disable @next/next/no-img-element */

const PREVIEW_WIDTH = 288;
/** Roughly the 16:9 image plus its caption — used only to keep it on screen. */
const PREVIEW_HEIGHT = 200;
const GAP = 8;

interface Props {
  source: DemandSourceRow;
  /** Reload the grid once something has actually changed. */
  onSaved: () => Promise<void> | void;
}

export function RowWaitlistImageButton({ source, onSaved }: Props) {
  const { user } = useAuth();
  const { library } = useWaitlistLibrary();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);
  const [wording, setWording] = useState<WaitlistWording | null>(source.wording);
  const [templateLabel, setTemplateLabel] = useState<string | null>(
    source.wordingTemplateLabel
  );
  const [savingWording, setSavingWording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The live page, from the code the page itself renders from.
  const presentation = useMemo(
    () => demandSourcePresentation(source, {}, library.defaults),
    [source, library.defaults]
  );
  const hero = presentation.hero;
  const mode = presentation.mode;
  const choice = effectiveImageChoice(source);
  const choiceLabel =
    describeImageChoice(choice, library, source.heroImageUrl)?.label ?? "Default";
  const variant = wordingVariantFor(mode, presentation.connectionType);
  const wordingDirty = !sameWording(wording, source.wording);

  useEffect(() => setMounted(true), []);

  // Opening the dialog starts from what is saved, not a draft abandoned earlier.
  useEffect(() => {
    if (!open) return;
    setWording(source.wording);
    setTemplateLabel(source.wordingTemplateLabel);
  }, [open, source.wording, source.wordingTemplateLabel]);

  // The overlay is anchored to a fixed viewport position, so it has to go once
  // the anchor moves. Scrolling the grid sideways is the common case.
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [preview]);

  function showPreview() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    // To the right of the icon by default, flipping left when that would run
    // off the edge — the actions column is pinned to the left of a grid that
    // scrolls, so "right" is nearly always the side with room.
    let left = rect.right + GAP;
    if (left + PREVIEW_WIDTH > window.innerWidth - GAP) {
      left = Math.max(GAP, rect.left - PREVIEW_WIDTH - GAP);
    }
    const top = Math.min(
      Math.max(GAP, rect.top + rect.height / 2 - PREVIEW_HEIGHT / 2),
      Math.max(GAP, window.innerHeight - PREVIEW_HEIGHT - GAP)
    );
    setPreview({ top, left });
  }

  async function patch(body: Record<string, unknown>) {
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/demand-sources/${source.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save");
  }

  async function chooseImage(next: string) {
    if (next === choice) return;
    setSavingImage(true);
    try {
      await patch({ imageChoice: next });
      toast.success(
        `Picture set to ${describeImageChoice(next, library, source.heroImageUrl)?.label ?? next}`
      );
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingImage(false);
    }
  }

  /** Saves on every choice, like the page's own picture. */
  async function saveSocialImages(next: SocialImages) {
    setSavingSocial(true);
    try {
      await patch({ socialImages: next });
      toast.success("Link preview pictures updated");
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingSocial(false);
    }
  }

  async function saveWording() {
    setSavingWording(true);
    try {
      await patch({ wording, wordingTemplateLabel: templateLabel });
      toast.success(wording ? "Wording saved" : "Now following the default wording");
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingWording(false);
    }
  }

  const summary = `${source.sourceName} — picture: ${choiceLabel}; wording: ${
    source.wording ? "own" : "default"
  }`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setPreview(null);
          setOpen(true);
        }}
        onMouseEnter={showPreview}
        onMouseLeave={() => setPreview(null)}
        onFocus={showPreview}
        onBlur={() => setPreview(null)}
        aria-label={summary}
        className={cn(
          "p-1 rounded hover:bg-muted shrink-0",
          choice === "default" && !source.wording
            ? "text-muted-foreground/50 hover:text-foreground"
            : "text-primary hover:text-primary"
        )}
      >
        <ImageIcon className="w-3.5 h-3.5" />
      </button>

      {mounted &&
        preview &&
        createPortal(
          <div
            style={{
              top: preview.top,
              left: preview.left,
              width: PREVIEW_WIDTH,
            }}
            className="fixed z-[60] pointer-events-none rounded-xl border border-border bg-popover p-2 shadow-lg"
          >
            <img
              src={hero.src}
              alt={hero.alt || `Waitlist image for ${source.sourceName}`}
              className={cn("w-full aspect-[16/9] rounded-lg bg-muted", heroThumbClass(hero))}
            />
            <p className="text-[11px] text-foreground mt-1.5 px-0.5 truncate">
              {presentation.heading}
            </p>
            <p className="text-[11px] text-muted-foreground px-0.5 truncate">
              {choiceLabel} · {source.wording ? "own wording" : "default wording"}
            </p>
          </div>,
          document.body
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Waitlist picture &amp; wording</DialogTitle>
            <DialogDescription>
              {source.sourceName} · {mode} page
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-2">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              Picture
              {savingImage && <Loader2 className="w-3 h-3 animate-spin" />}
            </p>
            <p className="text-xs text-muted-foreground">
              Choosing one saves it straight away. Default follows the image set in
              Waitlist defaults.
            </p>
            <WaitlistImagePicker
              value={choice}
              onChange={(next) => void chooseImage(next)}
              disabled={savingImage}
              ownImageUrl={mode === "family" ? source.heroImageUrl : null}
              suggestedCategory={mode === "family" ? "family" : "all"}
            />
          </section>

          <section className="space-y-2 border-t border-border/60 pt-4">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              Link preview on each network
              {savingSocial && <Loader2 className="w-3 h-3 animate-spin" />}
            </p>
            <SocialImageOverrides
              value={source.socialImages}
              onChange={(next) => void saveSocialImages(next)}
              baseChoice={choice}
              platformId={source.platformId}
              ownImageUrl={mode === "family" ? source.heroImageUrl : null}
              disabled={savingSocial}
            />
          </section>

          {mode === "family" && (
            <HeroImageEditor
              source={source}
              onSaved={async () => {
                await onSaved();
              }}
            />
          )}

          <section className="space-y-2 border-t border-border/60 pt-4">
            <p className="text-xs font-medium text-foreground">Wording</p>
            <WaitlistWordingEditor
              variant={variant}
              scope="source"
              value={wording}
              templateLabel={templateLabel}
              onChange={(next, label) => {
                setWording(next);
                setTemplateLabel(label);
              }}
              disabled={savingWording}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={!wordingDirty || savingWording}
                onClick={() => void saveWording()}
              >
                {savingWording && <Loader2 className="w-4 h-4 animate-spin" />}
                Save wording
              </Button>
              {wordingDirty && (
                <span className="text-xs text-muted-foreground">Unsaved.</span>
              )}
            </div>
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
