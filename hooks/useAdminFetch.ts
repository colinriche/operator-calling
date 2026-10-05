"use client";

import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * `fetch` against an /api/admin route with the signed-in admin's ID token.
 * Throws an Error carrying the server's message, so a refusal ("This report is
 * resolved…") reaches the admin in the server's own words.
 */
export function useAdminFetch() {
  const { user } = useAuth();

  return useCallback(
    async function adminFetch<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
      if (!user) throw new Error("Please sign in first.");
      const token = await user.getIdToken();
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      return data;
    },
    [user]
  );
}
