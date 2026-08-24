"use client";

import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── "Join the waitlist" ─────────────────────────────────────────────────────
//
// The waitlist page now carries a long explanatory tail below the form, so a
// reader who is convinced at the bottom needs a way back to the form. These
// buttons scroll there; they never navigate.
//
// Rendered as a real anchor rather than a button so it still works with no
// JavaScript — the click handler only upgrades the jump to a smooth scroll and
// moves focus into the first field, which a bare `#` jump does not do.

/** The id of the form wrapper on the waitlist page. */
export const WAITLIST_FORM_ANCHOR = "join";

function scrollToForm(event: React.MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById(WAITLIST_FORM_ANCHOR);
  if (!target) return; // let the browser follow the href

  event.preventDefault();

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

  // Someone who clicked "join the waitlist" wants to type, and a keyboard or
  // screen-reader user gets nothing from a scroll alone. preventScroll keeps
  // focusing from fighting the smooth scroll already under way.
  const email = target.querySelector<HTMLInputElement>("#waitlist-email");
  email?.focus({ preventScroll: true });
}

interface Props {
  label?: string;
  className?: string;
}

export function JoinWaitlistButton({ label = "Join the waitlist", className }: Props) {
  return (
    <a
      href={`#${WAITLIST_FORM_ANCHOR}`}
      onClick={scrollToForm}
      className={cn(
        "inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-base hover:opacity-90 transition-opacity",
        className
      )}
    >
      {label}
      <ArrowUp className="w-4 h-4" aria-hidden="true" />
    </a>
  );
}

/** A quiet band between two sections. */
export function JoinWaitlistBand({ note }: { note: string }) {
  return (
    <section className="py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <p className="text-lg text-muted-foreground mb-6 text-balance">{note}</p>
        <JoinWaitlistButton />
      </div>
    </section>
  );
}

/**
 * The closing block. Visually the homepage's final CTA, without its two
 * buttons — this page has one action, and "Get started free" and "Download the
 * app" both lead away from it.
 */
export function JoinWaitlistFinalCta({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="py-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div className="rounded-3xl gradient-gold p-8 sm:p-12 shadow-2xl shadow-primary/20">
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-primary-foreground mb-4 text-balance">
            {heading}
          </h2>
          <p className="text-primary-foreground/80 text-lg mb-8 max-w-xl mx-auto text-balance">
            {body}
          </p>
          <JoinWaitlistButton className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 bg-none" />
        </div>
      </div>
    </section>
  );
}
