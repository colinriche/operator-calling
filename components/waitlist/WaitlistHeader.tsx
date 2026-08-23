import { Info } from "lucide-react";
import type { WaitlistPresentation } from "@/lib/waitlist/types";

// ─── The top of the waitlist page ────────────────────────────────────────────
//
// Hero, source, heading and lead — in that order, above everything else,
// because the one thing a visitor arriving from a forum post needs immediately
// is "what is this and where did it come from". Nothing here is written in this
// file: every string comes from lib/waitlist/presentation.ts, which is also
// what the Open Graph tags and the preview image are built from.

// The hero is a data URI (curated artwork) or a Firebase Storage download URL
// (an uploaded family image). next/image would buy nothing for the first and
// need remotePatterns for the second, so this is a plain <img> deliberately.
/* eslint-disable @next/next/no-img-element */

export function WaitlistHeader({ p }: { p: WaitlistPresentation }) {
  return (
    <header className="mb-8">
      {/* Only an uploaded family photograph earns the full-width banner. A
          family page is *about* those people, so the picture is the point.
          Topic artwork is decoration — a mark identifying the subject, the same
          job the brand mark does on the global page — and blowing it up to
          16/9 pushed the heading and the independence note below the fold on a
          phone, which is exactly where they must not be. */}
      {p.hero.kind === "image" ? (
        <img
          src={p.hero.src}
          alt={p.hero.alt}
          className="w-full aspect-[16/9] object-cover rounded-2xl border border-border/60 mb-6 bg-muted"
        />
      ) : (
        <img
          src={p.hero.src}
          alt={p.hero.alt}
          aria-hidden={p.hero.alt === "" || undefined}
          className="w-16 h-16 rounded-2xl object-cover mb-5"
        />
      )}

      {p.eyebrow && (
        <p className="font-heading font-semibold text-sm text-primary tracking-wide mb-2">
          {p.eyebrow}
        </p>
      )}

      <h1 className="font-heading font-bold text-3xl sm:text-4xl text-foreground mb-4 text-balance">
        {p.heading}
      </h1>

      <p className="text-lg text-muted-foreground leading-relaxed">{p.lead}</p>

      {/* Deliberately above the fold rather than in the fine print. Somebody who
          followed this link out of a community they trust should learn we are
          not that community before they read anything else about us. */}
      {p.independenceNote && (
        <p className="mt-5 flex gap-2.5 rounded-xl border border-border/60 bg-muted/50 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>{p.independenceNote}</span>
        </p>
      )}
    </header>
  );
}
