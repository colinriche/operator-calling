import type { Metadata } from "next";
import { PublicGroupsBrowser } from "@/components/public/PublicGroupsBrowser";

export const metadata: Metadata = { title: "Browse groups — The Operator" };

export default function GroupsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-10">
        <h1 className="font-heading font-bold text-4xl sm:text-5xl text-foreground mb-3">
          Find your community
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl">
          Browse public groups near you — sport, social, work, education and more.
          Join the ones that fit, or{" "}
          <a href="/signup" className="text-primary hover:underline font-medium">create your own</a>.
        </p>
      </div>
      <PublicGroupsBrowser />
    </div>
  );
}
