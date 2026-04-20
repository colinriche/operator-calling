"use client";

import Link from "next/link";
import { useDashboardData } from "@/hooks/useDashboardData";

export function GroupsPageContent() {
  const { loading, error, groups } = useDashboardData();

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

      {loading && (
        <div className="bg-card rounded-2xl p-4 border border-border/60 text-sm text-muted-foreground">
          Loading groups...
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="bg-card rounded-2xl p-4 border border-border/60 text-sm text-muted-foreground">
          No groups yet. Join or create a group to see it here.
        </div>
      )}

      <div className="space-y-3">
        {!loading &&
          groups.map((group) => (
            <div key={group.id} className="bg-card rounded-2xl p-5 border border-border/60 flex items-center gap-4">
              <span className="w-11 h-11 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold">
                {group.name[0]}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{group.name}</p>
                <p className="text-xs text-muted-foreground">{group.members} members</p>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  group.role === "Admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {group.role}
              </span>
            </div>
          ))}
      </div>

      {error && (
        <p className="text-xs text-destructive mt-4">
          Could not load groups: {error}
        </p>
      )}
    </div>
  );
}
