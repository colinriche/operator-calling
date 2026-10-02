import { describe, expect, it } from "vitest";
import {
  appleErrorMessage,
  appleIdentity,
  appleProfileFields,
  describeAppleEmail,
  emailForAccountMatching,
  isPrivateRelayEmail,
} from "@/lib/apple-signin";

describe("isPrivateRelayEmail", () => {
  it("recognises Apple's Hide My Email addresses, however they are cased", () => {
    expect(isPrivateRelayEmail("abc123xyz@privaterelay.appleid.com")).toBe(true);
    expect(isPrivateRelayEmail("ABC@PrivateRelay.AppleID.com")).toBe(true);
    expect(isPrivateRelayEmail("  abc@privaterelay.appleid.com ")).toBe(true);
  });

  it("is not fooled by lookalikes or ordinary addresses", () => {
    expect(isPrivateRelayEmail("me@icloud.com")).toBe(false);
    expect(isPrivateRelayEmail("me@gmail.com")).toBe(false);
    expect(isPrivateRelayEmail("me@privaterelay.appleid.com.evil.example")).toBe(false);
    expect(isPrivateRelayEmail("privaterelay.appleid.com@example.com")).toBe(false);
    expect(isPrivateRelayEmail("not an email")).toBe(false);
    expect(isPrivateRelayEmail("")).toBe(false);
    expect(isPrivateRelayEmail(null)).toBe(false);
    expect(isPrivateRelayEmail(undefined)).toBe(false);
  });
});

describe("appleIdentity", () => {
  it("a shared real email is not a relay", () => {
    const id = appleIdentity({ email: "una@example.com", displayName: "Una Day" });
    expect(id).toEqual({ email: "una@example.com", isPrivateRelay: false, name: "Una Day" });
  });

  it("Hide My Email is detected from the address", () => {
    const id = appleIdentity({ email: "x1y2@privaterelay.appleid.com", displayName: null });
    expect(id.isPrivateRelay).toBe(true);
    expect(id.name).toBe("");
  });

  it("and from Apple's own claim, as a string or a boolean", () => {
    expect(appleIdentity({ email: "a@b.com" }, { is_private_email: "true" }).isPrivateRelay).toBe(true);
    expect(appleIdentity({ email: "a@b.com" }, { is_private_email: true }).isPrivateRelay).toBe(true);
    expect(appleIdentity({ email: "a@b.com" }, { is_private_email: "false" }).isPrivateRelay).toBe(false);
  });

  it("survives a sign-in with no email and no name (every sign-in after the first can look like this)", () => {
    expect(appleIdentity({})).toEqual({ email: null, isPrivateRelay: false, name: "" });
    expect(appleIdentity({ email: "   ", displayName: "  " })).toEqual({ email: null, isPrivateRelay: false, name: "" });
  });
});

describe("emailForAccountMatching", () => {
  it("never offers a relay address: it cannot match an account made with the person's own email", () => {
    expect(emailForAccountMatching(appleIdentity({ email: "x@privaterelay.appleid.com" }))).toBeNull();
    expect(emailForAccountMatching(appleIdentity({ email: "a@b.com" }, { is_private_email: "true" }))).toBeNull();
  });

  it("offers a shared real address, and nothing when there is none", () => {
    expect(emailForAccountMatching(appleIdentity({ email: "una@example.com" }))).toBe("una@example.com");
    expect(emailForAccountMatching(appleIdentity({}))).toBeNull();
  });
});

describe("appleProfileFields", () => {
  it("flags a relay address so mail code can tell, and records the provider", () => {
    const f = appleProfileFields(appleIdentity({ email: "x@privaterelay.appleid.com", displayName: "Una" }));
    expect(f).toMatchObject({
      authProvider: "apple.com",
      email: "x@privaterelay.appleid.com",
      emailIsPrivateRelay: true,
      displayName: "Una",
      name: "Una",
    });
  });

  it("does not flag a real address, and writes no empty name or email", () => {
    const real = appleProfileFields(appleIdentity({ email: "una@example.com", displayName: "Una" }));
    expect("emailIsPrivateRelay" in real).toBe(false);
    const bare = appleProfileFields(appleIdentity({}));
    expect(bare).toEqual({ authProvider: "apple.com" });
  });
});

describe("describeAppleEmail", () => {
  it("says plainly when it is Apple's relay", () => {
    expect(describeAppleEmail(appleIdentity({ email: "x@privaterelay.appleid.com" }))).toBe(
      "x@privaterelay.appleid.com (Apple private relay)"
    );
    expect(describeAppleEmail(appleIdentity({ email: "una@example.com" }))).toBe("una@example.com");
    expect(describeAppleEmail(appleIdentity({}))).toBe("No email address shared");
  });
});

describe("appleErrorMessage", () => {
  it("explains an account that already exists with another sign-in method", () => {
    const m = appleErrorMessage("auth/account-exists-with-different-credential", "una@example.com");
    expect(m).toMatch(/una@example.com/);
    expect(m).toMatch(/Google/);
    expect(appleErrorMessage("auth/account-exists-with-different-credential")).toMatch(/different sign-in method/);
  });

  it("says Apple isn't switched on rather than 'contact support'", () => {
    expect(appleErrorMessage("auth/operation-not-allowed")).toMatch(/isn't switched on/);
  });

  it("covers a blocked pop-up, and defers everything else to the generic handler", () => {
    expect(appleErrorMessage("auth/popup-blocked")).toMatch(/pop-ups/);
    expect(appleErrorMessage("auth/network-request-failed")).toBeNull();
  });
});
