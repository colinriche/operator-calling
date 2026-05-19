import type { Metadata } from "next";
import Link from "next/link";
import { PublicGroupsBrowser } from "@/components/public/PublicGroupsBrowser";

export const metadata: Metadata = { title: "Browse groups — The Operator" };

export default function GroupsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl text-foreground mb-3">
            Find your community
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl">
            Browse public groups near you — sport, social, work, education and more.
            Join the ones that fit, or create your own.
          </p>
        </div>
        <div className="shrink-0">
          <Link
            href="/groups/start"
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Start a group →
          </Link>
        </div>
      </div>
      <PublicGroupsBrowser />
    </div>
  );
}
