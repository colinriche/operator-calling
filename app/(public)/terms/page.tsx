import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";

// TERMS PAGE - STRUCTURE ONLY.
//
// No legal wording has been written here on purpose: the terms of use must be
// supplied by the business (and ideally checked by a lawyer). To publish them:
//   1. Fill in TERMS_SECTIONS below (each entry is a heading and its body).
//   2. Set LAST_UPDATED.
//   3. Remove the `robots` entry from `metadata` so search engines can index it.
// While TERMS_SECTIONS is empty the page shows a plain "being finalised" notice
// and asks search engines not to index it.

interface TermsSection {
  id: string;
  title: string;
  body: ReactNode;
}

const TERMS_SECTIONS: TermsSection[] = [];

/** e.g. "5 October 2026". Shown only once there are sections. */
const LAST_UPDATED = "";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms that apply when you use Operator.",
  // Remove once TERMS_SECTIONS contains the real terms.
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  const published = TERMS_SECTIONS.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="mb-12">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          Terms of Use
        </h1>
        {published && LAST_UPDATED && (
          <p className="text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
        )}
      </AnimatedSection>

      {published ? (
        <div className="space-y-10">
          {TERMS_SECTIONS.map((section) => (
            <AnimatedSection key={section.id}>
              <section id={section.id}>
                <h2 className="font-heading font-bold text-2xl text-foreground mb-4">
                  {section.title}
                </h2>
                <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                  {section.body}
                </div>
              </section>
            </AnimatedSection>
          ))}
        </div>
      ) : (
        <AnimatedSection>
          <div className="bg-card rounded-2xl border border-border/60 p-6 text-sm text-muted-foreground leading-relaxed space-y-3">
            <p>Our terms of use are being finalised and will be published here.</p>
            <p>
              In the meantime, our{" "}
              <Link href="/privacy" className="text-primary underline underline-offset-4">
                Privacy Policy
              </Link>{" "}
              explains how we handle your information. For anything else, email{" "}
              <a
                href="mailto:privacy@operatorcalling.com"
                className="text-primary underline underline-offset-4"
              >
                privacy@operatorcalling.com
              </a>
              .
            </p>
          </div>
        </AnimatedSection>
      )}
    </div>
  );
}
