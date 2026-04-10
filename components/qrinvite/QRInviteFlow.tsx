"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged, getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  detectPlatform,
  buildDeepLink,
  attemptAppOpen,
  createPendingConnection,
  completeInvite,
  validateToken,
  STORE_URLS,
} from "@/lib/qrinvite";
import type { QRInviteState, Platform, InviteType } from "@/lib/qrinvite";
import { Phone, CheckCircle2, XCircle, Clock, Smartphone, Download, Loader2, ArrowRight } from "lucide-react";

// ─── Animation preset ─────────────────────────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-2 font-heading font-bold text-lg text-foreground">
            <span className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center">
              <Phone className="w-4 h-4 text-primary-foreground" />
            </span>
            The Operator
          </div>
        </div>
        <AnimatePresence mode="wait">{children}</AnimatePresence>
      </div>
    </div>
  );
}

// ─── Individual state screens ─────────────────────────────────────────────────

function ValidatingScreen() {
  return (
    <motion.div key="validating" {...fadeUp} className="text-center">
      <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-5" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Checking your invite…</h1>
      <p className="text-muted-foreground text-sm">Just a moment.</p>
    </motion.div>
  );
}

function InvalidScreen() {
  return (
    <motion.div key="invalid" {...fadeUp} className="text-center">
      <XCircle className="w-12 h-12 text-destructive mx-auto mb-5" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Invalid invite</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        This QR code isn't recognised. Ask the person who shared it to generate a new one.
      </p>
    </motion.div>
  );
}

function ExpiredScreen() {
  return (
    <motion.div key="expired" {...fadeUp} className="text-center">
      <Clock className="w-12 h-12 text-amber-500 mx-auto mb-5" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Invite expired</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        This QR code has expired. Ask the person who shared it to generate a fresh one — they only last a short time for security.
      </p>
    </motion.div>
  );
}

function CompletingScreen({ name }: { name: string }) {
  return (
    <motion.div key="completing" {...fadeUp} className="text-center">
      <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-5" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Adding {name}…</h1>
      <p className="text-muted-foreground text-sm">Setting up your connection.</p>
    </motion.div>
  );
}

function SuccessScreen({ targetName, type }: { targetName: string; type: InviteType }) {
  return (
    <motion.div key="success" {...fadeUp} className="text-center">
      <div className="w-16 h-16 rounded-full gradient-gold flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/20">
        <CheckCircle2 className="w-8 h-8 text-primary-foreground" />
      </div>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">
        {type === "group" ? "You're in!" : "Connected!"}
      </h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        {type === "group"
          ? `You've joined the group. Open The Operator app to start calling.`
          : `${targetName} has been added as a contact. Open the app to call them.`}
      </p>
      <a
        href="operatorcalling://"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-gold text-primary-foreground font-heading font-semibold text-sm shadow-md"
      >
        Open The Operator <ArrowRight className="w-4 h-4" />
      </a>
    </motion.div>
  );
}

function AppOpeningScreen() {
  return (
    <motion.div key="app_opening" {...fadeUp} className="text-center">
      <Smartphone className="w-10 h-10 text-primary animate-bounce mx-auto mb-5" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Opening The Operator…</h1>
      <p className="text-muted-foreground text-sm">If the app doesn't open, you may need to install it.</p>
    </motion.div>
  );
}

function InstallAppScreen({
  platform,
  token,
  type,
  onPendingSaved,
}: {
  platform: Platform;
  token: string;
  type: InviteType;
  onPendingSaved: (p: Platform) => void;
}) {
  const [saving, setSaving] = useState(false);
  const hasSaved = useRef(false);

  useEffect(() => {
    if (hasSaved.current) return;
    hasSaved.current = true;
    setSaving(true);
    createPendingConnection(token, platform)
      .then((res) => {
        if (res.success) onPendingSaved(platform);
      })
      .finally(() => setSaving(false));
  }, [token, platform, onPendingSaved]);

  return (
    <motion.div key="install_app" {...fadeUp} className="text-center">
      <Download className="w-10 h-10 text-primary mx-auto mb-5" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Get The Operator</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        Download the app to accept this invite. Your invite will be waiting when you sign up.
      </p>

      <div className="flex flex-col gap-3">
        {(platform === "ios" || platform === "web") && (
          <a
            href={STORE_URLS.ios}
            className="flex items-center justify-center gap-3 px-5 py-3.5 bg-foreground text-background rounded-2xl font-heading font-semibold text-sm hover:bg-foreground/90 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Download on the App Store
          </a>
        )}
        {(platform === "android" || platform === "web") && (
          <a
            href={STORE_URLS.android}
            className="flex items-center justify-center gap-3 px-5 py-3.5 bg-foreground text-background rounded-2xl font-heading font-semibold text-sm hover:bg-foreground/90 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.18 23.76c.3.16.65.18.97.06l12.52-6.45-2.72-2.72-10.77 9.11zm-1.4-20.8A1.5 1.5 0 001.5 4v16c0 .5.26.97.68 1.23l.08.05 8.97-9.26-8.97-9.06-.08.04zM20.46 10.5l-2.62-1.45-3.06 3.06 3.06 3.06 2.64-1.46c.75-.42.75-1.79-.02-2.21zM4.15.24L16.67 6.7l-2.72 2.72L3.18.31c.3-.13.67-.12.97-.07z" />
            </svg>
            Get it on Google Play
          </a>
        )}
      </div>

      {saving && (
        <p className="mt-4 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Saving your invite…
        </p>
      )}
    </motion.div>
  );
}

