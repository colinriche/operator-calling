"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smartphone, X, AlertCircle, CheckCircle2 } from "lucide-react";

type Step = "banner" | "form" | "email_verify" | "name_conflict" | "success";

export function LinkAccountBanner() {
  const { user, isLinked, refreshProfile } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<Step>("banner");

  // Accumulated inputs across steps
  const [supportCode, setSupportCode] = useState("");
  const [emailVerification, setEmailVerification] = useState("");
  const [preferredName, setPreferredName] = useState("");

  // Data from API responses
  const [conflictNames, setConflictNames] = useState<{ webName: string; appName: string } | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isLinked || dismissed) return null;

  async function callLinkApi(body: {
    supportCode: string;
    emailVerification?: string;
    preferredName?: string;
  }) {
    setLoading(true);
    setError("");
    try {
      const idToken = await user!.getIdToken();
      const res = await fetch("/api/account/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        status: string;
        message?: string;
        webName?: string;
        appName?: string;
      };
      return data;
    } catch {
      return { status: "error", message: "Network error. Please try again." };
    } finally {
      setLoading(false);
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = supportCode.trim();
    if (!trimmed) {
      setError("Please enter your Support Code.");
      return;
    }
    const data = await callLinkApi({ supportCode: trimmed });
    handleResponse(data);
  }

  async function handleEmailVerify(e: React.FormEvent) {
    e.preventDefault();
    const email = emailVerification.trim();
    if (!email) {
      setError("Please enter the email address from your app account.");
      return;
    }
    const data = await callLinkApi({ supportCode: supportCode.trim(), emailVerification: email });
    handleResponse(data);
  }

  async function handleNameChoice(chosen: string) {
    const data = await callLinkApi({
      supportCode: supportCode.trim(),
      ...(emailVerification.trim() ? { emailVerification: emailVerification.trim() } : {}),
      preferredName: chosen,
    });
    handleResponse(data);
  }

  function handleResponse(data: { status: string; message?: string; webName?: string; appName?: string }) {
    if (data.status === "email_required") {
      setStep("email_verify");
      setError("");
      return;
    }
    if (data.status === "name_conflict") {
      setConflictNames({ webName: data.webName!, appName: data.appName! });
      setStep("name_conflict");
      setError("");
      return;
    }
    if (data.status === "linked") {
      setStep("success");
      void refreshProfile();
      return;
    }
    // All error/rejection states
    setError(data.message ?? "Something went wrong. Please try again.");
  }

  if (step === "success") {
    return (
      <div className="mb-6 flex items-center gap-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl px-5 py-4">
        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          Account linked successfully! All features are now available.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl overflow-hidden">
      {/* Header row — always visible */}
      <div className="flex items-start gap-3 px-5 py-4">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            This account is not linked to a mobile account
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
            To link your account, open{" "}
            <span className="font-semibold">The Operator</span> app, go to{" "}
            <span className="font-semibold">Settings</span>, and copy your{" "}
            <span className="font-semibold">Support Code</span>.
            Some features will not be available until your account is linked.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {step === "banner" && (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-100 text-xs h-8"
              onClick={() => setStep("form")}
            >
              <Smartphone className="w-3.5 h-3.5 mr-1.5" />
              Link now
            </Button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Step: enter support code */}
      {step === "form" && (
        <form
          onSubmit={handleFormSubmit}
          className="px-5 pb-4 border-t border-amber-200 dark:border-amber-800 pt-4 flex flex-col gap-3"
        >
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Open The Operator app → Settings → copy your Support Code and paste it below.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. swift-falcon-342"
              value={supportCode}
              onChange={(e) => setSupportCode(e.target.value)}
              className="flex-1 h-9 text-sm border-amber-300 focus-visible:ring-amber-400"
              disabled={loading}
            />
            <Button
              type="submit"
              size="sm"
              className="gradient-gold border-0 text-primary-foreground font-semibold h-9"
              disabled={loading}
            >
              {loading ? "Checking…" : "Link"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}

      {/* Step: phone users must verify email */}
      {step === "email_verify" && (
        <form
          onSubmit={handleEmailVerify}
          className="px-5 pb-4 border-t border-amber-200 dark:border-amber-800 pt-4 flex flex-col gap-3"
        >
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Enter the email address saved in your app account to confirm you own it.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Email on your app account"
              value={emailVerification}
              onChange={(e) => setEmailVerification(e.target.value)}
              className="flex-1 h-9 text-sm border-amber-300 focus-visible:ring-amber-400"
              disabled={loading}
            />
            <Button
              type="submit"
              size="sm"
              className="gradient-gold border-0 text-primary-foreground font-semibold h-9"
              disabled={loading}
            >
              {loading ? "Verifying…" : "Verify"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}

      {/* Step: name conflict — pick which name to keep */}
      {step === "name_conflict" && conflictNames && (
        <div className="px-5 pb-4 border-t border-amber-200 dark:border-amber-800 pt-4 flex flex-col gap-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Both accounts have different display names. Which one would you like to keep?
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-100 text-xs h-9"
              disabled={loading}
              onClick={() => {
                setPreferredName(conflictNames.appName);
                void handleNameChoice(conflictNames.appName);
              }}
            >
              {loading && preferredName === conflictNames.appName ? "Linking…" : `App name: ${conflictNames.appName}`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-100 text-xs h-9"
              disabled={loading}
              onClick={() => {
                setPreferredName(conflictNames.webName);
                void handleNameChoice(conflictNames.webName);
              }}
            >
              {loading && preferredName === conflictNames.webName ? "Linking…" : `Web name: ${conflictNames.webName}`}
            </Button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
