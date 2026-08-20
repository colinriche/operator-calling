// ─── The Firebase project this site uses ─────────────────────────────────────
//
// One project, `operator-calling`, for everything: Auth, admin authority, users,
// groups, memberships, schedules, waitlist and outreach data. It is not
// selectable at runtime and there is no fallback to anywhere else.
//
// That is deliberate. This module previously chose between projects with
// NEXT_PUBLIC_FIREBASE_ENV and resolved server credentials through a chain of
// env-scoped names falling back to unsuffixed ones. Every one of those code
// paths was a way for the browser and the server to end up on *different*
// projects — tokens issued by one and verified against another, sign-ins that
// appear to work and then find no data. With a single hard-coded project that
// class of failure cannot be expressed.
//
// This says nothing about the mobile app, which has its own dev flavour and its
// own project. The app carries its config in lib/firebase_options.dart and reads
// nothing from here; what changed is only that *this website* can no longer be
// pointed anywhere but production.
//
// If a second project is ever genuinely needed here, add it as an explicit,
// tested code path — do not reintroduce a silent default or a fallback.
//
// The client config below is public by design: Firebase web config identifies a
// project, it does not grant access to it. Access is decided by Firestore and
// Storage rules and by Auth. The mobile app commits the same values in
// lib/firebase_options.dart. Server credentials are NOT here — those are real
// secrets and stay in the environment.

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// Read from the live project with `firebase apps:sdkconfig WEB`, not copied from
// documentation. `operator-calling` has exactly one web app.
const CLIENT_CONFIG: FirebaseClientConfig = {
  apiKey: "AIzaSyC_R2854WYyC5pYG7kvi_V6fN4qBemaiFI",
  authDomain: "operator-calling.firebaseapp.com",
  projectId: "operator-calling",
  storageBucket: "operator-calling.firebasestorage.app",
  messagingSenderId: "858295006183",
  appId: "1:858295006183:web:b4e7c6e6a59f5109394342",
  measurementId: "G-WPD40NB0LG",
};

/** The web config, identical on server and client. */
export function firebaseClientConfig(): FirebaseClientConfig {
  return CLIENT_CONFIG;
}

/**
 * The project this deployment reads and writes — safe on both server and
 * client. Anything naming the project (a Cloud Function URL, a stored
 * `groupProject` field) must derive it from here.
 */
export function firebaseProjectId(): string {
  return CLIENT_CONFIG.projectId;
}

// ─── Server credentials ──────────────────────────────────────────────────────

/** The names are fixed; nothing else is consulted if these are unset. */
export const CLIENT_EMAIL_VAR = "FIREBASE_CLIENT_EMAIL";
export const PRIVATE_KEY_VAR = "FIREBASE_PRIVATE_KEY";

export interface AdminCredentials {
  clientEmail: string | undefined;
  privateKey: string | undefined;
}

/**
 * The service-account credentials, which must belong to `operator-calling`.
 *
 * Read on each call rather than at module scope: these are server-only, so
 * unlike the NEXT_PUBLIC_* values this file used to carry, they need no
 * build-time inlining and can be looked up lazily.
 */
export function adminCredentials(): AdminCredentials {
  return {
    clientEmail: process.env[CLIENT_EMAIL_VAR],
    privateKey: process.env[PRIVATE_KEY_VAR],
  };
}
