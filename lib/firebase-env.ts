// ─── Which Firebase project this deployment uses ─────────────────────────────
//
// One variable picks the project for the whole site:
//
//   NEXT_PUBLIC_FIREBASE_ENV = prod | dev | custom      (default: prod)
//
// The browser client (lib/firebase.ts) and the Admin SDK (lib/firebase-admin.ts)
// both resolve through here, so the two can never point at different projects.
// That split — a token issued by one project and verified against another — is
// what produced sign-ins that "worked" and then hit `Missing or insufficient
// permissions`, and it is the one failure this module exists to make impossible.
//
// `prod` and `dev` carry a complete, baked-in client config, so switching is one
// variable rather than six. These values are public by design: Firebase web
// config identifies a project, it does not grant access to it (access is decided
// by Firestore/Storage rules and Auth). The mobile app commits the same values
// in lib/firebase_options.dart. Server credentials are NOT baked in — those are
// real secrets and stay in the environment.
//
// `custom` is the escape hatch: a third project, or the emulator suite. It reads
// the full NEXT_PUBLIC_FIREBASE_* set and refuses a partial one, because a
// half-applied override is how configs drift.

export type FirebaseEnvName = "prod" | "dev" | "custom";

/** Used when NEXT_PUBLIC_FIREBASE_ENV is unset or unrecognised. */
export const DEFAULT_FIREBASE_ENV: FirebaseEnvName = "prod";

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// Read from the live projects with `firebase apps:sdkconfig WEB`, not copied
// from documentation. Each project has exactly one web app.
const BAKED_CONFIGS: Record<"prod" | "dev", FirebaseClientConfig> = {
  // The Operator — the project the website and the shipping mobile app use.
  prod: {
    apiKey: "AIzaSyC_R2854WYyC5pYG7kvi_V6fN4qBemaiFI",
    authDomain: "operator-calling.firebaseapp.com",
    projectId: "operator-calling",
    storageBucket: "operator-calling.firebasestorage.app",
    messagingSenderId: "858295006183",
    appId: "1:858295006183:web:b4e7c6e6a59f5109394342",
    measurementId: "G-WPD40NB0LG",
  },
  // flutter_web_rtc_with_call_kit — the development project, matching the
  // mobile app's `dev` flavour and dart-defines/dev.json.
  dev: {
    apiKey: "AIzaSyBD27la_D0uLOYmat3UxjmGxt2jlUqS0-I",
    authDomain: "webrtc-clone-dc88c.firebaseapp.com",
    projectId: "webrtc-clone-dc88c",
    storageBucket: "webrtc-clone-dc88c.firebasestorage.app",
    messagingSenderId: "814468863288",
    appId: "1:814468863288:web:d615ec71bf63bffa8a9dcd",
  },
};

// Next.js inlines NEXT_PUBLIC_* only where it can see the whole expression as a
// literal, so every variable is written out in full. Do not build these names
// dynamically — the browser bundle would get `undefined`.
const RAW_ENV = process.env.NEXT_PUBLIC_FIREBASE_ENV;
const CUSTOM_CONFIG_VARS = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const;

const REQUIRED_CUSTOM_VARS: Record<keyof typeof CUSTOM_CONFIG_VARS, string> = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
};

/** The environment this deployment is configured for. */
export function resolveFirebaseEnv(): FirebaseEnvName {
  const value = RAW_ENV?.trim().toLowerCase();
  if (value === "prod" || value === "production") return "prod";
  if (value === "dev" || value === "development") return "dev";
  if (value === "custom") return "custom";
  if (value) {
    console.warn(
      `[firebase] NEXT_PUBLIC_FIREBASE_ENV="${RAW_ENV}" is not one of ` +
        `prod | dev | custom — falling back to ${DEFAULT_FIREBASE_ENV}.`
    );
  }
  return DEFAULT_FIREBASE_ENV;
}

