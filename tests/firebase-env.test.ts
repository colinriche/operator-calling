import { describe, it, expect, afterEach, vi } from "vitest";

// lib/firebase-env.ts reads process.env at module scope (Next.js inlines
// NEXT_PUBLIC_* at build time, so it cannot be read lazily). Each case therefore
// sets the environment and re-imports the module.
async function loadEnvModule(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../lib/firebase-env");
}

const FIREBASE_VARS = [
  "NEXT_PUBLIC_FIREBASE_ENV",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL_PROD",
  "FIREBASE_PRIVATE_KEY_PROD",
  "FIREBASE_CLIENT_EMAIL_DEV",
  "FIREBASE_PRIVATE_KEY_DEV",
];

const CLEARED = Object.fromEntries(FIREBASE_VARS.map((k) => [k, undefined]));

afterEach(() => {
  for (const key of FIREBASE_VARS) delete process.env[key];
});

describe("environment selection", () => {
  it("defaults to prod when nothing is set", async () => {
    const m = await loadEnvModule(CLEARED);
    expect(m.resolveFirebaseEnv()).toBe("prod");
    expect(m.firebaseProjectId()).toBe("operator-calling");
  });

  it("selects the dev project", async () => {
    const m = await loadEnvModule({ ...CLEARED, NEXT_PUBLIC_FIREBASE_ENV: "dev" });
    expect(m.firebaseProjectId()).toBe("webrtc-clone-dc88c");
  });

  it("accepts the long spellings and is case-insensitive", async () => {
    for (const [value, projectId] of [
      ["development", "webrtc-clone-dc88c"],
      ["PROD", "operator-calling"],
      ["Development", "webrtc-clone-dc88c"],
    ] as const) {
      const m = await loadEnvModule({ ...CLEARED, NEXT_PUBLIC_FIREBASE_ENV: value });
      expect(m.firebaseProjectId()).toBe(projectId);
    }
  });

  it("falls back to prod on an unrecognised value rather than half-configuring", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await loadEnvModule({ ...CLEARED, NEXT_PUBLIC_FIREBASE_ENV: "staging" });
    expect(m.firebaseProjectId()).toBe("operator-calling");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("client config", () => {
  it("is internally consistent — every field names the same project", async () => {
    for (const [env, projectId] of [
      ["prod", "operator-calling"],
      ["dev", "webrtc-clone-dc88c"],
    ] as const) {
      const m = await loadEnvModule({ ...CLEARED, NEXT_PUBLIC_FIREBASE_ENV: env });
      const cfg = m.firebaseClientConfig();
      expect(cfg.projectId).toBe(projectId);
      expect(cfg.authDomain).toBe(`${projectId}.firebaseapp.com`);
      expect(cfg.storageBucket).toBe(`${projectId}.firebasestorage.app`);
      // appId embeds the sender id: 1:<messagingSenderId>:web:<hash>
      expect(cfg.appId.startsWith(`1:${cfg.messagingSenderId}:web:`)).toBe(true);
      expect(cfg.apiKey).toBeTruthy();
    }
  });

  it("ignores stale NEXT_PUBLIC_FIREBASE_* vars unless env is custom", async () => {
    // The drift this guards against: Vercel still holding the other project's
    // values while NEXT_PUBLIC_FIREBASE_ENV says prod.
    const m = await loadEnvModule({
      ...CLEARED,
      NEXT_PUBLIC_FIREBASE_ENV: "prod",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "webrtc-clone-dc88c",
      NEXT_PUBLIC_FIREBASE_API_KEY: "stale-key",
    });
    expect(m.firebaseProjectId()).toBe("operator-calling");
    expect(m.firebaseClientConfig().apiKey).not.toBe("stale-key");
  });

  it("uses the explicit config when env is custom", async () => {
    const m = await loadEnvModule({
      ...CLEARED,
      NEXT_PUBLIC_FIREBASE_ENV: "custom",
      NEXT_PUBLIC_FIREBASE_API_KEY: "k",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "other.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "other-project",
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "other.firebasestorage.app",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:x",
    });
    expect(m.firebaseProjectId()).toBe("other-project");
  });

  it("refuses a partial custom config instead of building a mixed one", async () => {
    const m = await loadEnvModule({
      ...CLEARED,
      NEXT_PUBLIC_FIREBASE_ENV: "custom",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "other-project",
    });
    expect(() => m.firebaseClientConfig()).toThrow(
      /NEXT_PUBLIC_FIREBASE_API_KEY/
    );
  });
});

describe("admin credentials", () => {
  it("prefers the environment-scoped pair", async () => {
    const m = await loadEnvModule({
      ...CLEARED,
      NEXT_PUBLIC_FIREBASE_ENV: "dev",
      FIREBASE_CLIENT_EMAIL: "fallback@x.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "fallback-key",
      FIREBASE_CLIENT_EMAIL_DEV: "dev@webrtc-clone-dc88c.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY_DEV: "dev-key",
    });
    const creds = m.adminCredentials();
    expect(creds.clientEmail).toBe("dev@webrtc-clone-dc88c.iam.gserviceaccount.com");
    expect(creds.privateKey).toBe("dev-key");
  });

  it("keeps working for deployments that only set the unsuffixed pair", async () => {
    const m = await loadEnvModule({
      ...CLEARED,
      NEXT_PUBLIC_FIREBASE_ENV: "prod",
      FIREBASE_CLIENT_EMAIL: "sa@operator-calling.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "the-key",
    });
    const creds = m.adminCredentials();
    expect(creds.clientEmail).toBe("sa@operator-calling.iam.gserviceaccount.com");
    expect(creds.clientEmailVar).toBe("FIREBASE_CLIENT_EMAIL");
  });

  it("never pairs one project's email with another's key", async () => {
    // Half a scoped pair must not combine with half the fallback.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await loadEnvModule({
      ...CLEARED,
      NEXT_PUBLIC_FIREBASE_ENV: "dev",
      FIREBASE_CLIENT_EMAIL: "fallback@x.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "fallback-key",
      FIREBASE_CLIENT_EMAIL_DEV: "dev@webrtc-clone-dc88c.iam.gserviceaccount.com",
      // FIREBASE_PRIVATE_KEY_DEV deliberately missing
    });
    const creds = m.adminCredentials();
    expect(creds.clientEmail).toBe("fallback@x.iam.gserviceaccount.com");
    expect(creds.privateKey).toBe("fallback-key");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reports the variable names it actually looked at", async () => {
    const m = await loadEnvModule({ ...CLEARED, NEXT_PUBLIC_FIREBASE_ENV: "prod" });
    const creds = m.adminCredentials();
    expect(creds.clientEmail).toBeUndefined();
    expect(creds.clientEmailVar).toBe("FIREBASE_CLIENT_EMAIL");
  });
});
