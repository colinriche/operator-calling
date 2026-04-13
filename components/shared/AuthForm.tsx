"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  getIdToken,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthFormProps {
  mode: "login" | "signup";
}

function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  const raw = err instanceof Error ? err.message : "";

  const known: Record<string, string> = {
    "auth/email-already-in-use": "That email is already registered — try signing in instead.",
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/weak-password": "Password is too weak — try something longer.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/too-many-requests": "Too many attempts — wait a moment before trying again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/unauthorized-domain":
      "This domain isn't authorised for sign-in. Add it to Firebase Console → Authentication → Authorized domains.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
    "auth/operation-not-allowed": "This sign-in method isn't enabled. Contact support.",
    "auth/user-disabled": "This account has been disabled.",
    "permission-denied": "Firestore permission denied — security rules are blocking the request.",
  };

  if (code && known[code]) return `${known[code]} [${code}]`;

  // Strip Firebase boilerplate, keep the human-readable part
  const clean = raw.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/, "").trim();
  if (clean && clean !== "Error") return code ? `${clean} [${code}]` : clean;

  return code ? `Something went wrong. [${code}]` : "Something went wrong — please try again.";
}

async function writeGoogleProfile(uid: string, displayName: string | null, email: string | null, photoURL: string | null) {
  try {
    await setDoc(
      doc(db, "user", uid),
      {
        uid,
        email,
        displayName,
        name: displayName,
        photoURL,
        role: "user",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("Google profile write failed (non-fatal):", err);
  }
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingRedirect, setCheckingRedirect] = useState(true);

  // Handle the return trip from signInWithRedirect
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return; // Normal page load, no redirect pending
        setLoading(true);
        try {
          const idToken = await getIdToken(result.user);
          document.cookie = `__session=${idToken}; path=/; SameSite=Lax; max-age=3600`;
          await writeGoogleProfile(
            result.user.uid,
            result.user.displayName,
            result.user.email,
            result.user.photoURL
          );
          router.push("/dashboard");
        } catch (err) {
          console.error("Post-redirect error:", err, "| code:", (err as { code?: string }).code);
          setError(firebaseErrorMessage(err));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("getRedirectResult error:", err, "| code:", (err as { code?: string }).code);
        setError(firebaseErrorMessage(err));
      })
      .finally(() => setCheckingRedirect(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await getIdToken(cred.user);
        document.cookie = `__session=${idToken}; path=/; SameSite=Lax; max-age=3600`;
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const idToken = await getIdToken(cred.user);
        document.cookie = `__session=${idToken}; path=/; SameSite=Lax; max-age=3600`;
        // Non-fatal — user is already authenticated if this fails
        try {
          await setDoc(doc(db, "user", cred.user.uid), {
            uid: cred.user.uid,
            email,
            displayName: name,
            name,
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
          });
        } catch (profileErr) {
          console.warn("Profile write failed (non-fatal):", profileErr, "| code:", (profileErr as { code?: string }).code);
        }
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      console.error("Auth error:", err, "| code:", (err as { code?: string }).code);
      setError(firebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
      // Browser navigates away — nothing below this runs
    } catch (err: unknown) {
      console.error("Google redirect error:", err, "| code:", (err as { code?: string }).code);
      setError(firebaseErrorMessage(err));
      setLoading(false);
    }
  }

  const busy = loading || checkingRedirect;

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
        disabled={busy}
      >
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {checkingRedirect ? "Checking..." : "Continue with Google"}
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

        {mode === "signup" && (
          <div>
            <Label htmlFor="confirmPassword" className="text-sm font-medium mb-1.5 block">
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg break-words">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full gradient-gold border-0 text-primary-foreground font-semibold"
          disabled={busy}
        >
          {busy ? "Loading..." : mode === "login" ? "Sign in" : "Create account"}
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
