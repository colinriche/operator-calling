"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged, getIdToken } from "firebase/auth";
import { toast } from "sonner";
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
import { inviteTypeLabel, isGroupType } from "@/lib/qrinvite";
import {
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  Smartphone,
  Download,
  Loader2,
  ArrowRight,
  WifiOff,
  AlertCircle,
  Menu,
  X,
  Home,
  HelpCircle,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Animation preset ─────────────────────────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12 relative">

      {/* Hamburger menu */}
      <div className="absolute top-4 left-4 z-30">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-foreground"
          aria-label="Menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {menuOpen && (
          <>
            {/* Backdrop to close on outside click */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-11 left-0 z-20 w-56 bg-card border border-border/60 rounded-xl shadow-xl overflow-hidden">
              <a
                href="/"
                className="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <Home className="w-4 h-4 text-muted-foreground shrink-0" />
                Homepage
              </a>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                onClick={() => { setMenuOpen(false); setHelpOpen(true); }}
              >
                <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                Help with this page
              </button>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                onClick={() => { setMenuOpen(false); setAboutOpen(true); }}
              >
                <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                About
              </button>
            </div>
          </>
        )}
      </div>

      <div className="w-full max-w-sm">
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

      {/* Help dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Help with this page</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The QR code should automatically add user contacts to the app if you have it installed,
            if not then should offer a link to the app/play stores.
          </p>
        </DialogContent>
      </Dialog>

      {/* About dialog */}
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>About The Operator</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              <span className="font-semibold text-foreground">The Operator</span> is a
              voice-first communication platform — real conversation, better timed.
            </p>
            <p>
              A call only connects when both people answer, removing call pressure and
              missed-timing friction. It supports one-to-one calls, privacy-focused
              calls with people globally, and group-based calling.
            </p>
            <p className="text-xs pt-1 border-t border-border/50">
              © {new Date().getFullYear()} The Operator
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Reusable icon badge ──────────────────────────────────────────────────────

function IconBadge({
  children,
  variant = "gold",
}: {
  children: React.ReactNode;
  variant?: "gold" | "muted" | "destructive" | "warning";
}) {
  const cls = {
    gold: "gradient-gold shadow-lg shadow-primary/20",
    muted: "bg-primary/10",
    destructive: "bg-destructive/10",
    warning: "bg-amber-100",
  }[variant];

  const iconCls = {
    gold: "text-primary-foreground",
    muted: "text-primary",
    destructive: "text-destructive",
    warning: "text-amber-600",
  }[variant];

  return (
    <div className={`w-16 h-16 rounded-full ${cls} flex items-center justify-center mx-auto mb-5`}>
      <div className={iconCls}>{children}</div>
    </div>
  );
}

// ─── Store buttons ────────────────────────────────────────────────────────────

function StoreButtons({ platform }: { platform: Platform }) {
  const showTestFlightMessage = () => {
    window.alert("Please open the TestFlight app on your iPhone to install The Operator.");
  };

  return (
    <div className="flex flex-col gap-3">
      {(platform === "ios" || platform === "web") && (
        <button
          type="button"
          onClick={showTestFlightMessage}
          className="flex items-center justify-center gap-3 px-5 py-3.5 bg-foreground text-background rounded-2xl font-heading font-semibold text-sm hover:bg-foreground/90 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 shrink-0">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          Download on the App Store
        </button>
      )}
      {(platform === "android" || platform === "web") && (
        <a
          href={STORE_URLS.android}
          className="flex items-center justify-center gap-3 px-5 py-3.5 bg-foreground text-background rounded-2xl font-heading font-semibold text-sm hover:bg-foreground/90 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 shrink-0">
            <path d="M3.18 23.76c.3.16.65.18.97.06l12.52-6.45-2.72-2.72-10.77 9.11zm-1.4-20.8A1.5 1.5 0 001.5 4v16c0 .5.26.97.68 1.23l.08.05 8.97-9.26-8.97-9.06-.08.04zM20.46 10.5l-2.62-1.45-3.06 3.06 3.06 3.06 2.64-1.46c.75-.42.75-1.79-.02-2.21zM4.15.24L16.67 6.7l-2.72 2.72L3.18.31c.3-.13.67-.12.97-.07z" />
          </svg>
          Get it on Google Play
        </a>
      )}
    </div>
  );
}

// ─── Open-app CTA ─────────────────────────────────────────────────────────────