/** The client config for the resolved environment. */
export function firebaseClientConfig(): FirebaseClientConfig {
  const env = resolveFirebaseEnv();
  if (env !== "custom") return BAKED_CONFIGS[env];

  const missing = (
    Object.keys(REQUIRED_CUSTOM_VARS) as (keyof typeof CUSTOM_CONFIG_VARS)[]
  ).filter((key) => !CUSTOM_CONFIG_VARS[key]);

  if (missing.length) {
    throw new Error(
      `[firebase] NEXT_PUBLIC_FIREBASE_ENV=custom requires the full client ` +
        `config, but these are unset: ` +
        `${missing.map((key) => REQUIRED_CUSTOM_VARS[key]).join(", ")}. ` +
        `Set them, or use NEXT_PUBLIC_FIREBASE_ENV=prod|dev for a baked-in project.`
    );
  }

  return {
    apiKey: CUSTOM_CONFIG_VARS.apiKey!,
    authDomain: CUSTOM_CONFIG_VARS.authDomain!,
    projectId: CUSTOM_CONFIG_VARS.projectId!,
    storageBucket: CUSTOM_CONFIG_VARS.storageBucket!,
    messagingSenderId: CUSTOM_CONFIG_VARS.messagingSenderId!,
    appId: CUSTOM_CONFIG_VARS.appId!,
  };
}

/**
 * The project this deployment reads and writes — safe on both server and
 * client. Anything naming the project (a Cloud Function URL, a stored
 * `groupProject` field) must derive it from here.
 */
export function firebaseProjectId(): string {
  return firebaseClientConfig().projectId;
}

// ─── Server credentials ──────────────────────────────────────────────────────
//
// Per-environment names let both service accounts sit in Vercel at once, so
// flipping NEXT_PUBLIC_FIREBASE_ENV moves the server with the client instead of
// stranding it on the wrong project's credentials. The unsuffixed pair is the
// fallback, which is what existing deployments already have set.

const ADMIN_CREDENTIAL_VARS = {
  prod: {
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL_PROD,
    privateKey: process.env.FIREBASE_PRIVATE_KEY_PROD,
    clientEmailVar: "FIREBASE_CLIENT_EMAIL_PROD",
    privateKeyVar: "FIREBASE_PRIVATE_KEY_PROD",
  },
  dev: {
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL_DEV,
    privateKey: process.env.FIREBASE_PRIVATE_KEY_DEV,
    clientEmailVar: "FIREBASE_CLIENT_EMAIL_DEV",
    privateKeyVar: "FIREBASE_PRIVATE_KEY_DEV",
  },
} as const;

const FALLBACK_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FALLBACK_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

export interface AdminCredentials {
  clientEmail: string | undefined;
  privateKey: string | undefined;
  /** Variable names to name in an error, matching where we actually looked. */
  clientEmailVar: string;
  privateKeyVar: string;
}

/**
 * Credentials for the resolved environment: the env-suffixed pair when set,
 * otherwise the unsuffixed pair. Email and key are resolved together so a
 * deployment can never pair one project's email with another's key.
 */
export function adminCredentials(): AdminCredentials {
  const env = resolveFirebaseEnv();
  const scoped = env === "custom" ? undefined : ADMIN_CREDENTIAL_VARS[env];

  if (scoped?.clientEmail && scoped?.privateKey) {
    return {
      clientEmail: scoped.clientEmail,
      privateKey: scoped.privateKey,
      clientEmailVar: scoped.clientEmailVar,
      privateKeyVar: scoped.privateKeyVar,
    };
  }

  if (scoped && (scoped.clientEmail || scoped.privateKey)) {
    console.warn(
      `[firebase-admin] Only one half of ${scoped.clientEmailVar} / ` +
        `${scoped.privateKeyVar} is set — ignoring both and falling back to ` +
        `FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.`
    );
  }

  return {
    clientEmail: FALLBACK_CLIENT_EMAIL,
    privateKey: FALLBACK_PRIVATE_KEY,
    clientEmailVar: "FIREBASE_CLIENT_EMAIL",
    privateKeyVar: "FIREBASE_PRIVATE_KEY",
  };
}
