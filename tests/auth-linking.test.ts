import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  APPLE_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  PHONE_FIRST_MESSAGE,
  canLinkFederatedProvider,
  decideFederatedSignIn,
  hasPhoneProvider,
  linkErrorMessage,
} from "@/lib/auth-linking";
import { POST as retiredLink } from "@/app/api/account/link/route";

describe("decideFederatedSignIn", () => {
  it("refuses a Google/Apple sign-in that just created a new Firebase user (no second account)", () => {
    expect(decideFederatedSignIn({ isNewUser: true, providerIds: [GOOGLE_PROVIDER_ID] })).toBe("reject_unlinked");
    expect(decideFederatedSignIn({ isNewUser: true, providerIds: [APPLE_PROVIDER_ID] })).toBe("reject_unlinked");
  });

  it("allows a provider that was explicitly linked to a phone account", () => {
    expect(
      decideFederatedSignIn({ isNewUser: false, providerIds: ["phone", GOOGLE_PROVIDER_ID] })
    ).toBe("allow_linked");
    expect(
      decideFederatedSignIn({ isNewUser: false, providerIds: [APPLE_PROVIDER_ID, "phone"] })
    ).toBe("allow_linked");
  });

  it("keeps a pre-existing website-only Google/Apple account working, without merging it", () => {
    expect(decideFederatedSignIn({ isNewUser: false, providerIds: [GOOGLE_PROVIDER_ID] })).toBe("allow_legacy");
  });

  it("never lets a matching email change the outcome (email is not an input)", () => {
    expect(Object.keys({ isNewUser: true, providerIds: [] })).not.toContain("email");
    expect(decideFederatedSignIn({ isNewUser: true, providerIds: [] })).toBe("reject_unlinked");
  });

  it("tells the person to use phone first", () => {
    expect(PHONE_FIRST_MESSAGE).toMatch(/phone number first/);
    expect(PHONE_FIRST_MESSAGE).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("linking eligibility", () => {
  it("only a phone-proved user may attach Google/Apple", () => {
    expect(hasPhoneProvider(["phone"])).toBe(true);
    expect(canLinkFederatedProvider(["phone", GOOGLE_PROVIDER_ID])).toBe(true);
    expect(canLinkFederatedProvider([GOOGLE_PROVIDER_ID])).toBe(false);
    expect(canLinkFederatedProvider([])).toBe(false);
  });
});

describe("linkErrorMessage", () => {
  it("explains that a clash is never merged", () => {
    for (const code of ["auth/credential-already-in-use", "auth/email-already-in-use"]) {
      expect(linkErrorMessage(code, "Google")).toMatch(/never merged/);
    }
  });

  it("covers the common failures and defers the rest", () => {
    expect(linkErrorMessage("auth/provider-already-linked", "Apple")).toMatch(/already linked/);
    expect(linkErrorMessage("auth/popup-blocked")).toMatch(/pop-ups/);
    expect(linkErrorMessage("auth/something-new")).toBeNull();
  });
});

describe("retired /api/account/link", () => {
  it("answers 410 with an explanation and does no work", async () => {
    const res = await retiredLink();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.status).toBe("retired");
    expect(body.message).toMatch(/phone number/);
  });

  it("no longer touches the database or accepts a systemName", () => {
    const src = readFileSync(path.join(__dirname, "../app/api/account/link/route.ts"), "utf8");
    expect(src).not.toMatch(/firebase-admin/);
    expect(src).not.toMatch(/where\(|runTransaction|\.delete\(/);
  });
});

describe("email is not used as proof of identity", () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, "..", rel), "utf8");

  it("useAuth does not look a profile up by email", () => {
    expect(read("hooks/useAuth.ts")).not.toMatch(/where\("email"/);
  });

  it("sign-in does not treat an existing email as an existing account", () => {
    expect(read("components/auth/SignInChoices.tsx")).not.toMatch(/where\("email"/);
  });

  it("sign-in no longer saves an unverified phone number onto a profile", () => {
    expect(read("components/auth/SignInChoices.tsx")).not.toMatch(/phoneNumber"\s*:|"phoneNumber" :|add_phone/);
  });
});
