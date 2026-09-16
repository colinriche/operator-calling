"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { HeroImageEditor } from "@/components/admin/HeroImageEditor";
import { TopicArtPicker } from "@/components/admin/TopicArtPicker";
import { demandSourcePresentation } from "@/lib/waitlist/presentation";
import { topicArtLabel } from "@/lib/waitlist/topic-art";
import type { DemandSourceRow } from "@/lib/waitlist/types";

// ─── The waitlist image, from a spreadsheet row ──────────────────────────────
//
// One icon, not two, because a source never has two images to manage. Which
// asset its page shows is decided by heroFor in presentation.ts, and the three
// answers are mutually exclusive:
//
//   family mode + an uploaded image   → the photograph      (HeroImageEditor)
//   community mode + a chosen artwork → the curated SVG     (TopicArtPicker)
//   anything else                     → the brand mark      (nothing to edit)
//
// The kind is read off that presentation rather than off waitlistMode here.
// A community source that once had a photograph still carries heroImageUrl,
// and its page deliberately does not show it — an icon that decided for itself
// would offer to edit a picture nobody can see.
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
  /** Reload the grid once the image has actually changed. */
  onSaved: () => Promise<void> | void;
}

export function RowWaitlistImageButton({ source, onSaved }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);
  const [savingArt, setSavingArt] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The live page, from the code the page itself renders from.
  const presentation = useMemo(() => demandSourcePresentation(source), [source]);
  const hero = presentation.hero;

  const mode = presentation.mode;
  /** Which editor this source's page makes meaningful. */
  const editor: "upload" | "art" | "none" =
    mode === "family" ? "upload" : mode === "community" ? "art" : "none";
  const hasImage = hero.kind !== "brand";

  useEffect(() => setMounted(true), []);

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
    if (!hasImage) return;
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

  /**
   * Artwork saves on selection — there is no draft to lose, and the row is one
   * click deep. The panel keeps its Save button because there it sits beside
   * three other unsaved fields.
   */
  async function chooseArt(topicArtId: string) {
    if (!user || topicArtId === (source.topicArtId ?? "")) return;
    setSavingArt(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/demand-sources/${source.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ topicArtId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success(
        topicArtId
          ? `Artwork set to ${topicArtLabel(topicArtId)}`
          : "Artwork cleared — the page uses the brand mark"
      );
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingArt(false);
    }
  }

  const kindLabel =
    hero.kind === "image"
      ? "uploaded hero image"
      : hero.kind === "art"
        ? `artwork: ${topicArtLabel(source.topicArtId)}`
        : hero.kind === "default"
          ? "global mode — the default incoming-call image"
          : "no image — the page uses the brand mark";

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
        aria-label={`${source.sourceName} — ${kindLabel}`}
        className={
          "p-1 rounded hover:bg-muted shrink-0 " +
          (hasImage
            ? "text-primary hover:text-primary"
            : "text-muted-foreground/50 hover:text-foreground")
        }
      >
        {hasImage ? (
          <ImageIcon className="w-3.5 h-3.5" />
        ) : (
          <ImagePlus className="w-3.5 h-3.5" />
        )}
      </button>

      {mounted &&
        preview &&
        hasImage &&
        createPortal(
          <div
            style={{
              top: preview.top,
              left: preview.left,
              width: PREVIEW_WIDTH,
            }}
            className="fixed z-[60] pointer-events-none rounded-xl border border-border bg-popover p-2 shadow-lg"
          >
            {/* The artwork is an SVG data URI, so an <img> renders it exactly
                as the page and the link preview do — no separate SVG path. */}
            <img
              src={hero.src}
              alt={hero.alt || `Waitlist image for ${source.sourceName}`}
              className="w-full aspect-[16/9] object-cover rounded-lg bg-muted"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5 px-0.5 truncate">
              {source.sourceName} — {kindLabel}
            </p>
          </div>,
          document.body
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Waitlist image</DialogTitle>
            <DialogDescription>{source.sourceName}</DialogDescription>
          </DialogHeader>

          {/* Which asset is live, said plainly. A source can hold both an
              uploaded image and a chosen artwork, and its page shows exactly
              one of them. */}
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 flex items-start gap-3">
            <img
              src={hero.src}
              alt=""
              className="w-24 aspect-[16/9] object-cover rounded-md border border-border shrink-0 bg-background"
            />
            <p className="text-xs text-muted-foreground">
              This page is in{" "}
              <span className="text-foreground">{mode}</span> mode, so it shows{" "}
              <span className="text-foreground">
                {hero.kind === "image"
                  ? "the uploaded image"
                  : hero.kind === "art"
                    ? `the ${topicArtLabel(source.topicArtId)} artwork`
                    : hero.kind === "default"
                      ? "the default incoming-call image"
                      : "the Operator brand mark"}
              </span>
              .
            </p>
          </div>

          {editor === "art" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                Topic imagery
              </p>
              <TopicArtPicker
                value={source.topicArtId ?? ""}
                onChange={(id) => void chooseArt(id)}
                disabled={savingArt}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {savingArt && <Loader2 className="w-3 h-3 animate-spin" />}
                A fixed set, so nothing on a public page depends on who owns a
                picture. Choosing one saves it straight away; Brand clears it.
              </p>
              {source.heroImageUrl && (
                <p className="text-xs text-muted-foreground">
                  This source also has an uploaded image, kept from when it was
                  a family page. It is not shown while the mode is community.
                </p>
              )}
            </div>
          )}

          {editor === "upload" && (
            <HeroImageEditor
              source={source}
              onSaved={async () => {
                await onSaved();
              }}
            />
          )}

          {editor === "none" && (
            <p className="text-xs text-muted-foreground rounded-lg border border-border/60 px-3 py-2.5">
              A global page always uses the Operator brand mark and has no image
              to set. Change the page mode to community for artwork, or family
              for an uploaded image.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