function OpenAppButton() {
  return (
    <a
      href="operatorcalling://"
      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-gold text-primary-foreground font-heading font-semibold text-sm shadow-md hover:opacity-90 transition-opacity"
    >
      Open The Operator <ArrowRight className="w-4 h-4" />
    </a>
  );
}

// ─── State screens ────────────────────────────────────────────────────────────

function ValidatingScreen() {
  return (
    <motion.div key="validating" {...fadeUp} className="text-center">
      <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-5" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Checking your invite…</h1>
      <p className="text-muted-foreground text-sm">Just a moment.</p>
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
  const isGroup = isGroupType(type);
  return (
    <motion.div key="success" {...fadeUp} className="text-center">
      <IconBadge variant="gold">
        <CheckCircle2 className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">
        {isGroup ? "You're in!" : "Connected!"}
      </h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        {isGroup
          ? "You've joined the group. Open The Operator app to start calling."
          : `${targetName} has been added as a ${inviteTypeLabel(type)}. Open the app to call them.`}
      </p>
      <OpenAppButton />
    </motion.div>
  );
}

function ResumedScreen() {
  return (
    <motion.div key="resumed" {...fadeUp} className="text-center">
      <IconBadge variant="gold">
        <CheckCircle2 className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">You're all set!</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        Your pending invite has been completed. Open The Operator to start calling.
      </p>
      <OpenAppButton />
    </motion.div>
  );
}

function ExpiredScreen() {
  return (
    <motion.div key="expired" {...fadeUp} className="text-center">
      <IconBadge variant="warning">
        <Clock className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Invite expired</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        This QR code has expired — they're short-lived for security. Ask the person who shared it to generate a new one.
      </p>
    </motion.div>
  );
}

function UsedScreen() {
  return (
    <motion.div key="used" {...fadeUp} className="text-center">
      <IconBadge variant="muted">
        <CheckCircle2 className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Already used</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        This invite has already been accepted. Each QR code can only be used once.
        If you haven't connected yet, ask for a new one.
      </p>
    </motion.div>
  );
}

function InvalidScreen() {
  return (
    <motion.div key="invalid" {...fadeUp} className="text-center">
      <IconBadge variant="destructive">
        <XCircle className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Invalid invite</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        This QR code isn't recognised. Ask the person who shared it to generate a new one.
      </p>
    </motion.div>
  );
}

function NetworkErrorScreen() {
  return (
    <motion.div key="network_error" {...fadeUp} className="text-center">
      <IconBadge variant="warning">
        <WifiOff className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">No connection</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-5">
        We couldn't reach the server. Check your connection and try refreshing.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        Try again
      </button>
    </motion.div>
  );
}

function AppOpeningScreen() {
  return (
    <motion.div key="app_opening" {...fadeUp} className="text-center">
      <IconBadge variant="muted">
        <Smartphone className="w-8 h-8 animate-bounce" />
      </IconBadge>
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
      .catch(() => {
        // Pending save failed silently — store buttons still shown
      })
      .finally(() => setSaving(false));
  }, [token, platform, onPendingSaved]);

  return (
    <motion.div key="install_app" {...fadeUp} className="text-center">
      <IconBadge variant="muted">
        <Download className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Get The Operator</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        Download the app to accept this invite. Your invite will be waiting when you sign up.
      </p>
      <StoreButtons platform={platform} />
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
      <IconBadge variant="muted">
        <CheckCircle2 className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Invite saved</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        Download The Operator and sign up — your invite will connect automatically once you're in.
      </p>
      <StoreButtons platform={platform} />
    </motion.div>
  );
}

function JoinRequestedScreen({ groupName }: { groupName?: string }) {
  return (
    <motion.div key="join_requested" {...fadeUp} className="text-center">
      <IconBadge variant="muted">
        <Clock className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Request sent</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-2">
        {groupName
          ? `Your request to join "${groupName}" has been sent.`
          : "Your join request has been sent."}
      </p>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
        The group owner will review it. You'll be notified in The Operator app once approved.
      </p>
      <OpenAppButton />
    </motion.div>
  );
}

function ErrorScreen({ message }: { message?: string }) {
  return (
    <motion.div key="error" {...fadeUp} className="text-center">
      <IconBadge variant="destructive">
        <AlertCircle className="w-8 h-8" />
      </IconBadge>
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Something went wrong</h1>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-5">
        {message ?? "We couldn't complete your invite. Please try again or ask for a new QR code."}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        Try again
      </button>
    </motion.div>
  );
}

