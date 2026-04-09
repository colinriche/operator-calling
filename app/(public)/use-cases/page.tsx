import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";

export const metadata: Metadata = { title: "Use cases" };

const cases = [
  {
    emoji: "🏢",
    title: "Remote teams",
    desc: "Replace Slack noise with scheduled voice check-ins. Get your team actually talking — without the meeting overhead.",
    scenarios: ["Weekly 1-to-1s with direct reports", "Spontaneous collaboration without scheduling nightmares", "Async availability matching across timezones"],
  },
  {
    emoji: "🤝",
    title: "Accountability partners",
    desc: "Check in, stay honest, make progress. Weekly calls with someone who's committed to the same goals.",
    scenarios: ["Fitness & health goals", "Writing or creative projects", "Business or startup founders"],
  },
  {
    emoji: "🌍",
    title: "Language exchange",
    desc: "Practice with native speakers without the awkwardness of cold-calling strangers through other apps.",
    scenarios: ["Matched by target language", "Scheduled weekly sessions", "Progress tracked over time"],
  },
  {
    emoji: "👨‍👩‍👧",
    title: "Family & friends",
    desc: "Stop relying on someone always being available at the right time. Schedule a proper catch-up and show up for each other.",
    scenarios: ["Regular grandparent check-ins", "Friend groups across cities", "Staying close with people who've moved abroad"],
  },
  {
    emoji: "🎯",
    title: "Clubs & hobbies",
    desc: "Running clubs. Book groups. Guitar circles. Bring the conversation that usually happens on WhatsApp into voice.",
    scenarios: ["Post-run debrief calls", "Between-session check-ins", "Member rotation so everyone connects"],
  },
  {
    emoji: "💼",
    title: "Professional networking",
    desc: "Meaningful 1-to-1 connections, not LinkedIn messages that go nowhere. Scheduled, mutual, and real.",
    scenarios: ["Industry introduction calls", "Mentorship connections", "Peer-to-peer knowledge sharing"],
  },
];

export default function UseCasesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="text-center mb-20">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          Who The Operator is for.
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto">
          Anyone who believes a real conversation is worth more than a hundred messages.
        </p>
      </AnimatedSection>

      <div className="grid md:grid-cols-2 gap-8">
        {cases.map((c, i) => (
          <AnimatedSection key={c.title} delay={i * 0.08}>
            <div className="bg-card rounded-2xl p-7 border border-border/60 h-full hover:border-primary/30 transition-colors">
              <div className="text-4xl mb-4">{c.emoji}</div>
              <h2 className="font-heading font-semibold text-xl text-foreground mb-2">{c.title}</h2>
              <p className="text-muted-foreground leading-relaxed mb-5">{c.desc}</p>
              <ul className="space-y-2">
                {c.scenarios.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-0.5">→</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </AnimatedSection>
        ))}
      </div>
    </div>
  );
}
