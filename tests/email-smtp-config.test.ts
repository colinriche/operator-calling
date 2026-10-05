import { describe, expect, it } from "vitest";
import { fromAddress, replyToFor, smtpConfig } from "@/lib/email/send";

// The SMTP settings come only from the environment, so a provider switch (Google
// Workspace to Amazon SES) is configuration. These pin the parts that matter for
// SES: TLS is never optional, and an SES access key id can never become the
// From address.

describe("smtpConfig", () => {
  it("uses implicit TLS on 465", () => {
    const c = smtpConfig({ SMTP_HOST: "email-smtp.eu-west-2.amazonaws.com", SMTP_PORT: "465" });
    expect(c.secure).toBe(true);
    expect(c.requireTLS).toBe(false);
    expect(c.host).toBe("email-smtp.eu-west-2.amazonaws.com");
    expect(c.port).toBe(465);
  });

  it("requires STARTTLS on 587 rather than ever falling back to plaintext", () => {
    const c = smtpConfig({ SMTP_HOST: "email-smtp.eu-west-2.amazonaws.com", SMTP_PORT: "587" });
    expect(c.secure).toBe(false);
    expect(c.requireTLS).toBe(true);
  });

  it("treats 2465 as implicit TLS and 2587 as STARTTLS", () => {
    expect(smtpConfig({ SMTP_PORT: "2465" }).secure).toBe(true);
    expect(smtpConfig({ SMTP_PORT: "2587" }).requireTLS).toBe(true);
  });

  it("sets a TLS 1.2 floor", () => {
    expect(smtpConfig({}).tls.minVersion).toBe("TLSv1.2");
  });

  it("passes the username and password through and nowhere else", () => {
    const c = smtpConfig({ SMTP_USER: "user-id", SMTP_PASS: "secret-value" });
    expect(c.auth).toEqual({ user: "user-id", pass: "secret-value" });
  });

  it("keeps the previous defaults when only credentials are set", () => {
    const c = smtpConfig({ SMTP_USER: "u@operatorcalling.com", SMTP_PASS: "p" });
    expect(c.host).toBe("smtp.gmail.com");
    expect(c.port).toBe(465);
    expect(c.secure).toBe(true);
  });
});

describe("fromAddress", () => {
  it("prefers EMAIL_FROM", () => {
    expect(
      fromAddress({ EMAIL_FROM: "The Operator <no-reply@operatorcalling.com>", SMTP_USER: "AKIAEXAMPLE" })
    ).toBe("The Operator <no-reply@operatorcalling.com>");
  });

  it("never uses an SES access key id as the sender", () => {
    expect(fromAddress({ SMTP_USER: "AKIAEXAMPLEKEYID" })).toBe(
      "The Operator <no-reply@operatorcalling.com>"
    );
  });

  it("still uses an email-address SMTP_USER, as Workspace setups do", () => {
    expect(fromAddress({ SMTP_USER: "no-reply@operatorcalling.com" })).toBe(
      "no-reply@operatorcalling.com"
    );
  });

  it("falls back to the no-reply sender", () => {
    expect(fromAddress({})).toBe("The Operator <no-reply@operatorcalling.com>");
  });
});

describe("replyToFor", () => {
  it("keeps a message's own reply-to over the default", () => {
    expect(replyToFor({ replyTo: "a@b.co" }, { EMAIL_REPLY_TO: "hello@operatorcalling.com" })).toBe(
      "a@b.co"
    );
  });

  it("applies EMAIL_REPLY_TO when the message has none", () => {
    expect(replyToFor({}, { EMAIL_REPLY_TO: "hello@operatorcalling.com" })).toBe(
      "hello@operatorcalling.com"
    );
  });

  it("adds nothing when neither is set, as before", () => {
    expect(replyToFor({}, {})).toBeUndefined();
  });
});
