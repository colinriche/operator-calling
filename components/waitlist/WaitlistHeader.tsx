import { Info } from "lucide-react";
import { builtinImage } from "@/lib/waitlist/builtin-images";
import type { WaitlistPresentation } from "@/lib/waitlist/types";

// ─── The top of the waitlist page ────────────────────────────────────────────
//
// Hero, source, heading and lead — in that order, above everything else,
// because the one thing a visitor arriving from a forum post needs immediately
// is "what is this and where did it come from". Nothing here is written in this
// file: every string comes from lib/waitlist/presentation.ts, which is also
// what the Open Graph tags and the preview image are built from.

// The hero is a data URI (curated artwork), a Firebase Storage download URL
// (an uploaded image) or a small file in /public (a built-in picture). next/image would buy nothing for the first and
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
        // Never cropped. Full width at the picture's own proportions, so a wide
        // banner shows every edge; a tall picture is capped in height and shown
        // whole within it rather than cut down to a slice.
        <img
          src={p.hero.src}
          alt={p.hero.alt}
          className="block w-full h-auto max-h-[28rem] object-contain rounded-2xl border border-border/60 mb-6 bg-muted"
        />
      ) : p.hero.kind === "builtin" &&
        builtinImage(p.hero.builtinId)?.display === "dark" ? (
        // A whole portrait phone, contained rather than cropped, on the same
        // near-black the picture is composed on.
        <img
          src={p.hero.src}
          alt={p.hero.alt}
          className="w-full h-64 sm:h-80 object-contain rounded-2xl bg-[#020202] mb-6"
        />
      ) : p.hero.kind === "builtin" ? (
        // The top of a phone, cut off at its bottom edge, so it rises out of
        // the bottom of its panel rather than floating in it.
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden px-4 pt-5 sm:px-8 sm:pt-7 mb-6">
          <img src={p.hero.src} alt={p.hero.alt} className="block w-full h-auto" />
        </div>
      ) : (
        <img
          src={p.hero.src}
          alt={p.hero.alt}
          aria-hidden={p.hero.alt === "" || undefined}
          // 4:3, the proportions every illustration is drawn at. A square
          // crop cut off both sides of the scene.
          className="w-20 h-15 rounded-2xl object-cover mb-5"
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
