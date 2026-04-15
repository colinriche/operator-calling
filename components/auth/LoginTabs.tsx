"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AuthForm } from "@/components/shared/AuthForm";
import { PhoneAuthForm } from "@/components/auth/PhoneAuthForm";

export function LoginTabs() {
  return (
    <div className="bg-card rounded-2xl p-8 border border-border/60 shadow-xl shadow-foreground/5">
      <Tabs defaultValue="email">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="email" className="flex-1">
            Email
          </TabsTrigger>
          <TabsTrigger value="phone" className="flex-1">
            Phone
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email">
          {/* AuthForm handles its own card wrapper — we strip it here by
              rendering it without the outer card. AuthForm is self-contained
              so we render it directly and let it use the parent card. */}
          <AuthFormInline mode="login" />
        </TabsContent>

        <TabsContent value="phone">
          <PhoneAuthForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Inline version of the email/password form fields extracted from AuthForm
// so they sit inside the shared card rather than rendering their own card.
// This avoids nested card-in-card and keeps the tab switching clean.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  getIdToken,
} from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  const known: Record<string, string> = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/too-many-requests": "Too many attempts — wait a moment before trying again.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
  };
  if (code && known[code]) return known[code];
  const raw = err instanceof Error ? err.message : "";
  const clean = raw.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/, "").trim();
  return clean || "Something went wrong — please try again.";
}

function AuthFormInline({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingRedirect, setCheckingRedirect] = useState(true);

  const [step, setStep] = useState<"auth" | "phone_prompt">("auth");
  const [signedInUid, setSignedInUid] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);

  async function handlePostSignIn(uid: string) {
    const snap = await getDoc(doc(db, "user", uid));
    const phone = snap.exists() ? (snap.data().phoneNumber as string | undefined) : undefined;
    if (!phone) {
      setSignedInUid(uid);
      setStep("phone_prompt");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  async function handleSavePhone(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError("");
    const cleaned = phoneInput.trim();
    if (!cleaned.startsWith("+") || cleaned.length < 10) {
      setPhoneError("Enter a valid phone number with country code, e.g. +447911123456");
      return;
    }
    if (!signedInUid) return;
    setPhoneSaving(true);
    try {
      await updateDoc(doc(db, "user", signedInUid), {
        phoneNumber: cleaned,
        updatedAt: serverTimestamp(),
      });
      router.push("/dashboard");
    } catch (err) {
      setPhoneError("Failed to save phone number — please try again.");
      console.error(err);
    } finally {
      setPhoneSaving(false);
    }
  }

  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        setLoading(true);
        try {
          const idToken = await getIdToken(result.user);
          document.cookie = `__session=${idToken}; path=/; SameSite=Lax; max-age=3600`;
          await handlePostSignIn(result.user.uid);
        } catch (err) {
          setError(firebaseErrorMessage(err));
          setLoading(false);
        }
      })
      .catch((err) => setError(firebaseErrorMessage(err)))
      .finally(() => setCheckingRedirect(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await getIdToken(cred.user);
      document.cookie = `__session=${idToken}; path=/; SameSite=Lax; max-age=3600`;
      await handlePostSignIn(cred.user.uid);
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(firebaseErrorMessage(err));
      setLoading(false);
    }
  }

  const busy = loading || checkingRedirect;

  if (step === "phone_prompt") {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-foreground mb-1">
            Add your phone number
          </h2>
          <p className="text-sm text-muted-foreground">
            Your phone number links your web account to the Operator mobile app.
            You can skip this and add it later in your profile.
          </p>
        </div>
        <form onSubmit={handleSavePhone} className="space-y-4">
          <div>
            <Label htmlFor="phone-inline" className="text-sm font-medium mb-1.5 block">
              Phone number
            </Label>
            <Input
              id="phone-inline"
              type="tel"
              placeholder="+447911123456"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              autoFocus
            />
          </div>
          {phoneError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {phoneError}
            </p>
          )}
          <Button
            type="submit"
            className="w-full gradient-gold border-0 text-primary-foreground font-semibold"
            disabled={phoneSaving}
          >
            {phoneSaving ? "Saving..." : "Save and continue"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={phoneSaving}
            onClick={() => router.push("/dashboard")}
          >
            Skip for now
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-1">Welcome back</h1>
      <p className="text-sm text-muted-foreground mb-6">Sign in to The Operator</p>

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
        <div>
          <Label htmlFor="email-tab" className="text-sm font-medium mb-1.5 block">Email</Label>
          <Input
            id="email-tab"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="password-tab" className="text-sm font-medium">Password</Label>
            <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
          </div>
          <Input
            id="password-tab"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
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
          {busy ? "Loading..." : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-primary hover:underline font-medium">Sign up</Link>
      </p>
      <p className="text-center mt-3">
        <Link href="/admin-login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Admin access
        </Link>
      </p>
    </div>
  );
}
