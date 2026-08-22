import { initializeApp, getApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";

// ─── One Firebase project, chosen by environment ─────────────────────────────
//
// The website talks to exactly one Firebase project, `operator-calling`. Auth,
// the `admins` collection, users, groups, memberships, schedules, waitlist and
// outreach data all live there, and every server route reaches them through the
// single Admin SDK app below.
//
// The project id comes from lib/firebase-env.ts — the same module the browser
// client reads in lib/firebase.ts. Server and client therefore cannot drift
// apart: whatever project the browser signs in against is the project whose
// tokens this file verifies and whose data it reads. That split is what
// previously made a valid sign-in produce "insufficient permissions" and admin
// lookups that found nothing.
//
// Credentials must be a service account belonging to that same project. Two
// variables, no alternatives and no fallback:
//
//   FIREBASE_CLIENT_EMAIL   firebase-adminsdk-…@operator-calling.iam.gserviceaccount.com
//   FIREBASE_PRIVATE_KEY    its private key
//
// The key is the PEM from the service-account JSON. Literal `\n` escapes are
// normalised below, so either the escaped or the real multi-line form works —
// but a stray `"` from the surrounding JSON does not, and produces
// `error:1E08010C:DECODER routines::unsupported` on the first Firestore call.

import { getStorage } from "firebase-admin/storage";
import {
  adminCredentials,
  firebaseClientConfig,
  firebaseProjectId,
  CLIENT_EMAIL_VAR,
  PRIVATE_KEY_VAR,
} from "./firebase-env";

export { firebaseProjectId };

/**
 * Initialize (or reuse) the one firebase-admin App. Throws an error naming the
 * missing variable(s) rather than falling back to anything.
 */
export function getAdminApp(): App {
  try {
    return getApp();
  } catch {
    // not yet initialized — fall through
  }

  const projectId = firebaseProjectId();
  const { clientEmail, privateKey } = adminCredentials();

  const missing: string[] = [];
  if (!clientEmail) missing.push(CLIENT_EMAIL_VAR);
  if (!privateKey) missing.push(PRIVATE_KEY_VAR);
  if (missing.length) {
    throw new Error(
      `[firebase-admin] Cannot initialize Firebase — missing environment ` +
        `variable(s): ${missing.join(", ")}. Set them in the Vercel project settings.`
    );
  }

  // A service account from a different project is the one misconfiguration that
  // produces confusing, apparently unrelated failures — token verification
  // rejecting valid sign-ins, admin lookups finding nothing. Say so plainly.
  if (!clientEmail!.endsWith(`@${projectId}.iam.gserviceaccount.com`)) {
    console.warn(
      `[firebase-admin] ${CLIENT_EMAIL_VAR} (${clientEmail}) does not belong ` +
        `to ${projectId}. The service account must be from that project.`
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey!.replace(/\\n/g, "\n"),
    }),
  });
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/**
 * The one Storage bucket, named from the same config the browser client uses.
 *
 * Server-side uploads deliberately: writing through the Admin SDK needs no
 * Storage rules at all, and this project's ruleset is shared with the mobile
 * app — a website feature should not require a rules deploy to work.
 */
export function getAdminBucket() {
  return getStorage(getAdminApp()).bucket(firebaseClientConfig().storageBucket);
}

export function getAdminServices(): { db: Firestore; adminAuth: Auth } {
  const app = getAdminApp();
  return { db: getFirestore(app), adminAuth: getAuth(app) };
}

/**
 * Verify a Firebase ID token and return the caller's identity, or null.
 *
 * `decoded` carries the full claim set. Sessions minted by /api/admin/token are
 * custom-token sessions with no `email` claim of their own, which is why the
 * admin gate reads the email out of there.
 */
export async function verifyIdToken(idToken: string): Promise<{
  uid: string;
  phone: string | null;
  email: string | null;
  decoded: DecodedIdToken;
} | null> {
  let auth: Auth;
  try {
    auth = getAdminAuth();
  } catch (err) {
    console.error("[firebase-admin] auth unavailable:", (err as Error).message);
    return null;
  }

  try {
    const decoded = await auth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      phone: decoded.phone_number ?? null,
      email: decoded.email?.toLowerCase() ?? null,
      decoded,
    };
  } catch {
    return null;
  }
}

export async function verifyAuth(authHeader: string): Promise<string | null> {
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  const identity = await verifyIdToken(token);
  return identity?.uid ?? null;
}
