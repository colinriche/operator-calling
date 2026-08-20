import { describe, it, expect, afterEach } from "vitest";
import {
  adminCredentials,
  firebaseClientConfig,
  firebaseProjectId,
  CLIENT_EMAIL_VAR,
  PRIVATE_KEY_VAR,
} from "../lib/firebase-env";

// The project is a constant now, so most of what this file used to cover —
// selecting between projects, rejecting stale NEXT_PUBLIC_* values, refusing a
// partial custom config, preferring one credential name over another — no longer
// exists to be tested. What remains is that the one config is internally
// consistent and that credentials come from exactly two variables.

const CREDENTIAL_VARS = [CLIENT_EMAIL_VAR, PRIVATE_KEY_VAR];

afterEach(() => {
  for (const key of CREDENTIAL_VARS) delete process.env[key];
});

describe("client config", () => {
  it("is operator-calling and nothing else", () => {
    expect(firebaseProjectId()).toBe("operator-calling");
  });

  it("is internally consistent — every field names the same project", () => {
    const cfg = firebaseClientConfig();
    const projectId = cfg.projectId;
    expect(cfg.authDomain).toBe(`${projectId}.firebaseapp.com`);
    expect(cfg.storageBucket).toBe(`${projectId}.firebasestorage.app`);
    // appId embeds the sender id: 1:<messagingSenderId>:web:<hash>
    expect(cfg.appId.startsWith(`1:${cfg.messagingSenderId}:web:`)).toBe(true);
    expect(cfg.apiKey).toBeTruthy();
  });

  it("cannot be steered by the environment", () => {
    // The variables that used to select a project are now inert. Anything that
    // reintroduces a runtime switch should fail here.
    process.env.NEXT_PUBLIC_FIREBASE_ENV = "dev";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "some-other-project";
    try {
      expect(firebaseProjectId()).toBe("operator-calling");
      expect(firebaseClientConfig().apiKey).not.toBe("");
    } finally {
      delete process.env.NEXT_PUBLIC_FIREBASE_ENV;
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    }
  });
});

describe("admin credentials", () => {
  it("reads exactly the two unsuffixed variables", () => {
    process.env[CLIENT_EMAIL_VAR] = "sa@operator-calling.iam.gserviceaccount.com";
    process.env[PRIVATE_KEY_VAR] = "the-key";

    expect(adminCredentials()).toEqual({
      clientEmail: "sa@operator-calling.iam.gserviceaccount.com",
      privateKey: "the-key",
    });
  });

  it("has no fallback — unset means undefined, not a default", () => {
    // The old module fell back through _PROD/_DEV names. A silent default here
    // is how a deployment ends up authenticating as the wrong project.
    process.env.FIREBASE_CLIENT_EMAIL_PROD = "prod@x.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY_PROD = "prod-key";
    try {
      const creds = adminCredentials();
      expect(creds.clientEmail).toBeUndefined();
      expect(creds.privateKey).toBeUndefined();
    } finally {
      delete process.env.FIREBASE_CLIENT_EMAIL_PROD;
      delete process.env.FIREBASE_PRIVATE_KEY_PROD;
    }
  });

  it("reads lazily, so a value set after import is picked up", () => {
    expect(adminCredentials().privateKey).toBeUndefined();
    process.env[PRIVATE_KEY_VAR] = "set-later";
    expect(adminCredentials().privateKey).toBe("set-later");
  });
});
