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
      const hasLinkedMarker = (p: UserProfile, uid: string) => {
        const aliases = (p as UserProfile & { linkedWebUids?: unknown }).linkedWebUids;
        return Boolean(
          p.systemName ||
          p.linkedSystemName ||
          p.linkedWebUid === uid ||
          (Array.isArray(aliases) && aliases.includes(uid))
        );
      };

      const applyProfile = async (docId: string, p: UserProfile, linked: boolean) => {
        if (p.archived === true) {
          await signOut(auth);
          return true;
        }
        setProfile(p);
        setProfileDocId(docId);
        setIsLinked(linked);
        return true;
      };

      // 1. Prefer explicit alias links. Phone auth can create a new Firebase UID,
      // so linked accounts may not live at user/{auth.uid}.
      const linkedArrayQ = await getDocs(
        query(collection(db, "user"), where("linkedWebUids", "array-contains", u.uid))
      );
      if (!linkedArrayQ.empty) {
        const docSnap = linkedArrayQ.docs[0];
        const p = docSnap.data() as UserProfile;
        if (await applyProfile(docSnap.id, p, true)) return;
      }

      const linkedQ = await getDocs(
        query(collection(db, "user"), where("linkedWebUid", "==", u.uid))
      );
      if (!linkedQ.empty) {
        const docSnap = linkedQ.docs[0];
        const p = docSnap.data() as UserProfile;
        if (await applyProfile(docSnap.id, p, true)) return;
      }

      // 1. Try direct UID lookup
      const snap = await getDoc(doc(db, "user", u.uid));
      if (snap.exists()) {
        const p = snap.data() as UserProfile;
        const aliases = (p as UserProfile & { linkedWebUids?: unknown }).linkedWebUids;
        const directLooksLikeStub = !(
          p.systemName ||
          p.linkedSystemName ||
          p.linkedWebUid ||
          aliases ||
          p.role ||
          p.displayName ||
          p.name ||
          p.phoneNumber
        );
        if (!directLooksLikeStub) {
          if (await applyProfile(snap.id, p, hasLinkedMarker(p, u.uid))) return;
        }
      }

      // 2. UID doc not found, or only an email-only stub exists — check if a
      // mobile account shares this email.
      // Finding a doc by email alone does NOT mean accounts are linked — the mobile
      // user doc has systemName set for all app users. Only treat as linked if the
      // explicit merge has been done (linkedWebUid matches or linkedSystemName set).
      if (u.email) {
        const emailQ = await getDocs(
          query(collection(db, "user"), where("email", "==", u.email))
        );
        if (!emailQ.empty) {
          const docSnap = emailQ.docs.find((candidate) =>
            hasLinkedMarker(candidate.data() as UserProfile, u.uid)
          ) ?? emailQ.docs[0];
          const p = docSnap.data() as UserProfile;
          if (p.archived === true) {
            await signOut(auth);
            return;
          }
          setProfile(p);
          setProfileDocId(docSnap.id);
          setIsLinked(hasLinkedMarker(p, u.uid));
          return;
        }
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
