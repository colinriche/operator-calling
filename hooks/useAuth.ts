"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/types";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** True when the web account is linked to a mobile app account (has a systemName) */
  isLinked: boolean;
  /** Call after linking to refresh profile state */
  refreshProfile: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLinked, setIsLinked] = useState(false);

  const loadProfile = useCallback(async (u: User) => {
    try {
      // 1. Try direct UID lookup
      const snap = await getDoc(doc(db, "user", u.uid));
      if (snap.exists()) {
        const p = snap.data() as UserProfile;
        setProfile(p);
        setIsLinked(!!(p.systemName || p.linkedSystemName));
        return;
      }

      // 2. UID doc not found — check if a mobile account shares this email
      if (u.email) {
        const emailQ = await getDocs(
          query(collection(db, "user"), where("email", "==", u.email))
        );
        if (!emailQ.empty) {
          const p = emailQ.docs[0].data() as UserProfile;
          setProfile(p);
          setIsLinked(!!(p.systemName || p.linkedSystemName));
          return;
        }
      }

      // 3. Brand new web-only account — no Firestore doc yet
      setProfile(null);
      setIsLinked(false);
    } catch {
      setProfile(null);
      setIsLinked(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadProfile(u);
      } else {
        setProfile(null);
        setIsLinked(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user);
  }, [user, loadProfile]);

  return { user, profile, loading, isLinked, refreshProfile };
}
