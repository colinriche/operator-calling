"use client";

import { motion } from "framer-motion";
import { Clock, Shield, Users, Phone, Bell, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedSection } from "./AnimatedSection";
import {
  sectionContainer,
  sectionGridGap,
  sectionHeading,
  sectionHeadingGap,
  sectionPadding,
} from "./section-layout";

const features = [
  {
    id: "known",
    icon: Phone,
    title: "Calls with people you know",
    description:
      "Stay connected with friends, family, or colleagues through voice calls — scheduled when it actually works for both of you.",
  },
  {
    id: "strangers",
    icon: Users,
    title: "Unexpected calls with people you don't",
    description:
      "Opt into privacy-first calls with people from around the world. Same interests, different lives. Real conversation.",
  },
  {
    id: "both-answer",
    icon: Clock,
    title: "Only connects when both answer",
    description:
      "No more awkward missed calls. The Operator dials both parties simultaneously — only connecting when you're both ready.",
  },
  {
    id: "schedule",
    icon: Calendar,
    title: "Schedule calls at the right moment",
    description:
      "Set your availability windows. We'll find a time that works for both of you, automatically.",
  },
  {
    id: "callback",
    icon: Bell,
    title: "Callback without the awkward timing",
    description:
      "Request a callback. When the other person is free, they accept. Zero pressure, smooth connection.",
  },
  {
    id: "privacy",
    icon: Shield,
    title: "Privacy-first by design",
    description:
      "No profile scraping. No data selling. Your calls are between you and the person you're talking to.",
  },
];

export type FeatureId = (typeof features)[number]["id"];

interface FeatureSectionsProps {
  /**
   * Which cards to show, in this order. Omitted means all six, which is what
   * the homepage renders — so this prop cannot change that page by accident.
   *
   * The waitlist passes a subset because two of the six argue against each
   * other depending on who is reading: "calls with people you know" and
   * "unexpected calls with people you don't" are the same product described to
   * opposite audiences.
   */
  ids?: readonly string[];
  /** Waitlist scale rather than homepage scale. See ./section-layout. */
  compact?: boolean;
}

export function FeatureSections({ ids, compact }: FeatureSectionsProps = {}) {
  const shown = ids
    ? (ids.map((id) => features.find((f) => f.id === id)).filter((f) => f !== undefined))
    : features;

  return (
    <section className={cn(sectionPadding(compact), "bg-muted/40")}>
      <div className={sectionContainer(compact)}>
        <AnimatedSection className={cn("text-center", sectionHeadingGap(compact))}>
          <h2 className={cn("font-heading font-bold text-foreground mb-4", sectionHeading(compact))}>
            Built for real conversation
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Every feature in The Operator exists to make calling easier, less pressured, and more human.
          </p>
        </AnimatedSection>

        <div
          className={cn(
            "grid sm:grid-cols-2",
            compact ? "" : "lg:grid-cols-3",
            sectionGridGap(compact)
          )}
        >
          {shown.map((feat, i) => (
            <AnimatedSection key={feat.title} delay={i * 0.08}>
              <div className="group bg-card rounded-2xl p-6 border border-border/60 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 h-full">
                <div className="w-11 h-11 rounded-xl gradient-gold flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <feat.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="font-heading font-semibold text-lg text-foreground mb-2">{feat.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feat.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WhyCallingSection({ compact }: { compact?: boolean } = {}) {
  return (
    <section className={sectionPadding(compact)}>
      <div className={sectionContainer(compact)}>
        <div className={cn("grid lg:grid-cols-2 items-center", compact ? "gap-10" : "gap-16")}>
          {/* Visual */}
          <AnimatedSection>
            <div className="relative">
              <div className="rounded-3xl bg-foreground p-8 text-background">
                <div className="space-y-3 mb-6">
                  {[
                    { sender: "them", text: "can you call?" },
                    { sender: "you", text: "sure, calling now" },
                    { sender: "them", text: "missed it, sorry" },
                    { sender: "you", text: "no worries, try again?" },
                    { sender: "them", text: "ok calling" },
                    { sender: "you", text: "missed that one too 😅" },
                  ].map((msg, i) => (
                    <motion.div
                      key={i}
                      className={`flex ${msg.sender === "you" ? "justify-end" : "justify-start"}`}
                      initial={{ opacity: 0, x: msg.sender === "you" ? 20 : -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.15 }}
                    >
                      <span
                        className={`px-3 py-1.5 rounded-2xl text-sm max-w-[80%] ${
                          msg.sender === "you"
                            ? "bg-background/10 text-background"
                            : "bg-background/20 text-background"
                        }`}
                      >
                        {msg.text}
                      </span>
                    </motion.div>
                  ))}
                </div>
                <div className="border-t border-background/10 pt-4 text-background/60 text-xs text-center">
                  That's 15 minutes wasted. Call never happened.
                </div>
              </div>

              <div className="mt-4 rounded-3xl gradient-gold p-8 text-primary-foreground">
                <div className="text-center">
                  <div className="font-heading font-bold text-3xl mb-2">5 minutes.</div>
                  <div className="text-primary-foreground/80 text-sm">
                    With The Operator, both sides answer, both sides connect. That's it.
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>

          {/* Copy */}
          <AnimatedSection delay={0.2}>
            <span className="text-primary font-semibold text-sm uppercase tracking-widest mb-4 block">
              The case for calling
            </span>
            <h2
              className={cn(
                "font-heading font-bold text-foreground mb-6 leading-tight",
                sectionHeading(compact)
              )}
            >
              A 5-minute call beats a hundred messages.
            </h2>
            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
              Tone gets lost in text. Context gets lost in threads. Misunderstandings pile up.
              A real conversation — even a short one — resolves all of that.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              The Operator is built for the people who already know this, and just need
              a better way to actually make it happen.
            </p>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}

export function HowConnectingWorksSection({ compact }: { compact?: boolean } = {}) {
  const steps = [
    { n: "01", title: "You both indicate readiness", desc: "Set your availability window or request a callback. No guessing." },
    { n: "02", title: "The Operator dials both sides", desc: "When the timing works, both phones ring simultaneously." },
    { n: "03", title: "Both answer? Connected.", desc: "If either side doesn't pick up, no awkward voicemail — just try again later." },
  ];

  return (
    <section className={cn(sectionPadding(compact), "bg-foreground text-background")}>
      <div className={sectionContainer(compact)}>
        <AnimatedSection className={cn("text-center", sectionHeadingGap(compact))}>
          <h2 className={cn("font-heading font-bold mb-4", sectionHeading(compact))}>
            Only connects when{" "}
            <span className="gradient-text-gold">both answer.</span>
          </h2>
          <p className="text-lg text-background/70 max-w-xl mx-auto">
            No pressure. No missed calls. No awkward voicemails. Just clean, mutual connection.
          </p>
        </AnimatedSection>

        <div className={cn("grid md:grid-cols-3", sectionGridGap(compact))}>
          {steps.map((step, i) => (
            <AnimatedSection key={step.n} delay={i * 0.1}>
              <div className="relative">
                <div className="text-6xl font-heading font-bold text-background/10 mb-4">{step.n}</div>
                <div className="absolute top-0 left-0 w-8 h-0.5 gradient-gold mt-7" />
                <h3 className="font-heading font-semibold text-xl text-background mb-3 mt-2">
                  {step.title}
                </h3>
                <p className="text-background/60 leading-relaxed">{step.desc}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
