"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, ImagePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HeroImageEditor } from "@/components/admin/HeroImageEditor";
import type { DemandSourceRow } from "@/lib/waitlist/types";

// ─── The hero image, from a spreadsheet row ──────────────────────────────────
//
// One icon, the same size as the archive icon beside it. Everything larger —
// the preview and the editor — is drawn outside the table so the row height
// never moves: a grid whose rows grow when you hover them is unusable for the
// thing this grid exists for, which is scanning forty sources at once.
//
// The preview is portalled to the body rather than positioned inside the cell.
// A `position: fixed` child would very likely be fine, but it would be fine by
// accident — one `transform` on an ancestor and fixed positioning starts
// resolving against that ancestor instead of the viewport, and the preview
// would be clipped by the table's own overflow. The portal makes it not depend
// on that.

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

export function RowHeroImageButton({ source, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasImage = !!source.heroImageUrl;

  useEffect(() => setMounted(true), []);

  // The preview is anchored to a fixed viewport position, so it has to go once
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
        title={
          hasImage
            ? "Has a hero image — hover to preview, click to change or remove"
            : "No hero image — click to add one"
        }
        aria-label={
          hasImage
            ? `Hero image for ${source.sourceName}`
            : `Add a hero image to ${source.sourceName}`
        }
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
        source.heroImageUrl &&
        createPortal(
          <div
            role="tooltip"
            style={{
              top: preview.top,
              left: preview.left,
              width: PREVIEW_WIDTH,
            }}
            className="fixed z-[60] pointer-events-none rounded-xl border border-border bg-popover p-2 shadow-lg"
          >
            <img
              src={source.heroImageUrl}
              alt={`Hero image for ${source.sourceName}`}
              className="w-full aspect-[16/9] object-cover rounded-lg"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5 px-0.5 truncate">
              {source.sourceName}
            </p>
          </div>,
          document.body
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasImage ? "Change hero image" : "Add hero image"}
            </DialogTitle>
            <DialogDescription>{source.sourceName}</DialogDescription>
          </DialogHeader>

          {/* Uploading here stores the image on the record either way, but only
              a family-mode page renders one — worth saying rather than letting
              someone upload a photograph and wonder why nothing changed. */}
          {source.waitlistMode !== "family" && (
            <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              This source&apos;s page mode is{" "}
              <span className="text-foreground">
                {source.waitlistMode || "community"}
              </span>
              , and only a family page shows an uploaded image. It will be saved
              against the record and appear if the mode changes to family.
            </p>
          )}

          <HeroImageEditor
            source={source}
            onSaved={async () => {
              await onSaved();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
