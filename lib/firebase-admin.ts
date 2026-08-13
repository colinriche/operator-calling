import { initializeApp, getApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";

// ─── One Firebase project ────────────────────────────────────────────────────
//
// The website talks to exactly one Firebase project: `operator-calling`. Auth,
// the `admins` collection, users, groups, memberships, schedules, waitlist and
// outreach data all live there, and every server route reaches them through the
// single Admin SDK app below.
//
// The project id deliberately comes from NEXT_PUBLIC_FIREBASE_PROJECT_ID — the
// same variable the browser client reads in lib/firebase.ts. Server and client
// therefore cannot drift apart: whatever project the browser signs in against
// is the project whose tokens this file verifies and whose data it reads. That
// split is what previously made a valid sign-in produce "insufficient
// permissions" and admin lookups that found nothing.
//
// Credentials must be a service account belonging to that same project:
//
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID   operator-calling
//   FIREBASE_CLIENT_EMAIL             firebase-adminsdk-…@operator-calling.iam.gserviceaccount.com
//   FIREBASE_PRIVATE_KEY              its private key

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

/** The project this deployment reads and writes. */
export function firebaseProjectId(): string {
  return PROJECT_ID ?? "";
}

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

  const missing: string[] = [];
  if (!PROJECT_ID) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!PRIVATE_KEY) missing.push("FIREBASE_PRIVATE_KEY");
  if (missing.length) {
    throw new Error(
      `[firebase-admin] Cannot initialize Firebase — missing environment ` +
        `variable(s): ${missing.join(", ")}. Set them in the Vercel project settings.`
    );
  }

  // A service account from a different project is the one misconfiguration that
  // produces confusing, apparently unrelated failures — token verification
  // rejecting valid sign-ins, admin lookups finding nothing. Say so plainly.
  if (!CLIENT_EMAIL!.endsWith(`@${PROJECT_ID}.iam.gserviceaccount.com`)) {
    console.warn(
      `[firebase-admin] FIREBASE_CLIENT_EMAIL (${CLIENT_EMAIL}) does not belong ` +
        `to ${PROJECT_ID}. The service account must be from the same project as ` +
        `NEXT_PUBLIC_FIREBASE_PROJECT_ID.`
    );
  }

  return initializeApp({
    credential: cert({
      projectId: PROJECT_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey: PRIVATE_KEY!.replace(/\\n/g, "\n"),
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
