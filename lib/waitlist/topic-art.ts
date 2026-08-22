// ─── Curated topic artwork ───────────────────────────────────────────────────
//
// A fixed set of illustrations an admin picks from, one per community source.
// Deliberately not uploads: a community page is posted to a forum full of
// strangers, and "paste any image here" turns every one of those pages into a
// question about who owns the picture. A fixed set is drawn once, licensed by
// construction, and consistent across every page.
//
// Each piece is an SVG *string* rather than a component, because the same
// artwork has to render in two very different places — the React page and the
// satori-rendered Open Graph image — and those two must not be able to drift.
// Both consume `topicArtDataUri`, so the image in a link preview is the same
// file as the image at the top of the page.
//
// Client-safe: pure strings, no imports, no server-only anything.

// Brand colours as literals. The page has CSS variables for these; satori has
// no stylesheet at all, so the artwork carries its own palette.
const CREAM = "#FBF7EF";
const SAND = "#F3E7D0";
const GOLD = "#D89A2C";
const GOLD_LIGHT = "#F0C567";
const TEAL = "#2F5468";
const TEAL_LIGHT = "#5A8399";
const INK = "#332D27";

/** Every piece is drawn on this canvas, so they crop and scale identically. */
const W = 400;
const H = 300;

function scene(body: string, tint: string = SAND): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<rect width="${W}" height="${H}" fill="${tint}"/>`,
    // A soft off-centre disc, shared by every piece, so the set reads as one
    // family rather than fourteen unrelated drawings.
    `<circle cx="300" cy="72" r="140" fill="${CREAM}" opacity="0.55"/>`,
    `<circle cx="70" cy="270" r="96" fill="${GOLD_LIGHT}" opacity="0.28"/>`,
    body,
    `</svg>`,
  ].join("");
}

// ─── The pieces ──────────────────────────────────────────────────────────────

const CARDS = scene(
  [
    `<g transform="rotate(-13 168 158)">`,
    `<rect x="108" y="82" width="120" height="164" rx="14" fill="${CREAM}" stroke="${INK}" stroke-width="4"/>`,
    `<path d="M168 122 L188 152 a12 12 0 0 1 -16 8 l5 22 h-18 l5 -22 a12 12 0 0 1 -16 -8 Z" fill="${INK}"/>`,
    `</g>`,
    `<g transform="rotate(11 236 156)">`,
    `<rect x="176" y="80" width="120" height="164" rx="14" fill="${CREAM}" stroke="${INK}" stroke-width="4"/>`,
    `<path d="M236 196 C 196 166, 202 124, 224 124 c 8 0 12 5 12 10 c 0 -5 4 -10 12 -10 c 22 0 28 42 -12 72 Z" fill="${GOLD}"/>`,
    `</g>`,
  ].join("")
);

const CHESS = scene(
  [
    // Rook
    `<path d="M242 118 h12 v-16 h14 v16 h12 v-16 h14 v16 h12 v26 l-10 10 v52 l12 26 h-68 l12 -26 v-52 l-10 -10 Z" fill="${TEAL}"/>`,
    `<rect x="228" y="222" width="80" height="18" rx="6" fill="${TEAL}"/>`,
    // Pawn
    `<circle cx="146" cy="122" r="26" fill="${GOLD}"/>`,
    `<path d="M126 152 h40 l10 24 h-60 Z" fill="${GOLD}"/>`,
    `<path d="M132 176 h28 l8 46 h-44 Z" fill="${GOLD}"/>`,
    `<rect x="106" y="222" width="80" height="18" rx="6" fill="${GOLD}"/>`,
    `<rect x="90" y="240" width="234" height="14" rx="5" fill="${INK}"/>`,
  ].join("")
);

const GAMING = scene(
  [
    `<path d="M132 108 h136 a56 56 0 0 1 56 56 v22 a40 40 0 0 1 -74 21 l-8 -13 h-84 l-8 13 a40 40 0 0 1 -74 -21 v-22 a56 56 0 0 1 56 -56 Z" fill="${TEAL}"/>`,
    `<rect x="112" y="158" width="46" height="14" rx="6" fill="${CREAM}"/>`,
    `<rect x="128" y="142" width="14" height="46" rx="6" fill="${CREAM}"/>`,
    `<circle cx="256" cy="152" r="12" fill="${GOLD_LIGHT}"/>`,
    `<circle cx="284" cy="178" r="12" fill="${GOLD_LIGHT}"/>`,
    `<circle cx="228" cy="178" r="12" fill="${CREAM}"/>`,
  ].join("")
);

const MUSIC = scene(
  [
    `<path d="M164 88 l104 -26 v30 l-104 26 Z" fill="${INK}"/>`,
    `<rect x="164" y="88" width="10" height="110" fill="${INK}"/>`,
    `<rect x="258" y="62" width="10" height="110" fill="${INK}"/>`,
    `<ellipse cx="148" cy="204" rx="26" ry="20" transform="rotate(-18 148 204)" fill="${GOLD}"/>`,
    `<ellipse cx="242" cy="178" rx="26" ry="20" transform="rotate(-18 242 178)" fill="${GOLD}"/>`,
    `<g fill="${TEAL_LIGHT}">`,
    `<rect x="82" y="150" width="12" height="40" rx="6"/>`,
    `<rect x="104" y="128" width="12" height="84" rx="6"/>`,
    `<rect x="300" y="140" width="12" height="60" rx="6"/>`,
    `<rect x="322" y="118" width="12" height="104" rx="6"/>`,
    `</g>`,
  ].join("")
);

const BOOKS = scene(
  [
    `<rect x="96" y="196" width="212" height="46" rx="8" fill="${TEAL}"/>`,
    `<rect x="112" y="204" width="10" height="30" rx="4" fill="${CREAM}"/>`,
    `<rect x="110" y="150" width="188" height="46" rx="8" fill="${GOLD}"/>`,
    `<rect x="126" y="158" width="10" height="30" rx="4" fill="${CREAM}"/>`,
    `<rect x="126" y="104" width="160" height="46" rx="8" fill="${TEAL_LIGHT}"/>`,
    `<rect x="142" y="112" width="10" height="30" rx="4" fill="${CREAM}"/>`,
    `<rect x="84" y="242" width="236" height="14" rx="5" fill="${INK}"/>`,
  ].join("")
);

const FILM = scene(
  [
    `<rect x="96" y="128" width="212" height="118" rx="10" fill="${INK}"/>`,
    `<g transform="rotate(-8 202 104)">`,
    `<rect x="96" y="82" width="212" height="42" rx="8" fill="${TEAL}"/>`,
    `<g fill="${CREAM}">`,
    `<path d="M116 82 l22 0 l-22 42 l-22 0 Z"/>`,
    `<path d="M172 82 l22 0 l-22 42 l-22 0 Z"/>`,
    `<path d="M228 82 l22 0 l-22 42 l-22 0 Z"/>`,
    `<path d="M284 82 l22 0 l-22 42 l-22 0 Z"/>`,
    `</g>`,
    `</g>`,
    `<circle cx="202" cy="188" r="30" fill="${GOLD}"/>`,
    `<path d="M194 174 l24 14 l-24 14 Z" fill="${INK}"/>`,
  ].join("")
);

const RUNNING = scene(
  [
    `<circle cx="232" cy="88" r="24" fill="${INK}"/>`,
    `<path d="M214 122 l44 -8 l22 46 l-30 10 Z" fill="${GOLD}"/>`,
    `<g stroke="${INK}" stroke-width="16" stroke-linecap="round" fill="none">`,
    `<path d="M220 126 l-44 22"/>`,
    `<path d="M258 118 l40 30"/>`,
    `<path d="M244 172 l-8 44 l-34 24"/>`,
    `<path d="M258 168 l30 30 l38 6"/>`,
    `</g>`,
    `<g stroke="${TEAL_LIGHT}" stroke-width="12" stroke-linecap="round">`,
    `<path d="M70 122 h56"/>`,
    `<path d="M52 166 h84"/>`,
    `<path d="M78 210 h50"/>`,
    `</g>`,
  ].join("")
);

const COOKING = scene(
  [
    `<g stroke="${TEAL_LIGHT}" stroke-width="10" stroke-linecap="round" fill="none">`,
    `<path d="M172 108 c 14 -14, -14 -28, 0 -42"/>`,
    `<path d="M204 100 c 14 -16, -14 -32, 0 -48"/>`,
    `<path d="M236 108 c 14 -14, -14 -28, 0 -42"/>`,
    `</g>`,
    `<rect x="106" y="132" width="196" height="20" rx="10" fill="${TEAL}"/>`,
    `<circle cx="204" cy="122" r="12" fill="${TEAL}"/>`,
    `<path d="M120 156 h168 l-14 78 a16 16 0 0 1 -16 14 h-108 a16 16 0 0 1 -16 -14 Z" fill="${GOLD}"/>`,
    `<rect x="76" y="160" width="40" height="18" rx="9" fill="${TEAL}"/>`,
    `<rect x="292" y="160" width="40" height="18" rx="9" fill="${TEAL}"/>`,
  ].join("")
);

const GARDEN = scene(
  [
    `<path d="M204 226 v-96" stroke="${TEAL}" stroke-width="10" stroke-linecap="round"/>`,
    `<path d="M200 160 c -48 -6, -66 -40, -62 -66 c 30 -6, 62 22, 62 66 Z" fill="${TEAL_LIGHT}"/>`,
    `<path d="M208 138 c 48 -8, 62 -44, 56 -70 c -30 -4, -60 26, -56 70 Z" fill="${TEAL}"/>`,
    `<circle cx="204" cy="76" r="20" fill="${GOLD}"/>`,
    `<path d="M148 224 h112 l-16 60 a10 10 0 0 1 -10 8 h-60 a10 10 0 0 1 -10 -8 Z" fill="${GOLD}"/>`,
    `<rect x="140" y="208" width="128" height="20" rx="8" fill="${INK}"/>`,
  ].join("")
);

const PETS = scene(
  [
    `<ellipse cx="204" cy="200" rx="62" ry="50" fill="${INK}"/>`,
    `<ellipse cx="140" cy="128" rx="24" ry="30" transform="rotate(-20 140 128)" fill="${GOLD}"/>`,
    `<ellipse cx="188" cy="104" rx="24" ry="32" fill="${GOLD}"/>`,
    `<ellipse cx="240" cy="108" rx="24" ry="32" transform="rotate(12 240 108)" fill="${GOLD}"/>`,
    `<ellipse cx="286" cy="140" rx="24" ry="30" transform="rotate(28 286 140)" fill="${GOLD}"/>`,
  ].join("")
);

const TRAVEL = scene(
  [
    `<circle cx="188" cy="176" r="76" fill="${TEAL}"/>`,
    `<g stroke="${CREAM}" stroke-width="6" fill="none">`,
    `<path d="M112 176 h152"/>`,
    `<path d="M188 100 c 34 30, 34 122, 0 152"/>`,
    `<path d="M188 100 c -34 30, -34 122, 0 152"/>`,
    `</g>`,
    `<path d="M124 96 c 70 -54, 154 -54, 214 -6" stroke="${GOLD}" stroke-width="6" stroke-linecap="round" stroke-dasharray="4 14" fill="none"/>`,
    `<path d="M282 54 l58 30 l-58 30 l10 -30 Z" fill="${GOLD}"/>`,
  ].join("")
);

const MOTORING = scene(
  [
    `<path d="M76 210 v-30 a16 16 0 0 1 12 -16 l30 -8 l34 -40 a24 24 0 0 1 18 -8 h72 a24 24 0 0 1 18 8 l30 40 l30 8 a16 16 0 0 1 12 16 v30 Z" fill="${TEAL}"/>`,
    `<path d="M160 122 h44 v34 h-74 Z" fill="${CREAM}"/>`,
    `<path d="M218 122 h30 l26 34 h-56 Z" fill="${CREAM}"/>`,
    `<circle cx="132" cy="212" r="30" fill="${INK}"/>`,
    `<circle cx="132" cy="212" r="12" fill="${GOLD}"/>`,
    `<circle cx="278" cy="212" r="30" fill="${INK}"/>`,
    `<circle cx="278" cy="212" r="12" fill="${GOLD}"/>`,
    `<rect x="60" y="238" width="290" height="12" rx="5" fill="${INK}"/>`,
  ].join("")
);

const TECH = scene(
  [
    `<rect x="86" y="76" width="228" height="150" rx="14" fill="${INK}"/>`,
    `<rect x="100" y="90" width="200" height="122" rx="8" fill="${TEAL}"/>`,
    `<g stroke="${GOLD_LIGHT}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none">`,
    `<path d="M162 128 l-26 23 l26 23"/>`,
    `<path d="M238 128 l26 23 l-26 23"/>`,
    `<path d="M212 118 l-24 66"/>`,
    `</g>`,
    `<rect x="182" y="226" width="36" height="26" fill="${INK}"/>`,
    `<rect x="140" y="252" width="120" height="14" rx="7" fill="${INK}"/>`,
  ].join("")
);

const ART = scene(
  [
    `<path d="M204 62 c 74 0, 128 46, 128 100 c 0 38, -34 44, -56 44 c -18 0, -30 8, -30 22 c 0 16, -18 22, -42 22 c -66 0, -120 -44, -120 -94 c 0 -54, 46 -94, 120 -94 Z" fill="${CREAM}" stroke="${INK}" stroke-width="5"/>`,
    `<circle cx="128" cy="140" r="17" fill="${GOLD}"/>`,
    `<circle cx="172" cy="106" r="17" fill="${TEAL}"/>`,
    `<circle cx="230" cy="102" r="17" fill="${GOLD_LIGHT}"/>`,
    `<circle cx="276" cy="132" r="17" fill="${TEAL_LIGHT}"/>`,
    `<circle cx="150" cy="196" r="19" fill="${SAND}" stroke="${INK}" stroke-width="5"/>`,
  ].join("")
);

const CONVERSATION = scene(
  [
    `<path d="M84 82 h152 a18 18 0 0 1 18 18 v80 a18 18 0 0 1 -18 18 h-92 l-42 34 v-34 h-18 a18 18 0 0 1 -18 -18 v-80 a18 18 0 0 1 18 -18 Z" fill="${TEAL}"/>`,
    `<g fill="${CREAM}">`,
    `<circle cx="126" cy="140" r="11"/>`,
    `<circle cx="162" cy="140" r="11"/>`,
    `<circle cx="198" cy="140" r="11"/>`,
    `</g>`,
    `<path d="M200 140 h116 a18 18 0 0 1 18 18 v72 a18 18 0 0 1 -18 18 h-14 v30 l-38 -30 h-64 a18 18 0 0 1 -18 -18 v-72 a18 18 0 0 1 18 -18 Z" fill="${GOLD}" stroke="${SAND}" stroke-width="8"/>`,
  ].join("")
);

/** The brand mark, used wherever a page shows no topic art. */
export const BRAND_ART = scene(
  [
    `<circle cx="200" cy="150" r="86" fill="${GOLD}"/>`,
    `<path d="M170 112 c 0 0 8 -10 16 -6 l16 26 c 3 6 -1 10 -6 13 l-10 6 c 4 16 16 28 32 32 l6 -10 c 3 -5 7 -9 13 -6 l26 16 c 4 8 -6 16 -6 16 c -8 8 -22 10 -34 6 c -30 -10 -54 -34 -64 -64 c -4 -12 -2 -26 6 -34 Z" fill="${CREAM}"/>`,
    `<g stroke="${TEAL}" stroke-width="10" stroke-linecap="round" fill="none">`,
    `<path d="M300 108 a 60 60 0 0 1 0 84"/>`,
    `<path d="M326 82 a 96 96 0 0 1 0 136"/>`,
    `</g>`,
  ].join("")
);

// ─── The set ─────────────────────────────────────────────────────────────────

export const TOPIC_ART = [
  { id: "conversation", label: "Talking", svg: CONVERSATION },
  { id: "cards", label: "Cards and poker", svg: CARDS },
  { id: "chess", label: "Chess and board games", svg: CHESS },
  { id: "gaming", label: "Video games", svg: GAMING },
  { id: "music", label: "Music", svg: MUSIC },
  { id: "books", label: "Books and writing", svg: BOOKS },
  { id: "film", label: "Film and TV", svg: FILM },
  { id: "running", label: "Running and fitness", svg: RUNNING },
  { id: "cooking", label: "Food and cooking", svg: COOKING },
  { id: "garden", label: "Gardening and nature", svg: GARDEN },
  { id: "pets", label: "Pets and animals", svg: PETS },
  { id: "travel", label: "Travel and languages", svg: TRAVEL },
  { id: "motoring", label: "Cars and motoring", svg: MOTORING },
  { id: "tech", label: "Tech and coding", svg: TECH },
  { id: "art", label: "Art and making", svg: ART },
] as const;

export type TopicArtId = (typeof TOPIC_ART)[number]["id"];

export const TOPIC_ART_IDS = TOPIC_ART.map((a) => a.id) as readonly string[];

export function isTopicArtId(value: unknown): value is TopicArtId {
  return typeof value === "string" && TOPIC_ART_IDS.includes(value);
}

export function topicArtLabel(id: string): string {
  return TOPIC_ART.find((a) => a.id === id)?.label ?? "Talking";
}

// ─── Data URIs ───────────────────────────────────────────────────────────────

/**
 * base64 rather than percent-encoding: satori's image loader handles both, but
 * base64 is the form its tests cover, and these strings are pure ASCII so the
 * encode is lossless either side.
 */
function encode(svg: string): string {
  const base64 =
    typeof btoa === "function"
      ? btoa(svg)
      : Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

/** The artwork for an id, falling back to the brand mark for anything unknown. */
export function topicArtDataUri(id: string | null | undefined): string {
  const art = TOPIC_ART.find((a) => a.id === id);
  return encode(art ? art.svg : BRAND_ART);
}

export const BRAND_ART_DATA_URI = encode(BRAND_ART);
