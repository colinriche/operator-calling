"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  OAuthProvider,
  RecaptchaVerifier,
  getAdditionalUserInfo,
  signInWithPhoneNumber,
  signOut,
  signInWithPopup,
  updateProfile,
  type AdditionalUserInfo,
  type ConfirmationResult,
  type User,
  type UserCredential,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markSignedIn, markSignedOut } from "@/lib/session-cookie";
import { decideFederatedSignIn, PHONE_FIRST_MESSAGE } from "@/lib/auth-linking";
import {
  APPLE_PROVIDER_ID,
  appleErrorMessage,
  appleIdentity,
  appleProfileFields,
} from "@/lib/apple-signin";

interface SignInChoicesProps {
  mode: "login" | "signup";
  inviteRef?: string;
  inviteGid?: string;
  nextPath?: string;
}

type Step = "choose" | "otp" | "add_email" | "add_name";
type Tab = "phone" | "other";
type Method = "google" | "phone" | "apple";

function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  const known: Record<string, string> = {
    "auth/invalid-phone-number": "That doesn't look like a valid phone number.",
    "auth/missing-phone-number": "Please enter your phone number.",
    "auth/too-many-requests": "Too many attempts - wait a moment before trying again.",
    "auth/code-expired": "The verification code has expired. Please request a new one.",
    "auth/invalid-verification-code": "Incorrect code - please check and try again.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/network-request-failed": "Network error - check your connection and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/operation-not-allowed": "This sign-in method isn't enabled. Contact support.",
    "auth/captcha-check-failed":
      "reCAPTCHA check failed - the domain may not be authorised. Add operatorcalling.com to Firebase Console → Authentication → Authorized domains.",
    "auth/unauthorized-domain":
      "This domain isn't authorised for sign-in. Add operatorcalling.com to Firebase Console → Authentication → Authorized domains.",
  };
  if (code && known[code]) return `${known[code]} [${code}]`;
  const raw = err instanceof Error ? err.message : "";
  const clean = raw.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/, "").trim();
  const meaningful = clean && clean.toLowerCase() !== "error" ? clean : "Something went wrong - please try again.";
  return code ? `${meaningful} [${code}]` : meaningful;
}

function isValidPhone(value: string) {
  return value.startsWith("+") && value.replace(/\D/g, "").length >= 8;
}

/** Defaults a brand new web account starts with (same as the old email signup). */
function newAccountDefaults() {
  return {
    role: "user",
    createdAt: new Date(),
    updatedAt: serverTimestamp(),
    callPreferences: {
      availableHours: { start: "09:00", end: "22:00" },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      allowUnknownCalls: false,
    },
    privacy: { showOnlineStatus: true, allowGroupDiscovery: true, blockedUsers: [] },
    interests: [],
    completeness: 20,
    notifications: { email: true, push: true, upcomingCallReminder: true },
  };
}

const optionButton = "w-full h-10 font-medium";

