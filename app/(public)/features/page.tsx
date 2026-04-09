import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";
import { Phone, Users, Calendar, Bell, Shield, Globe, Clock, MessageSquareOff } from "lucide-react";

export const metadata: Metadata = { title: "Features" };

const featureGroups = [
  {
    category: "Calling",
    features: [
      { icon: Phone, name: "Mutual-answer connecting", desc: "Calls only connect when both parties pick up. Zero missed-call anxiety." },
      { icon: Clock, name: "Availability windows", desc: "Set the hours you're open to calls. We only ring when you're ready." },
      { icon: Calendar, name: "Scheduled calls", desc: "Book a call time that works for both of you, confirmed in advance." },
      { icon: Bell, name: "Callback requests", desc: "Ask someone to call you back when they're free — they accept, you both get rung." },
    ],
  },
  {
    category: "Groups & community",
    features: [
      { icon: Users, name: "Group creation", desc: "Create private or open groups around any interest, team, or community." },
      { icon: Globe, name: "Matched stranger calls", desc: "Opt in to calls with people outside your network. Matched by interest, protected by privacy." },
      { icon: MessageSquareOff, name: "Call-first culture", desc: "Groups in The Operator are built around voice, not text threads." },
      { icon: Shield, name: "Admin moderation", desc: "Group admins control membership, permissions, and schedules." },
    ],
  },
  {
    category: "Privacy & safety",
    features: [
      { icon: Shield, name: "No data selling", desc: "Your profile and call history are yours. We don't sell or share them." },
      { icon: Globe, name: "Anonymous matched calls", desc: "Opt-in stranger calls reveal only a first name. You control what's visible." },
      { icon: Users, name: "Block & report", desc: "One tap to block any user, with immediate effect. Reports are reviewed by admins." },
      { icon: Clock, name: "Call-time limits", desc: "Set daily call caps for yourself or your group members." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="text-center mb-20">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          Everything built for voice.
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto">
          Every feature exists to make calling easier, safer, and more human.
          Nothing added for the sake of it.
        </p>
      </AnimatedSection>

      <div className="space-y-16">
        {featureGroups.map((group, gi) => (
          <AnimatedSection key={group.category} delay={gi * 0.1}>
            <h2 className="font-heading font-semibold text-2xl text-foreground mb-6 border-b border-border pb-3">
              {group.category}
            </h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {group.features.map((feat) => (
                <div key={feat.name} className="flex gap-4 p-5 bg-card rounded-2xl border border-border/60 hover:border-primary/30 transition-colors">
                  <div className="shrink-0 w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
                    <feat.icon className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">{feat.name}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        ))}
      </div>
    </div>
  );
}
