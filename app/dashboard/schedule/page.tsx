import type { Metadata } from "next";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-heading font-bold text-3xl text-foreground mb-2">Schedule a call</h1>
      <p className="text-muted-foreground mb-8">Find a time that works for both of you.</p>

      <div className="bg-card rounded-2xl p-6 border border-border/60">
        <p className="text-sm text-muted-foreground text-center py-8">
          Scheduling UI — enter a contact, choose a window, and The Operator finds the mutual time.
        </p>
      </div>
    </div>
  );
}
