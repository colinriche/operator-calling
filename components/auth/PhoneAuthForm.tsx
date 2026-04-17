"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  getIdToken,
  type ConfirmationResult,
} from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "phone" | "otp" | "email_prompt";

function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  const known: Record<string, string> = {
    "auth/invalid-phone-number": "That doesn't look like a valid phone number.",
    "auth/too-many-requests": "Too many attempts — wait a moment before trying again.",
    "auth/code-expired": "The verification code has expired. Please request a new one.",
    "auth/invalid-verification-code": "Incorrect code — please check and try again.",
    "auth/missing-phone-number": "Please enter your phone number.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
    "auth/captcha-check-failed":
      "reCAPTCHA check failed — domain may not be authorised. Add operatorcalling.com to Firebase Console → Authentication → Authorized domains.",
    "auth/unauthorized-domain":
      "This domain isn't authorised. Add operatorcalling.com to Firebase Console → Authentication → Authorized domains.",
  };
  if (code && known[code]) return `${known[code]} [${code}]`;
  const raw = err instanceof Error ? err.message : "";
  const clean = raw.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/, "").trim();
  const meaningful = clean && clean.toLowerCase() !== "error" ? clean : "Something went wrong — please try again.";
  return code ? `${meaningful} [${code}]` : meaningful;
}

export function PhoneAuthForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [otp, setOtp] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signedInUid, setSignedInUid] = useState<string | null>(null);

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
    };
  }, []);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleaned = phoneInput.trim();
    if (!cleaned.startsWith("+") || cleaned.length < 10) {
      setError("Enter a valid phone number with country code, e.g. +447911123456");
      return;
    }
    setLoading(true);
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
        });
      }
      const confirmation = await signInWithPhoneNumber(auth, cleaned, recaptchaRef.current);
      confirmationRef.current = confirmation;
      setStep("otp");
    } catch (err) {
      setError(firebaseErrorMessage(err));
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setLoading(false);
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
    setLoading(true);
    try {
      const result = await confirmationRef.current.confirm(otp);
      const idToken = await getIdToken(result.user);
      document.cookie = `__session=${idToken}; path=/; SameSite=Lax; max-age=3600`;

      const uid = result.user.uid;
      const snap = await getDoc(doc(db, "user", uid));
      const email = snap.exists() ? (snap.data().email as string | undefined) : undefined;

      if (!email) {
        setSignedInUid(uid);
        setStep("email_prompt");
        setLoading(false);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleaned = emailInput.trim();
    if (!cleaned || !/^[^@]+@[^@]+\.[^@]+/.test(cleaned)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!signedInUid) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "user", signedInUid), {
        email: cleaned,
        updatedAt: serverTimestamp(),
      });
      router.push("/dashboard");
    } catch (err) {
      setError("Failed to save email — please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ── Email prompt step ────────────────────────────────────────────────────
  if (step === "email_prompt") {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-foreground mb-1">
            Add your email address
          </h2>
          <p className="text-sm text-muted-foreground">
            Adding an email lets you also sign in to the web app with email and
            password. You can skip this and add it later in your profile.
          </p>
        </div>
        <form onSubmit={handleSaveEmail} className="space-y-4">
          <div>
            <Label htmlFor="email-prompt" className="text-sm font-medium mb-1.5 block">
              Email address
            </Label>
            <Input
              id="email-prompt"
              type="email"
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full gradient-gold border-0 text-primary-foreground font-semibold"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save and continue"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={loading}
            onClick={() => router.push("/dashboard")}
          >
            Skip for now
          </Button>
        </form>
      </div>
    );
  }

  // ── OTP step ─────────────────────────────────────────────────────────────
  if (step === "otp") {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-foreground mb-1">
            Enter verification code
          </h2>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to <span className="font-medium">{phoneInput}</span>.
          </p>
        </div>
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <Label htmlFor="otp" className="text-sm font-medium mb-1.5 block">
              Verification code
            </Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              placeholder="123456"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full gradient-gold border-0 text-primary-foreground font-semibold"
            disabled={loading || otp.length !== 6}
          >
            {loading ? "Verifying..." : "Verify code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-sm"
            disabled={loading}
            onClick={() => {
              setStep("phone");
              setOtp("");
              setError("");
              recaptchaRef.current?.clear();
              recaptchaRef.current = null;
            }}
          >
            Use a different number
          </Button>
        </form>
      </div>
    );
  }

  // ── Phone number step ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div ref={recaptchaContainerRef} id="recaptcha-container" />
      <form onSubmit={handleSendOtp} className="space-y-4">
        <div>
          <Label htmlFor="phone" className="text-sm font-medium mb-1.5 block">
            Phone number
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+447911123456"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full gradient-gold border-0 text-primary-foreground font-semibold"
          disabled={loading}
        >
          {loading ? "Sending code..." : "Send verification code"}
        </Button>
      </form>
    </div>
  );
}