// ─── Main flow component ──────────────────────────────────────────────────────

interface QRInviteFlowProps {
  token: string;
  type: InviteType;
  invalidReason?: "missing" | "malformed";
}

export function QRInviteFlow({ token, type, invalidReason }: QRInviteFlowProps) {
  const [state, setState] = useState<QRInviteState>(
    invalidReason === "missing"
      ? { status: "error", message: "This invite link is incomplete. Make sure you scanned the full QR code." }
      : invalidReason === "malformed"
      ? { status: "error", message: "This invite link doesn't look right. Ask for a new QR code." }
      : { status: "validating" }
  );
  const ran = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (ran.current) return;
    if (invalidReason) return; // already initialised to error state — skip async flow
    ran.current = true;

    const platform = detectPlatform();

    async function run() {
      // ── Step 1: validate token server-side ──────────────────────────────
      const validation = await validateToken(token);

      if (!mounted.current) return;

      if (!validation.valid || !validation.tokenData) {
        switch (validation.reason) {
          case "expired":
            toast.error("This invite has expired.");
            setState({ status: "expired" });
            break;
          case "used":
            toast.error("This invite has already been used.");
            setState({ status: "used" });
            break;
          case "network_error":
            toast.error("No connection — check your network.");
            setState({ status: "network_error" });
            break;
          default:
            toast.error("Invalid invite link.");
            setState({ status: "invalid" });
        }
        return;
      }

      const tokenData = validation.tokenData;

      // ── Step 2: check Firebase auth session (one-time, then unsubscribe) ─
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe(); // prevent re-triggering on future auth changes

        if (!mounted.current) return;

        if (user) {
          // ── Branch A: trusted existing user ─────────────────────────────
          setState({ status: "completing" });

          try {
            const idToken = await getIdToken(user);

            if (!mounted.current) return;

            const result = await completeInvite(token, user.uid, idToken);

            if (!mounted.current) return;

            if (result.success) {
              if (result.pending) {
                toast.success("Join request sent — waiting for approval.");
                setState({ status: "join_requested", groupName: tokenData.groupName });
              } else {
                toast.success(
                  isGroupType(tokenData.type)
                    ? `You've joined the group!`
                    : `${tokenData.targetDisplayName} added as a ${inviteTypeLabel(tokenData.type)}.`
                );
                setState({
                  status: "success",
                  targetName: tokenData.targetDisplayName,
                  type: tokenData.type,
                });
              }
            } else {
              const msg =
                result.error === "Token expired or used"
                  ? "This invite was already used or has expired."
                  : result.error ?? "Something went wrong.";
              toast.error(msg);
              setState({ status: "error", message: msg });
            }
          } catch {
            if (!mounted.current) return;
            toast.error("Couldn't complete the invite — please try again.");
            setState({ status: "error" });
          }
        } else {
          // ── Branch B: unknown / untrusted user ───────────────────────────
          const deepLink = buildDeepLink(token, type);
          setState({ status: "app_opening", deepLink });

          const appNotInstalled = await attemptAppOpen(deepLink);

          if (!mounted.current) return;

          if (appNotInstalled) {
            setState({ status: "install_app", platform, token, type });
          }
          // If the app opened, the page went to background — no further action needed.
        }
      });
    }

    run().catch(() => {
      if (mounted.current) {
        toast.error("Something went wrong — please try again.");
        setState({ status: "error" });
      }
    });
  }, [token, type, invalidReason]);

  const handlePendingSaved = (platform: Platform) => {
    toast.success("Invite saved — it'll be waiting when you sign up.");
    setState({ status: "pending_saved", platform });
  };

  return (
    <Shell>
      {state.status === "validating" && <ValidatingScreen />}
      {state.status === "invalid" && <InvalidScreen />}
      {state.status === "expired" && <ExpiredScreen />}
      {state.status === "used" && <UsedScreen />}
      {state.status === "network_error" && <NetworkErrorScreen />}
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
      {state.status === "join_requested" && (
        <JoinRequestedScreen groupName={"groupName" in state ? state.groupName : undefined} />
      )}
      {state.status === "resumed" && <ResumedScreen />}
      {state.status === "error" && (
        <ErrorScreen message={"message" in state ? state.message : undefined} />
      )}
    </Shell>
  );
}
