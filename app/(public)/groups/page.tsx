import type { Metadata } from "next";
import Link from "next/link";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Groups & communities" };

const exampleGroups = [
  { emoji: "🏃", name: "Morning Runners London", members: 47, type: "Public" },
  { emoji: "💻", name: "Remote Product Teams", members: 23, type: "Private" },
  { emoji: "🎸", name: "Weekend Guitarists", members: 12, type: "Public" },
  { emoji: "🌍", name: "English–Spanish Exchange", members: 88, type: "Public" },
  { emoji: "📚", name: "Philosophy Reading Circle", members: 19, type: "Private" },
  { emoji: "🎯", name: "Startup Accountability", members: 8, type: "Private" },
];

export default function GroupsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="text-center mb-16">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          Groups built for voice.
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto mb-8">
          Not another group chat. A community where people actually talk to each other.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "gradient-gold border-0 text-primary-foreground font-semibold")}>
            Create a group
          </Link>
          <Link href="/signup" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            Browse groups
          </Link>
        </div>
      </AnimatedSection>

      {/* How groups work */}
      <AnimatedSection className="mb-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: "Admin-first", desc: "Every group has an admin who controls membership, permissions, and call scheduling. No chaos." },
            { title: "Selective calling", desc: "Members only get called by people within the group. No unsolicited calls from outside." },
            { title: "Rotation & scheduling", desc: "Set up regular call windows. The Operator pairs members and rings them at the right moment." },
          ].map((item, i) => (
            <AnimatedSection key={item.title} delay={i * 0.1}>
              <div className="bg-card rounded-2xl p-6 border border-border/60 h-full">
                <h3 className="font-heading font-semibold text-lg text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </AnimatedSection>

      {/* Example groups */}
      <AnimatedSection>
        <h2 className="font-heading font-semibold text-2xl text-foreground mb-6">
          Example communities
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exampleGroups.map((g) => (
            <div key={g.name} className="bg-card rounded-2xl p-5 border border-border/60 hover:border-primary/30 transition-colors">
              <div className="text-3xl mb-3">{g.emoji}</div>
              <h3 className="font-semibold text-foreground mb-1">{g.name}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{g.members} members</span>
                <span>·</span>
                <span>{g.type}</span>
              </div>
            </div>
          ))}
        </div>
      </AnimatedSection>
    </div>
  );
}
