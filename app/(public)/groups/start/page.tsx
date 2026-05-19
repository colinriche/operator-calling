import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";
import { GroupAdminRequestForm } from "@/components/public/GroupAdminRequestForm";
import {
  Shield,
  CalendarClock,
  Users,
  GitBranch,
  Lock,
  Smartphone,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Start a group — The Operator",
  description:
    "Apply to create and manage a private call group on The Operator. Set schedules, pair members, and run regular community calls — hands-free.",
};

export default function StartGroupPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Beta banner */}
      <AnimatedSection>
        <div className="rounded-2xl bg-primary/10 border border-primary/30 px-6 py-5 mb-12 flex items-start gap-4">
          <span className="text-2xl shrink-0 mt-0.5">🧪</span>
          <div>
            <p className="font-heading font-semibold text-foreground mb-1">
              Beta testing phase — approval required
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The Operator is in closed beta. New groups are approved manually so we
              can give each admin proper onboarding support. Once approved, your members
              get access via{" "}
              <strong className="text-foreground">Apple TestFlight</strong> (iOS) or the{" "}
              <strong className="text-foreground">Google Play beta programme</strong>{" "}
              (Android). Both require member email addresses to be registered{" "}
              <em>before</em> they attempt to download.
            </p>
          </div>
        </div>
      </AnimatedSection>

      {/* Hero */}
      <AnimatedSection className="mb-16">
        <h1 className="font-heading font-bold text-4xl sm:text-5xl text-foreground mb-5">
          Start a group on
          <br />
          The Operator
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
          Create a private call group for your team, club, or community. Set a
          schedule, define how members are paired, and let The Operator connect
          people automatically. No missed calls. No awkward timing.
        </p>
      </AnimatedSection>

      {/* What group admins get */}
      <AnimatedSection className="mb-16">
        <h2 className="font-heading font-bold text-2xl text-foreground mb-6">
          What you get as a group admin
        </h2>
        <div className="grid sm:grid-cols-3 gap-5">
          {[
            {
              icon: Users,
              title: "Full membership control",
              desc: "You decide who's in. Invite by email, approve join requests, and remove members at any time.",
            },
            {
              icon: CalendarClock,
              title: "Automated call schedules",
              desc: "Set a recurring schedule — daily, weekly, whenever. The Operator calls members at the right time without any manual action.",
            },
            {
              icon: GitBranch,
              title: "Flexible member pairing",
              desc: "Random pairs, round-robin rotation, or custom rules you define — like matching mentors with mentees.",
            },
          ].map((item, i) => (
            <AnimatedSection key={item.title} delay={i * 0.08}>
              <div className="bg-card rounded-2xl p-5 border border-border/60 h-full">
                <item.icon className="w-7 h-7 text-primary mb-3" />
                <h3 className="font-heading font-semibold text-base text-foreground mb-1.5">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </AnimatedSection>

      {/* Admin flow timeline */}
      <AnimatedSection className="mb-16">
        <h2 className="font-heading font-bold text-2xl text-foreground mb-8">
          How it works — admin flow
        </h2>
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border hidden sm:block" />
          <div className="space-y-6">
            {[
              {
                n: "01",
                title: "Submit this form",
                desc: "Tell us your name, your group's name, who it's for, and the email addresses of your initial members.",
              },
              {
                n: "02",
                title: "We approve & onboard you",
                desc: "We review your request (usually within a few days) and set you up as group admin. Your members' emails are registered in the beta so they can download the app.",
              },
              {
                n: "03",
                title: "Configure your call schedule",
                desc: "Log into your admin dashboard, create a recurring scheduled call, and choose how members are paired when they answer.",
              },
              {
                n: "04",
                title: "Send invites to members",
                desc: "Invite members by email, shareable link, or QR code. They install via TestFlight (iOS) or Play Store beta (Android), sign up, and appear in your group.",
              },
              {
                n: "05",
                title: "Calls run automatically",
                desc: "At the scheduled time The Operator calls everyone simultaneously and pairs up whoever answers. You watch the participation come in — no manual action needed.",
              },
            ].map((step, i) => (
              <AnimatedSection key={step.n} delay={i * 0.07}>
                <div className="relative sm:pl-16">
                  <div className="hidden sm:flex absolute left-0 top-2 w-10 h-10 items-center justify-center">
                    <div className="w-3 h-3 rounded-full gradient-gold border-4 border-background" />
                  </div>
                  <div className="bg-card rounded-2xl p-5 border border-border/60">
                    <span className="text-xs font-heading font-bold text-primary/60 tracking-widest uppercase">
                      {step.n}
                    </span>
                    <h3 className="font-heading font-semibold text-base text-foreground mt-1 mb-1.5">
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* Pairing options */}
      <AnimatedSection className="mb-16">
        <h2 className="font-heading font-bold text-2xl text-foreground mb-2">
          Call pairing options
        </h2>
        <p className="text-muted-foreground mb-6 text-sm">
          When the scheduled time arrives and members answer, The Operator pairs
          them based on rules you set as admin.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              label: "Simple random",
              badge: "Default",
              badgeStyle: "bg-primary/10 text-primary",
              desc: "Any two members who answer are paired at random. Great for mixing conversation partners across a group.",
            },
            {
              label: "Round-robin rotation",
              badge: null,
              badgeStyle: "",
              desc: "A systematic rotation so every member eventually speaks with every other member over time.",
            },
            {
              label: "Custom rules",
              badge: "Coming soon",
              badgeStyle: "bg-muted text-muted-foreground",
              desc: "Pair by role (mentor/mentee), avoid repeating pairs within N sessions, or define your own matching logic.",
            },
          ].map((opt) => (
            <div
              key={opt.label}
              className="bg-card rounded-xl p-4 border border-border/60"
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-heading font-semibold text-sm text-foreground">
                  {opt.label}
                </span>
                {opt.badge && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${opt.badgeStyle}`}
                  >
                    {opt.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {opt.desc}
              </p>
            </div>
          ))}
        </div>
      </AnimatedSection>

      {/* Privacy */}
      <AnimatedSection className="mb-16">
        <div className="bg-card rounded-2xl p-8 border border-border/60">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-6 h-6 text-primary shrink-0" />
            <h2 className="font-heading font-bold text-xl text-foreground">
              Privacy by design
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                icon: Lock,
                title: "No phone numbers exposed",
                desc: "Calls are bridged through The Operator. Members never see each other's phone numbers.",
              },
              {
                icon: Users,
                title: "Closed membership",
                desc: "Your group is private. Members only join via your invite or your explicit approval — no random strangers.",
              },
              {
                icon: Shield,
                title: "You control the data",
                desc: "Member emails are used only to grant beta access. They are never shared, sold, or used for marketing.",
              },
              {
                icon: Smartphone,
                title: "Consent-based calling",
                desc: "The Operator's core mechanic: a call only connects when both people answer. No one is forced into anything.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <item.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground mb-0.5">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* Beta access details */}
      <AnimatedSection className="mb-16">
        <div className="rounded-2xl bg-foreground text-background p-8">
          <h2 className="font-heading font-bold text-xl text-background mb-3">
            Getting your members onto the beta
          </h2>
          <p className="text-background/70 text-sm mb-6 leading-relaxed">
            Members access The Operator through Apple TestFlight or the Google Play
            beta programme during testing. We register their email addresses before
            they download — they&apos;ll see an error if they try to install without
            being registered first.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-background/10 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg"></span>
                <span className="font-heading font-semibold text-background text-sm">
                  iOS — Apple TestFlight
                </span>
              </div>
              <p className="text-xs text-background/70 leading-relaxed">
                Apple&apos;s official beta testing platform. Registered testers get
                an email invite from Apple and install The Operator through the
                TestFlight app. Safe, sandboxed, automatic updates.
              </p>
            </div>
            <div className="rounded-xl bg-background/10 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🤖</span>
                <span className="font-heading font-semibold text-background text-sm">
                  Android — Play Store beta
                </span>
              </div>
              <p className="text-xs text-background/70 leading-relaxed">
                Google Play&apos;s standard beta channel. Testers opt in via a link
                and the app installs like any other Play Store app. Updates arrive
                automatically without needing to re-register.
              </p>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Form */}
      <AnimatedSection>
        <h2 className="font-heading font-bold text-2xl text-foreground mb-2">
          Apply for a group
        </h2>
        <p className="text-muted-foreground mb-8 text-sm">
          Fill in the details below. Include as many member emails as you have — you
          can always add more once your group is approved.
        </p>
        <GroupAdminRequestForm />
      </AnimatedSection>
    </div>
  );
}
