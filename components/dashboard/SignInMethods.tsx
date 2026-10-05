"use client";

import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  linkWithPopup,
  onAuthStateChanged,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  APPLE_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  canLinkFederatedProvider,
  hasPhoneProvider,
  linkErrorMessage,
  type FederatedProviderId,
} from "@/lib/auth-linking";

const LABELS: Record<FederatedProviderId, string> = {
  [GOOGLE_PROVIDER_ID]: "Google",
  [APPLE_PROVIDER_ID]: "Apple",
};

function providerFor(id: FederatedProviderId) {
  if (id === GOOGLE_PROVIDER_ID) return new GoogleAuthProvider();
  const apple = new OAuthProvider(APPLE_PROVIDER_ID);
  apple.addScope("email");
  apple.addScope("name");
  return apple;
}

/**
 * Attaches Google/Apple to the Firebase user that is signed in right now, which
 * must already be proved by phone. linkWithPopup never merges two users: if the
 * Google/Apple identity already belongs to another Firebase user it fails with
 * auth/credential-already-in-use and nothing changes.
 */
export function SignInMethods() {
  const [user, setUser] = useState<User | null>(null);
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [phoneInput, setPhoneInput] = useState("");
  const [otp, setOtp] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => {
      unsub();
      recaptchaRef.current?.clear();
    };
  }, []);

  if (!user) return null;

  const providerIds = user.providerData.map((p) => p.providerId);
  const phoneVerified = hasPhoneProvider(providerIds);
  const refresh = () => setTick((n) => n + 1);

  async function link(id: FederatedProviderId) {
    if (!user) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await linkWithPopup(user, providerFor(id));
      setMessage(`${LABELS[id]} is now linked. You can use it to sign in to this account.`);
      refresh();
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(linkErrorMessage(code, LABELS[id]) ?? `Couldn't link ${LABELS[id]}. Please try again. [${code}]`);
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError("");
    const cleaned = phoneInput.trim();
    if (!cleaned.startsWith("+") || cleaned.replace(/\D/g, "").length < 8) {
      setError("Enter a valid phone number with country code, e.g. +447911123456");
      return;
    }
    setBusy(true);
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "link-recaptcha-container", { size: "invisible" });
      }
      confirmationRef.current = await linkWithPhoneNumber(user, cleaned, recaptchaRef.current);
      setAwaitingCode(true);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(linkErrorMessage(code, "That phone number") ?? `Couldn't send a code. [${code}]`);
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmationRef.current) return;
    setBusy(true);
    setError("");
    try {
      await confirmationRef.current.confirm(otp);
      setAwaitingCode(false);
      setOtp("");
      setMessage("Phone verified. You can now link Google or Apple.");
      refresh();
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(linkErrorMessage(code, "That phone number") ?? `That code didn't work. [${code}]`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-border/60 bg-card p-5">
      <h2 className="font-heading font-semibold text-lg text-foreground">Sign-in methods</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Your phone number is your Operator account. Link Google or Apple to sign in another way. They are attached to
        this same account, never merged with a different one.
      </p>

      <ul className="space-y-2 mb-4 text-sm">
        <li className="flex justify-between">
          <span>Phone</span>
          <span className="text-muted-foreground">{phoneVerified ? "Verified" : "Not verified"}</span>
        </li>
        {([GOOGLE_PROVIDER_ID, APPLE_PROVIDER_ID] as const).map((id) => {
          const linked = providerIds.includes(id);
          return (
            <li key={id} className="flex items-center justify-between gap-3">
              <span>{LABELS[id]}</span>
              {linked ? (
                <span className="text-muted-foreground">Linked</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !canLinkFederatedProvider(providerIds)}
                  onClick={() => void link(id)}
                >
                  Link {LABELS[id]}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {!phoneVerified && (
        <div className="border-t border-border/60 pt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Verify your phone number to link Google or Apple. If that number already belongs to an Operator account,
            sign out and sign in with it instead; accounts are not merged.
          </p>
          <div id="link-recaptcha-container" />
          {awaitingCode ? (
            <form onSubmit={confirmCode} className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="link-otp" className="sr-only">
                  Verification code
                </Label>
                <Input
                  id="link-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <Button type="submit" variant="outline" disabled={busy || otp.length !== 6}>
                Verify
              </Button>
            </form>
          ) : (
            <form onSubmit={sendCode} className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="link-phone" className="sr-only">
                  Phone number
                </Label>
                <Input
                  id="link-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+447911123456"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
              </div>
              <Button type="submit" variant="outline" disabled={busy}>
                Send code
              </Button>
            </form>
          )}
        </div>
      )}

      {message && <p className="text-sm text-foreground bg-muted px-3 py-2 rounded-lg mt-4">{message}</p>}
      {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg mt-4 break-words">{error}</p>}
    </section>
  );
}
