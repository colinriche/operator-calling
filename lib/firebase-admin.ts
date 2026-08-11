import { initializeApp, getApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";

// ─── Multi-project Firebase Admin ─────────────────────────────────────────────
//
// One deployment serves two mobile apps that write to two different Firebase
// projects:
//   • "dev"     → the primary project (webrtc-clone-dc88c) — the site's own
//                 Firebase project, used for web auth and every non-invite route.
//   • "staging" → the secondary project (operator-calling) — where the
//                 staging/main app writes its QR invites, groups and contacts.
//
// The "dev" credentials come from the existing NEXT_PUBLIC_FIREBASE_PROJECT_ID /
// FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY vars and back the DEFAULT admin
// app, so existing routes are unaffected. The "staging" credentials come from
// FIREBASE_PROJECT_ID_STAGING / FIREBASE_CLIENT_EMAIL_STAGING /
// FIREBASE_PRIVATE_KEY_STAGING and back a named admin app.

export type ProjectKey = "dev" | "staging";

interface ProjectCredentials {
  key: ProjectKey;
  /** Named admin app to use; "dev" uses the DEFAULT app for backwards-compat. */
  appName?: string;
  projectIdVar: string;
  clientEmailVar: string;
  privateKeyVar: string;
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
}

const PROJECTS: Record<ProjectKey, ProjectCredentials> = {
  dev: {
    key: "dev",
    // appName omitted → DEFAULT app (preserves prior behaviour exactly)
    projectIdVar: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    clientEmailVar: "FIREBASE_CLIENT_EMAIL",
    privateKeyVar: "FIREBASE_PRIVATE_KEY",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  },
  staging: {
    key: "staging",
    appName: "staging",
    projectIdVar: "FIREBASE_PROJECT_ID_STAGING",
    clientEmailVar: "FIREBASE_CLIENT_EMAIL_STAGING",
    privateKeyVar: "FIREBASE_PRIVATE_KEY_STAGING",
    projectId: process.env.FIREBASE_PROJECT_ID_STAGING,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL_STAGING,
    privateKey: process.env.FIREBASE_PRIVATE_KEY_STAGING,
  },
};

/** True when a project has all three credential vars present. */
function isConfigured(cfg: ProjectCredentials): boolean {
  return !!(cfg.projectId && cfg.clientEmail && cfg.privateKey);
}

/** Whether the secondary (staging / operator-calling) project is configured. */
export function hasStagingProject(): boolean {
  return isConfigured(PROJECTS.staging);
}

/**
 * Configured project keys, in lookup order. "dev" (primary) is always included;
 * "staging" only when its credentials are present.
 */
export function getConfiguredProjectKeys(): ProjectKey[] {
  const keys: ProjectKey[] = ["dev"];
  if (hasStagingProject()) keys.push("staging");
  return keys;
}

/**
 * Initialize (or reuse) the firebase-admin App for a project. Guarded against
 * re-init. Throws a clear error naming the missing env var(s) if unconfigured.
 */
function getProjectApp(key: ProjectKey): App {
  const cfg = PROJECTS[key];

  // Reuse an already-initialized app (default or named).
  try {
    return cfg.appName ? getApp(cfg.appName) : getApp();
  } catch {
    // not yet initialized — fall through
  }

  const missing: string[] = [];
  if (!cfg.projectId) missing.push(cfg.projectIdVar);
  if (!cfg.clientEmail) missing.push(cfg.clientEmailVar);
  if (!cfg.privateKey) missing.push(cfg.privateKeyVar);
  if (missing.length) {
    throw new Error(
      `[firebase-admin] Cannot initialize "${key}" Firebase project — missing environment variable(s): ${missing.join(
        ", "
      )}. Set them in the Vercel project settings.`
    );
  }

  const credential = cert({
    projectId: cfg.projectId,
    clientEmail: cfg.clientEmail,
    privateKey: cfg.privateKey!.replace(/\\n/g, "\n"),
  });

  return cfg.appName
    ? initializeApp({ credential }, cfg.appName)
    : initializeApp({ credential });
}

/** Firestore handle for a specific project. */
export function getProjectDb(key: ProjectKey): Firestore {
  return getFirestore(getProjectApp(key));
}

/** Auth handle for a specific project. */
export function getProjectAuth(key: ProjectKey): Auth {
  return getAuth(getProjectApp(key));
}

/**
 * Verify a Firebase ID token against each configured project, returning the
 * decoded identity plus the project that accepted it. A given ID token is only
 * valid for the project that issued it, so this lets one endpoint serve callers
 * authenticated against either app. Returns null if no project accepts it.
 */
export async function verifyIdTokenAnyProject(idToken: string): Promise<{
  uid: string;
  phone: string | null;
  email: string | null;
  project: ProjectKey;
  /**
   * The full decoded token, including custom claims. Sessions minted by
   * /api/admin/token are custom-token sessions with no `email` claim of their
   * own, so the admin gate reads the email out of here.
   */
  decoded: DecodedIdToken;
} | null> {
  for (const key of getConfiguredProjectKeys()) {
    let auth: Auth;
    try {
      auth = getProjectAuth(key);
    } catch (err) {
      console.error(`[firebase-admin] "${key}" auth unavailable:`, (err as Error).message);
      continue;
    }
    try {
      const decoded = await auth.verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        phone: decoded.phone_number ?? null,
        email: decoded.email?.toLowerCase() ?? null,
        project: key,
        decoded,
      };
    } catch {
      // Not issued by this project — try the next one.
    }
  }
  return null;
}

// ─── Backwards-compatible default (primary / dev project) helpers ─────────────

export function getAdminServices(): { db: Firestore; adminAuth: Auth } {
  const app = getProjectApp("dev");
  return { db: getFirestore(app), adminAuth: getAuth(app) };
}

export async function verifyAuth(authHeader: string): Promise<string | null> {
  const { adminAuth } = getAdminServices();
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}
