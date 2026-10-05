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
  {
    // The WhatsApp card, and pickable like any other. Two buttons everybody
    // has already pressed a thousand times: at thumbnail size in a chat there
    // is nothing to read, and the link still says "this is about a phone call".
    id: "call-buttons",
    label: "Answer and decline buttons (dark)",
    alt: "The red decline and green answer buttons of a phone call",
    pageSrc: "/waitlist/call-buttons-hero.webp",
    display: "dark",
  },
];

export function builtinImage(id: string): BuiltinImage | null {
  return BUILTIN_IMAGES.find((i) => i.id === id) ?? null;
}

/** What a page shows when nothing has been chosen and no default is stored. */
export const FALLBACK_DEFAULT_IMAGE_CHOICE = "builtin:operator-banner";

/**
 * What WhatsApp shows when nobody has chosen a picture for it.
 *
 * WhatsApp is the only network where the preview is a small square beside a
 * line of text in a conversation someone is scrolling past, and the page's own
 * picture - a phone, a piece of topic artwork - reads as a smudge at that size.
 * Two call buttons do not: they are the same two buttons on the reader's own
 * screen, and they say "a phone call" before anything is read.
 *
 * Not on a family page. There the picture is the family's own photograph, and
 * the people in it are the entire reason the link gets opened.
 *
 * See heroFor in presentation.ts for where this sits: below anything an admin
 * chose for WhatsApp, above the page's own picture.
 */
export const WHATSAPP_DEFAULT_IMAGE_CHOICE = "builtin:call-buttons";