function PendingSavedScreen({ platform }: { platform: Platform }) {
  return (
    <motion.div key="pending_saved" {...fadeUp} className="text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-8 h-8 text-primary" />
      </div>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Invite saved</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        Download The Operator and sign up — your invite will be waiting and will connect automatically.
      </p>
      <div className="flex flex-col gap-3">
        {(platform === "ios" || platform === "web") && (
          <a href={STORE_URLS.ios} className="flex items-center justify-center gap-3 px-5 py-3.5 bg-foreground text-background rounded-2xl font-heading font-semibold text-sm hover:bg-foreground/90 transition-colors">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            App Store
          </a>
        )}
        {(platform === "android" || platform === "web") && (
          <a href={STORE_URLS.android} className="flex items-center justify-center gap-3 px-5 py-3.5 bg-foreground text-background rounded-2xl font-heading font-semibold text-sm hover:bg-foreground/90 transition-colors">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.18 23.76c.3.16.65.18.97.06l12.52-6.45-2.72-2.72-10.77 9.11zm-1.4-20.8A1.5 1.5 0 001.5 4v16c0 .5.26.97.68 1.23l.08.05 8.97-9.26-8.97-9.06-.08.04zM20.46 10.5l-2.62-1.45-3.06 3.06 3.06 3.06 2.64-1.46c.75-.42.75-1.79-.02-2.21zM4.15.24L16.67 6.7l-2.72 2.72L3.18.31c.3-.13.67-.12.97-.07z" />
            </svg>
            Google Play
          </a>
        )}
      </div>
    </motion.div>
  );
}

function ResumedScreen() {
  return (
    <motion.div key="resumed" {...fadeUp} className="text-center">
      <div className="w-16 h-16 rounded-full gradient-gold flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/20">
        <CheckCircle2 className="w-8 h-8 text-primary-foreground" />
      </div>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">You're all set!</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        Your pending invite has been completed. Open The Operator to start calling.
      </p>
      <a
        href="operatorcalling://"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-gold text-primary-foreground font-heading font-semibold text-sm shadow-md"
      >
        Open The Operator <ArrowRight className="w-4 h-4" />
      </a>
    </motion.div>
  );
}

function ErrorScreen({ message }: { message?: string }) {
  return (
    <motion.div key="error" {...fadeUp} className="text-center">
      <XCircle className="w-12 h-12 text-destructive mx-auto mb-5" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Something went wrong</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        {message ?? "We couldn't complete your invite. Please try again or ask for a new QR code."}
      </p>
    </motion.div>
  );
}

// ─── Main flow component ──────────────────────────────────────────────────────

interface QRInviteFlowProps {
  token: string;
  type: InviteType;
}

export function QRInviteFlow({ token, type }: QRInviteFlowProps) {
  const [state, setState] = useState<QRInviteState>({ status: "validating" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const platform = detectPlatform();

    async function run() {
      // Step 1: Validate the token server-side
      const validation = await validateToken(token);

      if (!validation.valid || !validation.tokenData) {
        setState({
          status: validation.reason === "expired" ? "expired" : "invalid",
        });
        return;
      }

      const tokenData = validation.tokenData;

      // Step 2: Check Firebase auth session
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          // Branch A: Trusted existing user
          setState({ status: "trusted", tokenData });

          try {
            const idToken = await getIdToken(user);
            setState({ status: "completing" });
            const result = await completeInvite(token, user.uid, idToken);

            if (result.success) {
              setState({
                status: "success",
                targetName: tokenData.targetDisplayName,
                type: tokenData.type,
              });
            } else {
              setState({ status: "error", message: result.error });
            }
          } catch {
            setState({ status: "error" });
          }
        } else {
          // Branch B: Unknown / untrusted user
          const deepLink = buildDeepLink(token, type);
          setState({ status: "app_opening", deepLink });

          const appNotInstalled = await attemptAppOpen(deepLink);

          if (appNotInstalled) {
            setState({ status: "install_app", platform, token, type });
          }
          // If app opened, the user is now in-app — page goes to background
        }
      });
    }

    run().catch(() => setState({ status: "error" }));
  }, [token, type]);

  const handlePendingSaved = (platform: Platform) => {
    setState({ status: "pending_saved", platform });
  };

  return (
    <Shell>
      {state.status === "validating" && <ValidatingScreen />}
      {state.status === "invalid" && <InvalidScreen />}
      {state.status === "expired" && <ExpiredScreen />}
      {(state.status === "trusted" || state.status === "completing") && (
        <CompletingScreen
          name={
            state.status === "trusted"
              ? state.tokenData.targetDisplayName
              : "contact"
          }
        />
      )}
      {state.status === "success" && (
        <SuccessScreen targetName={state.targetName} type={state.type} />
      )}
      {state.status === "app_opening" && <AppOpeningScreen />}
      {state.status === "install_app" && (
        <InstallAppScreen
          platform={state.platform}
          token={state.token}
          type={state.type}
          onPendingSaved={handlePendingSaved}
        />
      )}
      {state.status === "pending_saved" && (
        <PendingSavedScreen platform={state.platform} />
      )}
      {state.status === "resumed" && <ResumedScreen />}
      {state.status === "error" && (
        <ErrorScreen message={"message" in state ? state.message : undefined} />
      )}
    </Shell>
  );
}
