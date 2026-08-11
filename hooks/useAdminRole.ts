"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { AdminRole } from "@/lib/admins";

// ─── The caller's administrative role ────────────────────────────────────────
//
// Asks the server, because the answer lives in the `admins` collection in the
// production data project and no client reads that collection directly — it is
// the permission list.
//
// Replaces reading `profile.role` off the `user` document. That was wrong in
// two ways: the field is writable by paths that should not grant access, and a
// custom-token admin session often has no `user` document at all, so the flag
// silently came back undefined and hid controls from real super admins.
//
// This governs what the UI *offers*. It is not a security boundary — every
// route re-checks server-side, and must keep doing so.

interface AdminRoleState {
  role: AdminRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
}

export function useAdminRole(): AdminRoleState {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authLoading) return;
      if (!user) {
        if (!cancelled) {
          setRole(null);
          setLoading(false);
        }
        return;
      }

      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/admins", {
          headers: { Authorization: `Bearer ${token}` },
        });
        // A 403 is a normal answer here: not an admin.
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setRole(data?.you?.role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return {
    role,
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
    loading,
  };
}
