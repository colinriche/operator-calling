import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Groups" };

const groups = [
  { name: "Morning Runners", members: 12, role: "Member", emoji: "🏃" },
  { name: "Remote Product Team", members: 5, role: "Admin", emoji: "💻" },
  { name: "Philosophy Circle", members: 8, role: "Member", emoji: "📚" },
];

export default function GroupsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Groups</h1>
          <p className="text-muted-foreground">Communities you belong to.</p>
        </div>
        <Link
          href="/admin"
          className="text-sm px-4 py-2 rounded-xl gradient-gold text-primary-foreground font-semibold"
        >
          + Create group
        </Link>
      </div>

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.name} className="bg-card rounded-2xl p-5 border border-border/60 flex items-center gap-4">
            <span className="text-3xl">{g.emoji}</span>
            <div className="flex-1">
              <p className="font-semibold text-foreground">{g.name}</p>
              <p className="text-xs text-muted-foreground">{g.members} members</p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${g.role === "Admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {g.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
