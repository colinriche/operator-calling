"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasPhoneProvider } from "@/lib/auth-linking";
import { Smartphone, X, AlertCircle } from "lucide-react";

/**
 * Shown while this sign-in is not attached to an Operator app account.
 *
 * It used to ask for a Support Code and an email. Knowing those is not proof of
 * ownership, so it now only explains the phone-first route and points at it.
 */
export function LinkAccountBanner() {
  const { user, loading: authLoading, isLinked } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (authLoading || isLinked || dismissed || !user) return null;

  const hasPhone = hasPhoneProvider(user.providerData.map((p) => p.providerId));

  return (
    <div className="mb-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
      <div className="flex items-start gap-3 px-5 py-4">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            This account is not connected to an Operator app account
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
            {hasPhone
              ? "No app account was found for your phone number. Sign in to the Operator app with this same number and it will appear here."
              : "Your phone number is your Operator account. Sign in with it to reach your app account, or verify it from your profile. Some features will not be available until then."}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!hasPhone && (
            <Link
              href="/dashboard/profile"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "border-amber-300 text-amber-800 hover:bg-amber-100 text-xs h-8"
              )}
            >
              <Smartphone className="w-3.5 h-3.5 mr-1.5" />
              Verify phone
            </Link>
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
    </div>
  );
}
