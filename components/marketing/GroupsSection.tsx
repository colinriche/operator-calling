"use client";

import { AnimatedSection } from "./AnimatedSection";
import { Users, Lock, Settings } from "lucide-react";

const useCases = [
  { icon: "🏃", label: "Running clubs" },
  { icon: "💻", label: "Remote teams" },
  { icon: "🎸", label: "Hobby groups" },
  { icon: "🌍", label: "Language partners" },
  { icon: "🏢", label: "Corporate circles" },
  { icon: "🤝", label: "Support networks" },
  { icon: "📚", label: "Study groups" },
  { icon: "🎯", label: "Accountability buddies" },
];

const testimonials = [
  {
    quote:
      "We replaced our weekly Slack back-and-forth with a 10-minute group call every Friday. Completely transformed how our remote team feels connected.",
    name: "Sarah K.",
    role: "Engineering Lead",
  },
  {
    quote:
      "I was sceptical about calling strangers, but the matched calls are honestly some of the best conversations I've had this year.",
    name: "Marcus T.",
    role: "Writer & traveller",
  },
  {
    quote:
      "The 'both must answer' mechanic is genius. Zero anxiety about missing calls. Zero awkward voicemails.",
    name: "Priya N.",
    role: "Product designer",
  },
];

export function GroupsSection() {
  return (
    <section className="py-24 bg-muted/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <h2 className="font-heading font-bold text-4xl sm:text-5xl text-foreground mb-4">
            Community starts with a conversation.
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Create or join groups. Set schedules. Let The Operator connect members one-to-one,
            on rotation, or by availability.
          </p>
        </AnimatedSection>

        {/* Group features */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: Users,
              title: "Admin-controlled groups",
              desc: "Group admins control who can call whom, when, and how often.",
            },
            {
              icon: Lock,
              title: "Private by default",
              desc: "No strangers in your group unless you approve them. Your community, your rules.",
            },
            {
              icon: Settings,
              title: "Flexible scheduling",
              desc: "Set allowed call windows, rotation patterns, and member permissions.",
            },
          ].map((item, i) => (
            <AnimatedSection key={item.title} delay={i * 0.1}>
              <div className="bg-card rounded-2xl p-6 border border-border/60 h-full">
                <item.icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-heading font-semibold text-lg text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* Use case tags */}
        <AnimatedSection className="flex flex-wrap gap-3 justify-center">
          {useCases.map(({ icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border/60 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-default"
            >
              {icon} {label}
            </span>
          ))}
        </AnimatedSection>
      </div>
    </section>
  );
}

export function TestimonialsSection() {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <h2 className="font-heading font-bold text-4xl sm:text-5xl text-foreground mb-4">
            What people are saying
          </h2>
        </AnimatedSection>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <AnimatedSection key={t.name} delay={i * 0.1}>
              <div className="bg-card rounded-2xl p-6 border border-border/60 h-full flex flex-col">
                <blockquote className="text-foreground leading-relaxed flex-1 mb-6">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-xs">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCTASection() {
  return (
    <section className="py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <AnimatedSection>
          <div className="rounded-3xl gradient-gold p-12 sm:p-16 shadow-2xl shadow-primary/20">
            <h2 className="font-heading font-bold text-4xl sm:text-5xl text-primary-foreground mb-4">
              Ready to talk properly?
            </h2>
            <p className="text-primary-foreground/80 text-lg mb-8 max-w-xl mx-auto">
              Voice first. Pressure off. Real conversation, better timed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/signup"
                className="inline-flex items-center justify-center px-8 h-12 rounded-xl bg-primary-foreground text-primary font-heading font-semibold text-base hover:bg-primary-foreground/90 transition-colors"
              >
                Get started free
              </a>
              <a
                href="/download"
                className="inline-flex items-center justify-center px-8 h-12 rounded-xl border-2 border-primary-foreground/40 text-primary-foreground font-heading font-semibold text-base hover:border-primary-foreground/70 transition-colors"
              >
                Download the app
              </a>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
