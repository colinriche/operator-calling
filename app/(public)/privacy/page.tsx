import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";
import { Shield, EyeOff, Lock, UserX } from "lucide-react";

export const metadata: Metadata = { title: "Privacy & safety" };

const principles = [
  {
    icon: Shield,
    title: "We don't sell your data",
    desc: "Your profile, call history, and preferences are yours. We do not sell, rent, or share personal data with advertisers or third parties.",
  },
  {
    icon: EyeOff,
    title: "Matched calls are private",
    desc: "When you take a call with a stranger, only your first name is shared. No profile links, no social accounts, no way to be found outside The Operator.",
  },
  {
    icon: Lock,
    title: "Groups are controlled spaces",
    desc: "Group admins control who can call whom and when. Private groups are invitation-only. No uninvited connections.",
  },
  {
    icon: UserX,
    title: "Block and report, instantly",
    desc: "One tap blocks any user immediately. Reports are reviewed by group admins and our moderation team within 24 hours.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="text-center mb-20">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          Privacy-first. Always.
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto">
          The Operator is built on the principle that your conversations are yours.
          We're here to connect you — not to monetise you.
        </p>
      </AnimatedSection>

      <div className="grid sm:grid-cols-2 gap-6 mb-16">
        {principles.map((p, i) => (
          <AnimatedSection key={p.title} delay={i * 0.1}>
            <div className="bg-card rounded-2xl p-6 border border-border/60 h-full">
              <div className="w-11 h-11 rounded-xl gradient-gold flex items-center justify-center mb-4">
                <p.icon className="w-5 h-5 text-primary-foreground" />
              </div>
              <h2 className="font-heading font-semibold text-lg text-foreground mb-2">{p.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          </AnimatedSection>
        ))}
      </div>

      <AnimatedSection>
        <div className="bg-foreground text-background rounded-3xl p-8 sm:p-10">
          <h2 className="font-heading font-bold text-2xl mb-4">Safety controls</h2>
          <ul className="space-y-3">
            {[
              "Set precise availability windows — you only ring when you've said you're available",
              "Unknown callers must be matched through opt-in settings — no cold calls",
              "Group admins can restrict call permissions to specific members or roles",
              "All accounts are verified before accessing matched-stranger calls",
              "Super admins can suspend or remove users platform-wide",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-background/80 text-sm leading-relaxed">
                <span className="text-primary mt-0.5 font-bold">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </AnimatedSection>
    </div>
  );
}
