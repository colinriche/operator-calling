import { initializeApp, getApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";

// ─── One Firebase project, chosen by environment ─────────────────────────────
//
// The website talks to exactly one Firebase project at a time — `operator-calling`
// by default, or the `webrtc-clone-dc88c` development project when
// NEXT_PUBLIC_FIREBASE_ENV says so. Auth, the `admins` collection, users,
// groups, memberships, schedules, waitlist and outreach data all live in
// whichever one is selected, and every server route reaches them through the
// single Admin SDK app below.
//
// The project id comes from lib/firebase-env.ts — the same module the browser
// client reads in lib/firebase.ts. Server and client therefore cannot drift
// apart: whatever project the browser signs in against is the project whose
// tokens this file verifies and whose data it reads. That split is what
// previously made a valid sign-in produce "insufficient permissions" and admin
// lookups that found nothing.
//
// Credentials must be a service account belonging to that same project. Set the
// environment-scoped pair so both can coexist and one variable flips the site:
//
//   NEXT_PUBLIC_FIREBASE_ENV     prod
//   FIREBASE_CLIENT_EMAIL_PROD   firebase-adminsdk-…@operator-calling.iam.gserviceaccount.com
//   FIREBASE_PRIVATE_KEY_PROD    its private key
//   FIREBASE_CLIENT_EMAIL_DEV    firebase-adminsdk-…@webrtc-clone-dc88c.iam.gserviceaccount.com
//   FIREBASE_PRIVATE_KEY_DEV     its private key
//
// The unsuffixed FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY still work as a
// fallback, so a deployment that has only ever set those keeps running.

import { adminCredentials, firebaseProjectId } from "./firebase-env";

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
  const { clientEmail, privateKey, clientEmailVar, privateKeyVar } =
    adminCredentials();

  const missing: string[] = [];
  if (!projectId) missing.push("NEXT_PUBLIC_FIREBASE_ENV (or its project id)");
  if (!clientEmail) missing.push(clientEmailVar);
  if (!privateKey) missing.push(privateKeyVar);
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
      `[firebase-admin] ${clientEmailVar} (${clientEmail}) does not belong ` +
        `to ${projectId}. The service account must be from the same project the ` +
        `site is configured for (NEXT_PUBLIC_FIREBASE_ENV).`
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
