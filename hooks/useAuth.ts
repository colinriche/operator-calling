"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/types";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** True when the web account is linked to a mobile app account (has a systemName) */
  isLinked: boolean;
  /** Firestore `user` document backing this session; can differ from Firebase Auth uid for linked accounts. */
  profileDocId: string | null;
  /** Call after linking to refresh profile state */
  refreshProfile: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDocId, setProfileDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLinked, setIsLinked] = useState(false);

  const loadProfile = useCallback(async (u: User) => {
    try {
      // 1. Try direct UID lookup
      const snap = await getDoc(doc(db, "user", u.uid));
      if (snap.exists()) {
        const p = snap.data() as UserProfile;
        if (p.archived === true) {
          await signOut(auth);
          return;
        }
        setProfile(p);
        setProfileDocId(snap.id);
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
          if (p.archived === true) {
            await signOut(auth);
            return;
          }
          setProfile(p);
          setProfileDocId(emailQ.docs[0].id);
          setIsLinked(!!(p.systemName || p.linkedSystemName));
          return;
        }
      }

      // 3. Post-link fallback — the web doc was deleted; find the app doc that
      //    recorded this web UID during the merge.
      const linkedQ = await getDocs(
        query(collection(db, "user"), where("linkedWebUid", "==", u.uid))
      );
      if (!linkedQ.empty) {
        const docSnap = linkedQ.docs[0];
        const p = docSnap.data() as UserProfile;
        if (p.archived === true) {
          await signOut(auth);
          return;
        }
        setProfile(p);
        setProfileDocId(docSnap.id);
        setIsLinked(!!(p.systemName || p.linkedSystemName));
        return;
      }

      // 4. Brand new web-only account — no Firestore doc yet
      setProfile(null);
      setProfileDocId(null);
      setIsLinked(false);
    } catch {
      setProfile(null);
      setProfileDocId(null);
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
        setProfileDocId(null);
        setIsLinked(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user);
  }, [user, loadProfile]);

  return { user, profile, loading, isLinked, profileDocId, refreshProfile };
}
