"use client";

import { useState } from "react";
import { collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smartphone, X, AlertCircle, CheckCircle2 } from "lucide-react";

export function LinkAccountBanner() {
  const { user, isLinked, refreshProfile } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [systemName, setSystemName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (isLinked || dismissed) return null;

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = systemName.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your system name.");
      return;
    }
    if (!user?.email) {
      setError("No email found on your account. Please sign out and sign in again.");
      return;
    }

    setLoading(true);
    try {
      // Find the mobile doc by systemName
      const snap = await getDocs(
        query(collection(db, "user"), where("systemName", "==", trimmed))
      );
      if (snap.empty) {
        setError("System name not found. Check the Support section in the Operator app and try again.");
        setLoading(false);
        return;
      }

      const mobileDoc = snap.docs[0];
      // Write the web email into the mobile doc so future logins auto-link
      await updateDoc(mobileDoc.ref, {
        linkedWebEmail: user.email,
        // Also write email if not already there (so useAuth email lookup works)
        ...(mobileDoc.data().email ? {} : { email: user.email }),
      });

      setSuccess(true);
      await refreshProfile();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
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
      <div className="flex items-start gap-3 px-5 py-4">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            This account is not linked to a mobile account
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
            To link your account, go to settings in{" "}
            <span className="font-semibold">The Operator</span> app, find your{" "}
            <span className="font-semibold">Support Code</span>, and enter it
            below. Some features will not be available until your account is
            linked.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!expanded && (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-100 text-xs h-8"
              onClick={() => setExpanded(true)}
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

      {expanded && (
        <form
          onSubmit={handleLink}
          className="px-5 pb-4 border-t border-amber-200 dark:border-amber-800 pt-4 flex flex-col gap-3"
        >
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Open the Operator app → Settings → Support → copy your System Name
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. swift-falcon-342"
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
              className="flex-1 h-9 text-sm border-amber-300 focus-visible:ring-amber-400"
              disabled={loading}
            />
            <Button
              type="submit"
              size="sm"
              className="gradient-gold border-0 text-primary-foreground font-semibold h-9"
              disabled={loading}
            >
              {loading ? "Linking..." : "Link"}
            </Button>
          </div>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </form>
      )}
    </div>
  );
}
