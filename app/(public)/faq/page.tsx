import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";

export const metadata: Metadata = { title: "FAQ" };

const faqs = [
  {
    q: "What is The Operator?",
    a: "The Operator is a voice-first calling platform. It lets you schedule calls, request callbacks, and join community groups — all built around the idea that a 5-minute call beats a hundred messages.",
  },
  {
    q: "What does 'only connects when both answer' mean?",
    a: "When a call is initiated, The Operator rings both parties simultaneously. If both pick up, you're connected. If either side doesn't answer, the call doesn't connect — no voicemail, no missed-call guilt, just try again.",
  },
  {
    q: "Can I call strangers?",
    a: "Yes, but only if you opt in. Matched stranger calls are privacy-first: only your first name is shared, and you're matched by shared interests through our admin-moderated system.",
  },
  {
    q: "How are groups managed?",
    a: "Every group has an admin who controls membership, call permissions, and schedules. Private groups are invitation-only. Admins can also assign moderator roles to trusted members.",
  },
  {
    q: "Is there a mobile app?",
    a: "Yes. The Operator is available on iOS and Android. The web app (where you are now) offers a more advanced profile and admin experience.",
  },
  {
    q: "Is it free?",
    a: "The Operator has a free tier with core calling features. Group creation and advanced admin tools are part of the pro plan.",
  },
  {
    q: "How do you handle safety and abuse?",
    a: "Any user can block or report another user instantly. Reports are reviewed by group admins and our moderation team. Platform-wide actions are taken by super admins.",
  },
  {
    q: "Can I set my availability so I'm not disturbed?",
    a: "Yes. You set your available hours in your profile. The Operator will only attempt to connect calls during those windows.",
  },
];

export default function FAQPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="text-center mb-16">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          Frequently asked questions
        </h1>
        <p className="text-xl text-muted-foreground">
          Can't find an answer?{" "}
          <a href="mailto:hello@theoperator.app" className="text-primary underline underline-offset-4">
            Get in touch.
          </a>
        </p>
      </AnimatedSection>

      <div className="space-y-4" id="faq">
        {faqs.map((item, i) => (
          <AnimatedSection key={item.q} delay={i * 0.05}>
            <details className="group bg-card rounded-2xl border border-border/60 overflow-hidden">
              <summary className="flex items-center justify-between p-5 cursor-pointer font-heading font-semibold text-foreground select-none hover:bg-muted/40 transition-colors">
                {item.q}
                <span className="ml-4 shrink-0 text-muted-foreground group-open:rotate-45 transition-transform text-xl leading-none">+</span>
              </summary>
              <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </details>
          </AnimatedSection>
        ))}
      </div>

      <AnimatedSection className="mt-16 text-center">
        <p className="text-muted-foreground mb-4">Still have questions?</p>
        <a
          href="mailto:hello@theoperator.app"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-gold text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Contact us
        </a>
      </AnimatedSection>
    </div>
  );
}
