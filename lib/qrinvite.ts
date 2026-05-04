// ─── Token types ─────────────────────────────────────────────────────────────

export type InviteType =
  | "personal"
  | "family"
  | "work"
  | "sport"
  | "social"
  | "event"
  | "group"
  | "other";

export interface QRToken {
  token: string;
  targetUserId: string;
  targetDisplayName: string;
  type: InviteType;
  ctx?: string; // e.g. company name for "work", sport name for "sport"
  groupId?: string;
  groupName?: string;
  isPrivate?: boolean; // for group type: whether approval is required
  createdAt: string; // ISO
  expiresAt: string; // ISO
  status: "active" | "used" | "expired";
}

export function isGroupType(type: InviteType): boolean {
  return type === "group";
}

export function inviteTypeLabel(type: InviteType): string {
  switch (type) {
    case "family":  return "family contact";
    case "work":    return "work contact";
    case "sport":   return "sport contact";
    case "social":  return "social contact";
    case "event":   return "contact";
    case "group":   return "group";
    default:        return "contact";
  }
}

// ─── UI state machine ─────────────────────────────────────────────────────────

export type QRInviteState =
  | { status: "validating" }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "used" }
  | { status: "network_error" }
  | { status: "trusted"; tokenData: QRToken }
  | { status: "completing" }
  | { status: "success"; targetName: string; type: InviteType; isGroup: boolean }
  | { status: "join_requested"; groupName?: string }
  | { status: "app_opening"; deepLink: string }
  | { status: "install_app"; platform: Platform; token: string; type: InviteType }
  | { status: "pending_saved"; platform: Platform; token: string; type: InviteType; emailSaved: boolean }
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
  android: "https://play.google.com/apps/internaltest/4701595307879698515",
} as const;

// ─── API helpers ──────────────────────────────────────────────────────────────

export interface ValidateResponse {
  valid: boolean;
  reason?: "expired" | "invalid" | "used" | "network_error";
  tokenData?: QRToken;
}

export interface CompleteResponse {
  success: boolean;
  pending?: boolean; // true when a join request was submitted (private group)
  error?: string;
}

export interface PendingResponse {
  success: boolean;
  pendingId?: string;
  error?: string;
}

export async function validateToken(token: string): Promise<ValidateResponse> {
  try {
    const res = await fetch(`/api/qrinvite/validate?token=${encodeURIComponent(token)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return { valid: false, reason: "invalid" };
    return res.json() as Promise<ValidateResponse>;
  } catch {
    return { valid: false, reason: "network_error" };
  }
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
  platform: Platform,
  email?: string
): Promise<PendingResponse> {
  const res = await fetch("/api/qrinvite/pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform, ...(email ? { email } : {}) }),
  });
  if (!res.ok) return { success: false };
  return res.json() as Promise<PendingResponse>;
}