export function SignInChoices({ mode, inviteRef = "", inviteGid = "", nextPath = "/dashboard" }: SignInChoicesProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [phoneInput, setPhoneInput] = useState("");
  const [otp, setOtp] = useState("");
  const [extraInput, setExtraInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState<User | null>(null);
  const [knownPhone, setKnownPhone] = useState("");
  const [tab, setTab] = useState<Tab>("phone");

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
    };
  }, []);

  function resetRecaptcha() {
    recaptchaRef.current?.clear();
    recaptchaRef.current = null;
  }

  async function processInvite(user: User, phone: string) {
    if (!inviteRef || !phone) return;
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/invite/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          inviterUsername: inviteRef,
          groupId: inviteGid || undefined,
          inviteeUid: user.uid,
          inviteePhone: phone,
        }),
      });
    } catch (err) {
      console.warn("Invite processing failed (non-fatal):", err);
    }
  }

  /**
   * Runs after every successful sign-in. An existing account goes straight on.
   * A new one is created here, then asked for the one optional detail the
   * chosen method did not already give us.
   */
  async function afterSignIn(user: User, method: Method, info?: AdditionalUserInfo | null) {
    markSignedIn();

    // Apple: the address may be Apple's private relay, and the name is only sent
    // the first time. See lib/apple-signin.ts.
    const apple =
      method === "apple"
        ? appleIdentity(user, (info?.profile ?? null) as Record<string, unknown> | null)
        : null;

    let isNew = false;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/account/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { status?: string };
        isNew = data.status === "unresolved";
      }
    } catch {
      /* unknown - treat as existing so nobody's profile is overwritten */
    }

    if (!isNew) {
      router.push(nextPath);
      return;
    }

    const name = user.displayName ?? "";
    try {
      await setDoc(
        doc(db, "user", user.uid),
        {
          uid: user.uid,
          ...(user.email ? { email: user.email } : {}),
          ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
          ...(name ? { displayName: name, name } : {}),
          ...(user.photoURL ? { photoURL: user.photoURL } : {}),
          ...(apple ? appleProfileFields(apple) : {}),
          ...newAccountDefaults(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("Profile write failed (non-fatal):", err, "| code:", (err as { code?: string }).code);
    }

    if (method === "phone") {
      await processInvite(user, user.phoneNumber ?? "");
    }

    setNewUser(user);
    setKnownPhone(user.phoneNumber ?? "");
    // Only phone reaches here for a brand new account (see rejectUnlinked); a
    // Google/Apple user that gets here already existed.
    setStep(method === "phone" ? "add_email" : "add_name");
  }

  /**
   * Google/Apple must never be how a second Operator account gets made. If this
   * sign-in just created a Firebase user with no phone attached, undo it and
   * send the person to phone sign-in first.
   */
  async function rejectUnlinked(user: User) {
    try {
      await user.delete();
    } catch (err) {
      console.warn("Could not delete the unlinked sign-in user:", err);
    }
    try {
      await signOut(auth);
    } catch {
      /* already signed out by delete() */
    }
    markSignedOut();
    setTab("phone");
    setError(PHONE_FIRST_MESSAGE);
  }

  async function gateFederated(cred: UserCredential, method: "google" | "apple") {
    const info = getAdditionalUserInfo(cred);
    const decision = decideFederatedSignIn({
      isNewUser: info?.isNewUser === true,
      providerIds: cred.user.providerData.map((p) => p.providerId),
    });
    if (decision === "reject_unlinked") {
      await rejectUnlinked(cred.user);
      return;
    }
    await afterSignIn(cred.user, method, info);
  }

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await gateFederated(cred, "google");
    } catch (err) {
      console.error("Google sign-in error:", err, "| code:", (err as { code?: string }).code);
      setError(firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleApple() {
    setError("");
    setBusy(true);
    try {
      const provider = new OAuthProvider(APPLE_PROVIDER_ID);
      provider.addScope("email");
      provider.addScope("name");
      const cred = await signInWithPopup(auth, provider);
      await gateFederated(cred, "apple");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      console.error("Apple sign-in error:", err, "| code:", code);
      const email = (err as { customData?: { email?: string } }).customData?.email;
      setError(appleErrorMessage(code, email) ?? firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newUser) return;
    const name = extraInput.trim();
    if (!name) {
      setError("Enter the name you'd like to use, or skip.");
      return;
    }
    setBusy(true);
    try {
      await updateProfile(newUser, { displayName: name });
      await setDoc(
        doc(db, "user", newUser.uid),
        { displayName: name, name, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.warn("Name save failed (non-fatal):", err, "| code:", (err as { code?: string }).code);
    } finally {
      setBusy(false);
    }
    setExtraInput("");
    router.push(nextPath);
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleaned = phoneInput.trim();
    if (!isValidPhone(cleaned)) {
      setError("Enter a valid phone number with country code, e.g. +447911123456");
      return;
    }
    setBusy(true);
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      confirmationRef.current = await signInWithPhoneNumber(auth, cleaned, recaptchaRef.current);
      setStep("otp");
    } catch (err) {
      setError(firebaseErrorMessage(err));
      resetRecaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    if (!confirmationRef.current) return;
    setBusy(true);
    try {
      const result = await confirmationRef.current.confirm(otp);
      await afterSignIn(result.user, "phone");
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveExtra(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newUser) return;
    const cleaned = extraInput.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleaned)) {
      setError("Please enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      await setDoc(
        doc(db, "user", newUser.uid),
        { email: cleaned, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.warn("Email save failed (non-fatal):", err, "| code:", (err as { code?: string }).code);
    } finally {
      setBusy(false);
    }
    router.push(nextPath);
  }

  const heading = mode === "login" ? "Welcome back" : "Create your account";
  const subheading =
    mode === "login"
      ? "Sign in with your phone number. New here? We'll set up your account automatically."
      : "Join with your phone number. Already have an Operator account? You'll just be signed in.";

  // ── Name step (Apple only: Apple does not always send one) ──
  if (step === "add_name") {
    return (
      <div className="bg-card rounded-2xl p-8 border border-border/60 shadow-xl shadow-foreground/5">
        <h1 className="font-heading font-bold text-2xl text-foreground mb-1">What should we call you?</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Optional. Apple doesn&apos;t always share your name, so this is how you&apos;ll appear. You can change it
          later in your profile.
        </p>
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-sm font-medium mb-1.5 block">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={extraInput}
              onChange={(e) => setExtraInput(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}
          <Button type="submit" variant="outline" className={optionButton} disabled={busy}>
            {busy ? "Saving..." : "Save and continue"}
          </Button>
        </form>
        <button
          type="button"
          className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            setExtraInput("");
            setError("");
            router.push(nextPath);
          }}
        >
          Skip for now
        </button>
      </div>
    );
  }

  // ── Optional detail step (email after a new phone account) ──
  if (step === "add_email") {
    return (
      <div className="bg-card rounded-2xl p-8 border border-border/60 shadow-xl shadow-foreground/5">
        <h1 className="font-heading font-bold text-2xl text-foreground mb-1">Add your email address</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Optional. Adding an email gives us another way to reach you about your account. It is never used to find or
          merge accounts. You can add it later in your profile.
        </p>
        <form onSubmit={handleSaveExtra} className="space-y-4">
          <div>
            <Label htmlFor="extra" className="text-sm font-medium mb-1.5 block">
              Email address
            </Label>
            <Input
              id="extra"
              type="email"
              placeholder="you@example.com"
              value={extraInput}
              onChange={(e) => setExtraInput(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}
          <Button type="submit" variant="outline" className={optionButton} disabled={busy}>
            {busy ? "Saving..." : "Save and continue"}
          </Button>
        </form>
        <button
          type="button"
          className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            if (knownPhone) void processInvite(newUser!, knownPhone);
            router.push(nextPath);
          }}
        >
          Skip for now
        </button>
      </div>
    );
  }

  // ── Verification code step ──
  if (step === "otp") {
    return (
      <div className="bg-card rounded-2xl p-8 border border-border/60 shadow-xl shadow-foreground/5">
        <h1 className="font-heading font-bold text-2xl text-foreground mb-1">Enter verification code</h1>
        <p className="text-sm text-muted-foreground mb-6">
          We sent a 6-digit code to <span className="font-medium">{phoneInput}</span>.
        </p>
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <Label htmlFor="otp" className="text-sm font-medium mb-1.5 block">
              Verification code
            </Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}
          <Button type="submit" variant="outline" className={optionButton} disabled={busy || otp.length !== 6}>
            {busy ? "Verifying..." : "Verify code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-sm"
            disabled={busy}
            onClick={() => {
              setStep("choose");
              setOtp("");
              setError("");
              resetRecaptcha();
            }}
          >
            Use a different number or method
          </Button>
        </form>
      </div>
    );
  }

  // ── Choose a method: everything visible, nothing preferred ──
  return (
    <div className="bg-card rounded-2xl p-8 border border-border/60 shadow-xl shadow-foreground/5">
      <h1 className="font-heading font-bold text-2xl text-foreground mb-1">{heading}</h1>
      <p className="text-sm text-muted-foreground mb-6">{subheading}</p>

      <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl bg-muted">
        {(["phone", "other"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`h-9 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setTab(t);
              setError("");
            }}
          >
            {t === "phone" ? "Phone" : "Other sign-in"}
          </button>
        ))}
      </div>

      <div id="recaptcha-container" />

      {tab === "phone" ? (
        <div role="tabpanel">
      <form onSubmit={handleSendOtp} className="space-y-3">
        <div>
          <Label htmlFor="phone" className="text-sm font-medium mb-1.5 block">
            Phone number
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+447911123456"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" className={optionButton} disabled={busy}>
          {busy ? "Sending code..." : "Continue with phone"}
        </Button>
      </form>
        </div>
      ) : (
        <div role="tabpanel" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Google and Apple work once you have linked them to your Operator account. New here, or not linked yet? Use
            the Phone tab first, then link them from your profile.
          </p>
        <Button type="button" variant="outline" className={optionButton} onClick={handleGoogle} disabled={busy}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </Button>

        <Button type="button" variant="outline" className={optionButton} onClick={handleApple} disabled={busy}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M16.37 12.63c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.63 1.1 8.8.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.94-1.08 2.66-2.15.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.29-.88-2.31-3.55zM14.2 6.17c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.69-.92 2.68.97.07 1.96-.49 2.56-1.23z"/>
          </svg>
          Continue with Apple
        </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg break-words mt-4">
          {error}
        </p>
      )}
    </div>
  );
}
