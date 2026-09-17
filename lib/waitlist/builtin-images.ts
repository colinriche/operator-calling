// ─── Built-in waitlist images ────────────────────────────────────────────────
//
// Pictures that ship with the site rather than being uploaded. They sit in the
// image library alongside uploads and the curated topic artwork, and one of
// them is the default until an admin picks another.
//
// Each has two shapes:
//
//   - `pageSrc`, a file in /public, for the waitlist page.
//   - `card`, a 1200×434 strip composed for the social card's visual area,
//     embedded because satori renders on the server with no origin to fetch a
//     public file from, and a fetch that can fail would cost the card its
//     picture.
//
// Client-safe: strings only. The card strips are large, so only the server
// card renderer imports builtin-card-data.ts.

export interface BuiltinImage {
  id: string;
  label: string;
  alt: string;
  pageSrc: string;
  /**
   * How the page shows it. "banner" is the top of a phone cut off at its bottom
   * edge, set in a light panel; "dark" is a whole portrait phone, contained on
   * black.
   */
  display: "banner" | "dark";
}

export const BUILTIN_IMAGES: readonly BuiltinImage[] = [
  {
    // Originally a transparency checkerboard painted into the pixels, keyed out
    // once and saved with real transparency.
    id: "operator-banner",
    label: "Operator Calling banner",
    alt: "A phone showing an incoming call from Operator Calling",
    pageSrc: "/waitlist/banner-hero.webp",
    display: "banner",
  },
  {
    id: "incoming-call",
    label: "Incoming call (dark)",
    alt: "A phone showing an incoming call from The Operator",
    pageSrc: "/waitlist/incoming-call-hero.jpg",
    display: "dark",
  },
];

export function builtinImage(id: string): BuiltinImage | null {
  return BUILTIN_IMAGES.find((i) => i.id === id) ?? null;
}

/** What a page shows when nothing has been chosen and no default is stored. */
export const FALLBACK_DEFAULT_IMAGE_CHOICE = "builtin:operator-banner";
