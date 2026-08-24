// ─── Two presentations of the same sections ──────────────────────────────────
//
// The marketing sections were written for the homepage, where they are the
// whole page: full-bleed containers, generous padding, headings larger than
// most pages' h1.
//
// The waitlist page reuses them below its own content, and there the homepage
// scale reads as two pages stitched together — a 672px column of form, then
// something 1280px wide with 96px of air around it. `compact` is the same
// sections at the waitlist's scale.
//
// Deliberately a shared module rather than a prop each component interprets for
// itself: "compact" has to mean the same thing in all four, or they will drift
// apart the moment one of them is edited. Every value below is paired with the
// homepage default it replaces, so the two are read together.
//
// The homepage passes nothing and is unaffected.

/** Outer vertical rhythm. */
export function sectionPadding(compact?: boolean): string {
  return compact ? "py-14" : "py-24";
}

/** Container width. 4xl sits close enough to the waitlist column to feel related. */
export function sectionContainer(compact?: boolean): string {
  return compact
    ? "max-w-4xl mx-auto px-4 sm:px-6"
    : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8";
}

/** Space under a section's heading block. */
export function sectionHeadingGap(compact?: boolean): string {
  return compact ? "mb-10" : "mb-16";
}

/**
 * Section headings. On the homepage these are the largest text on the page; on
 * the waitlist they sit below an h1 of `text-3xl sm:text-4xl`, and a subhead
 * larger than the page's own title is what makes the join look like a seam.
 */
export function sectionHeading(compact?: boolean): string {
  return compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl";
}

/** Gap between cards in a section's grid. */
export function sectionGridGap(compact?: boolean): string {
  return compact ? "gap-5" : "gap-8";
}
