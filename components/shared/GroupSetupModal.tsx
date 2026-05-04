"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Briefcase,
  GraduationCap,
  Dumbbell,
  Users,
  Search,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicGroup {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
  type: string;
}

interface CategoryConfig {
  type: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  placeholder: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    type: "work",
    label: "Work",
    icon: <Briefcase className="w-5 h-5" />,
    color: "text-purple-600",
    placeholder: "Search by company name…",
  },
  {
    type: "college",
    label: "College",
    icon: <GraduationCap className="w-5 h-5" />,
    color: "text-amber-700",
    placeholder: "Search by college or university…",
  },
  {
    type: "sport",
    label: "Sport",
    icon: <Dumbbell className="w-5 h-5" />,
    color: "text-orange-500",
    placeholder: "Search by sport or club…",
  },
  {
    type: "social",
    label: "Social",
    icon: <Users className="w-5 h-5" />,
    color: "text-pink-600",
    placeholder: "Search by group name…",
  },
];

// ─── Single category section ──────────────────────────────────────────────────

function CategorySection({ cat }: { cat: CategoryConfig }) {
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDocs(
      query(
        collection(db, "groups"),
        where("type", "==", cat.type),
        where("isPrivate", "==", false)
      )
    )
      .then((snap) => {
        if (cancelled) return;
        setGroups(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name ?? "",
            description: d.data().description ?? "",
            memberCount: d.data().memberCount ?? (d.data().memberIds?.length ?? 0),
            type: d.data().type ?? cat.type,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [cat.type]);

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleJoin = useCallback(
    async (groupId: string) => {
      setJoining(groupId);
      setError("");
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/groups/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ groupId }),
        });
        if (res.ok) {
          setJoined((prev) => new Set(prev).add(groupId));
        } else {
          const data = await res.json();
          setError(data.error ?? "Failed to join group.");
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setJoining(null);
      }
    },
    []
  );

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 font-semibold text-sm ${cat.color}`}>
        {cat.icon}
        {cat.label}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading groups…
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-1">
          No public {cat.label.toLowerCase()} groups available yet — check back soon.
        </p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-8 text-sm"
              placeholder={cat.placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">No results for &quot;{search}&quot;</p>
            ) : (
              filtered.map((g) => {
                const isJoined = joined.has(g.id);
                const isJoining = joining === g.id;
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 bg-card/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      {g.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {g.description}
                        </p>
                      )}
                    </div>
                    {isJoined ? (
                      <div className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        Joined
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        disabled={isJoining}
                        onClick={() => handleJoin(g.id)}
                      >
                        {isJoining ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          "Join"
                        )}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface GroupSetupModalProps {
  open: boolean;
  onClose: () => void;
}

export function GroupSetupModal({ open, onClose }: GroupSetupModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up your groups</DialogTitle>
          <DialogDescription>
            Join public groups for your workplace, college, sport, and social
            life. Once joined, you can share QR invite codes directly from the
            app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {CATEGORIES.map((cat) => (
            <CategorySection key={cat.type} cat={cat} />
          ))}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Don&apos;t see your group?{" "}
            <a
              href="/groups"
              className="underline hover:text-foreground transition-colors"
              target="_blank"
            >
              Browse all groups
            </a>
          </p>
          <Button onClick={onClose} className="gradient-gold border-0 text-primary-foreground">
            Done
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
