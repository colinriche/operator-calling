import type { Metadata } from "next";
import { PhoneIncoming, CalendarClock, ShieldCheck } from "lucide-react";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { resolveWaitlistContext } from "@/lib/waitlist/server";

// Attribution is resolved per-request from the source code, so this can never
// be statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join the waitlist",
  description:
    "The Operator arranges scheduled one-to-one voice calls around shared interests. You make yourself available and the call comes to you.",
  // A tracked link is an internal attribution tool, not something that should
  // accumulate search results for every forum we post in.
  robots: { index: false, follow: false },
};

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const context = await resolveWaitlistContext(first("s"), first("share"));

  // Admin previews must not pollute the public counters.
  const isPreview = first("preview") === "1";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <h1 className="font-heading font-bold text-3xl sm:text-4xl text-foreground mb-4 text-balance">
        Like talking on the phone with new people?
      </h1>

      <p className="text-lg text-muted-foreground leading-relaxed mb-4">
        The Operator is built around scheduled one-to-one voice calls. You do not
        need to search for people, send connection requests or arrange the call
        yourself. Make yourself available and, when a suitable call is scheduled,
        The Operator makes the connection and the call comes to you.
      </p>

      <p className="font-heading text-base text-foreground/80 mb-8">
        The operator makes the call, so you don&apos;t have to.
      </p>

      {/* The three things a first-time visitor has to grasp before the form. */}
      <ul className="grid sm:grid-cols-3 gap-3 mb-8">
        {[
          {
            icon: CalendarClock,
            text: "You pick when you're available — no searching for anyone.",
          },
          {
            icon: PhoneIncoming,
            text: "The call comes to you. The Operator makes the connection.",
          },
          {
            icon: ShieldCheck,
            text: "Nobody exchanges phone numbers.",
          },
        ].map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="bg-card rounded-2xl border border-border/60 p-4 flex sm:flex-col gap-3"
          >
            <Icon className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm text-muted-foreground leading-relaxed">
              {text}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        It is a separate service from the website, group or discussion where you
        found this link. Calls take place through The Operator without anyone
        sharing their phone number.
      </p>

      <WaitlistForm context={context} isPreview={isPreview} />

      <p className="text-xs text-muted-foreground leading-relaxed mt-8">
        {context.disclaimer}
      </p>
    </div>
  );
}
