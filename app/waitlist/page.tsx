import { cache } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { PhoneIncoming, CalendarClock, ShieldCheck } from "lucide-react";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { WaitlistHeader } from "@/components/waitlist/WaitlistHeader";
import {
  JoinWaitlistBand,
  JoinWaitlistFinalCta,
  WAITLIST_FORM_ANCHOR,
} from "@/components/waitlist/JoinWaitlistCta";
import {
  FeatureSections,
  HowConnectingWorksSection,
  WhyCallingSection,
} from "@/components/marketing/FeatureSections";
import { GroupsSection } from "@/components/marketing/GroupsSection";
import {
  buildWaitlistPresentation,
  waitlistOgImageUrl,
} from "@/lib/waitlist/presentation";
import { resolveWaitlistContext } from "@/lib/waitlist/server";
import { urlSourceCode } from "@/lib/waitlist/tracked-url";

// Attribution is resolved per-request from the source code, so this can never
// be statically rendered.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

// generateMetadata and the render below are two passes over the same request.
// Without this they would each resolve the source separately, which is both a
// second Firestore read and — if a source were edited between the two — a page
// whose Open Graph tags described a different page.
const contextFor = cache(
  async (code: string | undefined, share: string | undefined) =>
    resolveWaitlistContext(code, share)
);

/** Absolute origin, which og:image requires and relative URLs cannot give. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://operatorcalling.com";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const context = await contextFor(first(params, "s"), first(params, "share"));
  const p = buildWaitlistPresentation(context);
  const site = await origin();
  const image = waitlistOgImageUrl(site, context.sourceCode);

  // The canonical address of this page. Only `s` is carried: `t` is cosmetic
  // and `share`/`preview` describe how someone arrived, not what they are
  // looking at, so leaving them in would make every re-share a different URL.
  //
  // Without og:url a scraper has to assume the URL it happened to fetch is the
  // canonical one. Facebook re-resolves a link when the post is actually
  // submitted rather than reusing the composer's preview, and that second pass
  // is where an absent og:url costs you the card.
  const canonical = context.sourceCode
    ? `${site}/waitlist?s=${encodeURIComponent(urlSourceCode(context.sourceCode))}`
    : `${site}/waitlist`;

  // Title, description and image all come out of the same presentation object
  // the page renders from — there is nothing here to keep in sync by hand.
  return {
    title: p.og.title,
    description: p.og.description,
    // A tracked link is an internal attribution tool, not something that should
    // accumulate search results for every forum we post in. This does not stop
    // link-preview crawlers, which is the point: no indexing, full previews.
    robots: { index: false, follow: false },
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "The Operator",
      url: canonical,
      title: p.og.title,
      description: p.og.description,
      // Declaring the type as well as the dimensions means a scraper does not
      // have to fetch the image to learn what it is.
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          type: "image/png",
          alt: p.og.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: p.og.title,
      description: p.og.description,
      images: [image],
    },
  };
}

const BULLET_ICONS = {
  availability: CalendarClock,
  incoming: PhoneIncoming,
  privacy: ShieldCheck,
} as const;

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const context = await contextFor(first(params, "s"), first(params, "share"));
  const p = buildWaitlistPresentation(context);

  // Admin previews must not pollute the public counters.
  const isPreview = first(params, "preview") === "1";

  // Which of the six homepage feature cards make sense here. The pair
  // "calls with people you know" / "unexpected calls with people you don't" are
  // the same product pitched at opposite audiences, so the page picks the one
  // that matches what it has already promised — a family page must not tell
  // its reader to expect calls from strangers.
  const featureIds =
    p.connectionType === "existing_connections"
      ? (["known", "both-answer", "schedule", "privacy"] as const)
      : (["strangers", "both-answer", "schedule", "privacy"] as const);

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <WaitlistHeader p={p} />

      <p className="text-base text-muted-foreground leading-relaxed mb-4">
        {p.body}
      </p>

      {p.tagline && (
        <p className="font-heading text-base text-foreground/80 mb-8">
          {p.tagline}
        </p>
      )}

      {/* The three things a first-time visitor has to grasp before the form. */}
      <ul className="grid sm:grid-cols-3 gap-3 mb-8">
        {p.bullets.map((bullet) => {
          const Icon = BULLET_ICONS[bullet.id];
          return (
            <li
              key={bullet.id}
              className="bg-card rounded-2xl border border-border/60 p-4 flex sm:flex-col gap-3"
            >
              <Icon className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
              <span className="text-sm text-muted-foreground leading-relaxed">
                {bullet.text}
              </span>
            </li>
          );
        })}
      </ul>

      {/* The scroll target for every "Join the waitlist" button below. */}
      <div id={WAITLIST_FORM_ANCHOR} className="scroll-mt-6">
        <WaitlistForm
          context={context}
          presentation={p}
          isPreview={isPreview}
        />
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mt-8">
        {p.disclaimer}
      </p>
      </div>

      {/* ─── Landing content ────────────────────────────────────────────────
          Most people arriving here have never heard of The Operator, and
          everything above assumes they have. These are the homepage's own
          sections, reused rather than reworded, so there is one explanation of
          the product and not two that drift apart.

          These sit outside the narrow column above rather than inside it, so
          their own containers govern their width — and every one is passed
          `compact`, which drops them from homepage scale to this page's. At
          full scale the join between a 672px column of form and a 1280px
          section read as two different pages stitched together.

          Nothing below is source-specific except the feature selection — the
          form, its wording, its artwork and its tracking are all above and
          untouched. */}
      <WhyCallingSection compact />

      <JoinWaitlistBand note="The Operator is not live yet. Registering your interest is what decides where it opens first." />

      <HowConnectingWorksSection compact />

      <FeatureSections ids={featureIds} compact />

      {/* Use-case tags off: on a page built around one group, a tag cloud of
          other groups competes with it. */}
      <GroupsSection showUseCases={false} compact />

      <JoinWaitlistFinalCta
        heading="Sound like something you'd use?"
        body="Register your interest. It takes a moment, and there is nothing to install."
      />
    </>
  );
}
