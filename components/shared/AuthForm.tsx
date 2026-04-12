"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  getIdToken,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserProfile } from "@/types";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await getIdToken(cred.user);
        document.cookie = `__session=${idToken}; path=/; SameSite=Lax; max-age=3600`;
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profile: Record<string, any> = {
          uid: cred.user.uid,
          email,
          displayName: name,
          role: "user",
          createdAt: new Date(),
          updatedAt: serverTimestamp(),
          callPreferences: {
            availableHours: { start: "09:00", end: "22:00" },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            allowUnknownCalls: false,
          },
          privacy: {
            showOnlineStatus: true,
            allowGroupDiscovery: true,
            blockedUsers: [],
          },
          interests: [],
          completeness: 20,
          notifications: {
            email: true,
            push: true,
            upcomingCallReminder: true,
          },
        };
        await setDoc(doc(db, "users", cred.user.uid), profile);
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/.*?\)/, "").trim());
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const idToken = await getIdToken(cred.user);
      document.cookie = `__session=${idToken}; path=/; SameSite=Lax; max-age=3600`;
      // Create profile if new user
      const userRef = doc(db, "users", cred.user.uid);
      await setDoc(
        userRef,
        {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          photoURL: cred.user.photoURL,
          role: "user",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/.*?\)/, "").trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl p-8 border border-border/60 shadow-xl shadow-foreground/5">
      <h1 className="font-heading font-bold text-2xl text-foreground mb-1">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {mode === "login"
          ? "Sign in to The Operator"
          : "Start talking properly, today."}
      </p>

      {/* Google */}
      <Button
        type="button"
        variant="outline"
        className="w-full mb-4 font-medium"
        onClick={handleGoogle}
        disabled={loading}
      >
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <Label htmlFor="name" className="text-sm font-medium mb-1.5 block">Your name</Label>
            <Input
              id="name"
              type="text"
              placeholder="First name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}

        <div>
          <Label htmlFor="email" className="text-sm font-medium mb-1.5 block">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
            {mode === "login" && (
              <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
            )}
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
        )}

        <Button
          type="submit"
          className="w-full gradient-gold border-0 text-primary-foreground font-semibold"
          disabled={loading}
        >
          {loading ? "Loading..." : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {mode === "login" ? (
          <>Don&apos;t have an account?{" "}<Link href="/signup" className="text-primary hover:underline font-medium">Sign up</Link></>
        ) : (
          <>Already have an account?{" "}<Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link></>
        )}
      </p>
      {mode === "login" && (
        <p className="text-center mt-3">
          <Link href="/admin-login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Admin access
          </Link>
        </p>
      )}
    </div>
  );
}
