import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";

export const metadata: Metadata = { title: "How it works" };

const steps = [
  {
    n: "01",
    title: "Create your profile",
    desc: "Set your name, availability windows, and call preferences. Tell us what kinds of conversations you're open to — work, casual, community, or all three.",
  },
  {
    n: "02",
    title: "Connect with people",
    desc: "Add contacts you know, join groups, or opt into matched calls with people from around the world who share your interests.",
  },
  {
    n: "03",
    title: "Schedule or request a call",
    desc: "Pick a time, request a callback, or let The Operator find a mutual window automatically. No negotiating over text.",
  },
  {
    n: "04",
    title: "Both phones ring",
    desc: "When the moment comes, The Operator dials both of you simultaneously. No one waits. No one is caught off guard.",
  },
  {
    n: "05",
    title: "Both answer? Connected.",
    desc: "If you both pick up, you're connected instantly. If either of you can't answer, there's no voicemail, no awkwardness — just reschedule.",
  },
  {
    n: "06",
    title: "Real conversation happens",
    desc: "That's it. A real phone call between two people who both wanted to talk. The way it should be.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="text-center mb-20">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          How The Operator works
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto">
          Simple idea. Careful execution. Six steps to a real conversation.
        </p>
      </AnimatedSection>

      <div className="relative">
        <div className="absolute left-8 top-0 bottom-0 w-px bg-border hidden md:block" />
        <div className="space-y-12">
          {steps.map((step, i) => (
            <AnimatedSection key={step.n} delay={i * 0.08}>
              <div className="relative md:pl-20">
                <div className="hidden md:flex absolute left-0 top-0 w-16 h-16 items-center justify-center">
                  <div className="w-4 h-4 rounded-full gradient-gold border-4 border-background" />
                </div>
                <div className="bg-card rounded-2xl p-6 border border-border/60">
                  <div className="text-5xl font-heading font-bold text-primary/15 mb-2">{step.n}</div>
                  <h2 className="font-heading font-semibold text-xl text-foreground mb-3">{step.title}</h2>
                  <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </div>
  );
}
