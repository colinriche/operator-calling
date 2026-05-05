"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged, getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Users, Crown, Plus, X, Loader2, MoreHorizontal, Settings, QrCode, LogOut, Trash2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GroupSummary {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  memberCount: number;
  isPrivate: boolean;
  createdAt: string | null;
}

export default function GroupsPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIsPrivate, setNewIsPrivate] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchGroups = useCallback(async (currentUser: { uid: string; getIdToken: () => Promise<string> }) => {
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/groups", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      toast.error("Couldn't load groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);
      fetchGroups(user);
    });
    return unsub;
  }, [fetchGroups, router]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const user = auth.currentUser;
    if (!user) return;
    setCreating(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
          isPrivate: newIsPrivate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Group created!");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewIsPrivate(true);
      router.push(`/dashboard/groups/${data.groupId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setCreating(false);
    }
  }

  async function handleLeave(group: GroupSummary) {
    if (!confirm(`Leave "${group.name}"?`)) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
      const token = await getIdToken(user);
      const res = await fetch(`/api/groups/${group.id}/members/${user.uid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success(`Left ${group.name}.`);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch {
      toast.error("Failed to leave group.");
    }
  }

  async function handleDelete(group: GroupSummary) {
    if (!confirm(`Delete "${group.name}"? This cannot be undone.`)) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
      const token = await getIdToken(user);
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success("Group deleted.");
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch {
      toast.error("Failed to delete group.");
    }
  }

  async function handleCopyInviteLink(group: GroupSummary) {
    const user = auth.currentUser;
    if (!user) return;
    setOpenMenuId(null);
    try {
      const token = await getIdToken(user);
      const res = await fetch("/api/qrinvite/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "group", groupId: group.id, ctx: group.name }),
      });
      const data = await res.json();
      if (!data.publicUrl) throw new Error();
      await navigator.clipboard.writeText(data.publicUrl);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Could not generate invite link.");
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-bold text-3xl text-foreground mb-1">Groups</h1>
          <p className="text-muted-foreground">Communities you belong to.</p>
        </div>
        <Button
          className="gradient-gold border-0 text-primary-foreground font-semibold gap-1.5"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-4 h-4" /> Create group
        </Button>
      </div>

      {/* Create group modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-heading font-bold text-lg text-foreground">Create a group</h2>
                <button
                  onClick={() => { setShowCreate(false); setNewIsPrivate(true); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Group name</Label>
                  <Input
                    placeholder="e.g. Morning Runners"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">
                    Description <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    placeholder="What's this group about?"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Private group</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      New members must be approved by the owner.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewIsPrivate((prev) => !prev)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      newIsPrivate
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {newIsPrivate ? "Private" : "Public"}
                  </button>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowCreate(false); setNewIsPrivate(true); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 gradient-gold border-0 text-primary-foreground font-semibold"
                    disabled={creating || !newName.trim()}
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No groups yet.</p>
          <p className="text-sm mt-1">Create one or accept an invite on the app.</p>
        </div>
      ) : (
        <div className="space-y-3" ref={menuRef}>
          {groups.map((g) => {
            const isAdmin = g.createdBy === uid;
            const isOpen = openMenuId === g.id;

            return (
              <div
                key={g.id}
                className="bg-card rounded-2xl p-5 border border-border/60 flex items-center gap-4"
              >
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-base shrink-0">
                  {g.name[0]?.toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-foreground truncate">{g.name}</p>
                    {isAdmin && <Crown className="w-3.5 h-3.5 text-primary shrink-0" />}
                    {g.isPrivate
                      ? <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                      : <Unlock className="w-3 h-3 text-muted-foreground shrink-0" />}
                  </div>
                  {g.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{g.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                    {" · "}
                    <span className={isAdmin ? "text-primary font-medium" : ""}>
                      {isAdmin ? "Admin" : "Member"}
                    </span>
                  </p>
                </div>

                {/* ⋯ menu */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setOpenMenuId(isOpen ? null : g.id)}
                    className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.1 }}
                        className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[160px]"
                      >
                        {isAdmin ? (
                          <>
                            <Link
                              href={`/dashboard/groups/${g.id}`}
                              onClick={() => setOpenMenuId(null)}
                              className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                              Manage
                            </Link>
                            <button
                              onClick={() => handleCopyInviteLink(g)}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <QrCode className="w-3.5 h-3.5 text-muted-foreground" />
                              Copy invite link
                            </button>
                            <div className="border-t border-border/60" />
                            <button
                              onClick={() => { setOpenMenuId(null); handleDelete(g); }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete group
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => { setOpenMenuId(null); handleLeave(g); }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            Leave group
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
