"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { markSignedIn, markSignedOut } from "@/lib/session-cookie";

/**
 * Keeps the signed-in marker cookie in step with Firebase for as long as the
 * user is signed in - renewing it on every visit and token refresh, clearing it
 * on sign-out, including a sign-out in another tab. See lib/session-cookie.ts.
 *
 * Firebase is loaded lazily so marketing pages do not pay for it up front.
 */
function SessionCookieSync() {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void Promise.all([import("firebase/auth"), import("@/lib/firebase")]).then(
      ([{ onIdTokenChanged }, { auth }]) => {
        if (cancelled) return;
        // Fires once persistence has been restored, so a returning user is
        // seen as signed in rather than briefly as signed out.
        unsubscribe = onIdTokenChanged(auth, (user) => {
          if (user) markSignedIn();
          else markSignedOut();
        });
      }
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionCookieSync />
      {children}
    </ThemeProvider>
  );
}
