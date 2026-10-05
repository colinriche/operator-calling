"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  EMPTY_WAITLIST_DEFAULTS,
  type WaitlistLibraryPayload,
} from "@/lib/waitlist/library";

// ─── The waitlist image and wording library, shared across the admin pages ───
//
// One copy per tab rather than one per component. The spreadsheet can mount a
// picker in dozens of rows, and an image uploaded in one of them has to appear
// in all the others, so the payload lives in a module-level store and every
// subscriber re-renders when any of them reloads it.

const EMPTY: WaitlistLibraryPayload = {
  images: [],
  templates: [],
  defaults: EMPTY_WAITLIST_DEFAULTS,
};

let payload: WaitlistLibraryPayload | null = null;
let inflight: Promise<void> | null = null;
let error: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function fetchLibrary(token: string): Promise<void> {
  try {
    const res = await fetch("/api/admin/waitlist-library", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load the image library");
    payload = data as WaitlistLibraryPayload;
    error = null;
  } catch (err) {
    console.error("[waitlist library]", err);
    error = err instanceof Error ? err.message : "Failed to load the image library";
  } finally {
    inflight = null;
    emit();
  }
}

export function useWaitlistLibrary() {
  const { user } = useAuth();
  const current = useSyncExternalStore(
    subscribe,
    () => payload,
    () => null
  );
  const currentError = useSyncExternalStore(
    subscribe,
    () => error,
    () => null
  );

  const reload = useCallback(async () => {
    if (!user) return;
    // Assigned before the first await, so rows mounting in the same tick share
    // one request instead of each starting their own.
    if (!inflight) inflight = user.getIdToken().then(fetchLibrary);
    await inflight;
  }, [user]);

  useEffect(() => {
    if (user && payload === null && !inflight) void reload();
  }, [user, reload]);

  return {
    library: current ?? EMPTY,
    loaded: current !== null,
    error: currentError,
    reload,
  };
}
