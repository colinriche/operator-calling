// ─── Token types ─────────────────────────────────────────────────────────────

export type InviteType = "personal" | "group";

export interface QRToken {
  token: string;
  targetUserId: string;
  targetDisplayName: string;
  type: InviteType;
  groupId?: string;
  groupName?: string;
  createdAt: string; // ISO
  expiresAt: string; // ISO
  status: "active" | "used" | "expired";
}

// ─── UI state machine ─────────────────────────────────────────────────────────

export type QRInviteState =
  | { status: "validating" }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "trusted"; tokenData: QRToken }
  | { status: "completing" }
  | { status: "success"; targetName: string; type: InviteType }
  | { status: "app_opening"; deepLink: string }
  | { status: "install_app"; platform: Platform; token: string; type: InviteType }
  | { status: "pending_saved"; platform: Platform }
  | { status: "resumed" }
  | { status: "error"; message?: string };

export type Platform = "ios" | "android" | "web";

// ─── Platform detection ───────────────────────────────────────────────────────

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "web";
}

// ─── Deep link ────────────────────────────────────────────────────────────────

export function buildDeepLink(token: string, type: InviteType): string {
  return `operatorcalling://invite?token=${encodeURIComponent(token)}&type=${type}`;
}

/**
 * Attempts to open the app via deep link.
 * Resolves true if we're still on the page after the timeout
 * (meaning the app was likely not installed).
 */
export function attemptAppOpen(deepLink: string, timeoutMs = 1800): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    window.location.href = deepLink;

    const timer = setTimeout(() => {
      resolve(true); // still on page → app not installed
    }, timeoutMs);

    const onVisibilityChange = () => {
      if (document.hidden) {
        // App opened — page went to background
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        // Give it a moment, then resolve false (app opened)
        setTimeout(() => resolve(false), 500);
      }
    };

    // Fallback: if blur fires quickly (app opened), cancel timeout
    const onBlur = () => {
      if (Date.now() - start < timeoutMs) {
        clearTimeout(timer);
        window.removeEventListener("blur", onBlur);
        setTimeout(() => resolve(false), 500);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
  });
}

// ─── Store URLs ───────────────────────────────────────────────────────────────

export const STORE_URLS = {
  ios: "https://apps.apple.com/app/the-operator/id0000000000",
  android: "https://play.google.com/store/apps/details?id=com.theoperator",
} as const;

// ─── API helpers ──────────────────────────────────────────────────────────────

export interface ValidateResponse {
  valid: boolean;
  reason?: "expired" | "invalid" | "used";
  tokenData?: QRToken;
}

export interface CompleteResponse {
  success: boolean;
  error?: string;
}

export interface PendingResponse {
  success: boolean;
  pendingId?: string;
  error?: string;
}

export async function validateToken(token: string): Promise<ValidateResponse> {
  const res = await fetch(`/api/qrinvite/validate?token=${encodeURIComponent(token)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) return { valid: false, reason: "invalid" };
  return res.json() as Promise<ValidateResponse>;
}

export async function completeInvite(
  token: string,
  currentUserId: string,
  idToken: string
): Promise<CompleteResponse> {
  const res = await fetch("/api/qrinvite/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token, currentUserId }),
  });
  if (!res.ok) return { success: false, error: "Request failed" };
  return res.json() as Promise<CompleteResponse>;
}

export async function createPendingConnection(
  token: string,
  platform: Platform
): Promise<PendingResponse> {
  const res = await fetch("/api/qrinvite/pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) return { success: false };
  return res.json() as Promise<PendingResponse>;
}
