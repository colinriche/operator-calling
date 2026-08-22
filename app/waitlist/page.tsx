import { cache } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { PhoneIncoming, CalendarClock, ShieldCheck } from "lucide-react";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { WaitlistHeader } from "@/components/waitlist/WaitlistHeader";
import {
  buildWaitlistPresentation,
  waitlistOgImageUrl,
} from "@/lib/waitlist/presentation";
import { resolveWaitlistContext } from "@/lib/waitlist/server";

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
  const image = waitlistOgImageUrl(await origin(), context.sourceCode);

  // Title, description and image all come out of the same presentation object
  // the page renders from — there is nothing here to keep in sync by hand.
  return {
    title: p.og.title,
    description: p.og.description,
    // A tracked link is an internal attribution tool, not something that should
    // accumulate search results for every forum we post in. This does not stop
    // link-preview crawlers, which is the point: no indexing, full previews.
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "The Operator",
      title: p.og.title,
      description: p.og.description,
      images: [{ url: image, width: 1200, height: 630, alt: p.og.title }],
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

  return (
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

      <WaitlistForm
        context={context}
        presentation={p}
        isPreview={isPreview}
      />

      <p className="text-xs text-muted-foreground leading-relaxed mt-8">
        {p.disclaimer}
      </p>
    </div>
  );
}
