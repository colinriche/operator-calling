"use client";

import { cn } from "@/lib/utils";
import { TOPIC_ART, topicArtDataUri } from "@/lib/waitlist/topic-art";

// ─── Choosing a community page's artwork ─────────────────────────────────────
//
// Lifted out of WaitlistPagePanel so the spreadsheet's row control offers the
// same fifteen pieces from the same curated set. Not an uploader, deliberately:
// see lib/waitlist/topic-art.ts — a community page is posted to a forum full of
// strangers, and "paste any image here" makes every one of those pages a
// question about who owns the picture.
//
// Presentational. It reports a choice and stores nothing; the caller decides
// whether that is a draft to save later (the panel) or a write to make now
// (the spreadsheet).

/* eslint-disable @next/next/no-img-element */

interface Props {
  /** A TOPIC_ART id, or "" for the brand mark. */
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function TopicArtPicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("")}
        title="No artwork — use the Operator brand mark"
        aria-label="No artwork — use the Operator brand mark"
        className={cn(
          "aspect-[4/3] rounded-lg border text-[10px] text-muted-foreground flex items-center justify-center disabled:opacity-50",
          value === ""
            ? "border-primary ring-2 ring-primary/30"
            : "border-border hover:border-primary/40"
        )}
      >
        Brand
      </button>
      {TOPIC_ART.map((art) => (
        <button
          key={art.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(art.id)}
          title={art.label}
          aria-label={art.label}
          className={cn(
            "aspect-[4/3] rounded-lg border overflow-hidden disabled:opacity-50",
            value === art.id
              ? "border-primary ring-2 ring-primary/30"
              : "border-border hover:border-primary/40"
          )}
        >
          <img
            src={topicArtDataUri(art.id)}
            alt={art.label}
            className="w-full h-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}
