import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The contact form's email switch is independent of the global one. These pin
// that down: each switch controls only its own mail.

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({
  default: { createTransport },
  createTransport,
}));

const ENV_KEYS = [
  "EMAIL_SENDING_ENABLED",
  "CONTACT_EMAIL_SENDING_ENABLED",
  "SMTP_USER",
  "SMTP_PASS",
] as const;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

const message = {
  to: "inbox@example.com",
  subject: "Hi",
  text: "Body",
  replyTo: "a@b.co",
};

beforeEach(() => {
  vi.resetModules();
  sendMail.mockReset().mockResolvedValue({});
  createTransport.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setEnv({});
  vi.restoreAllMocks();
});

describe("sendContactEmail", () => {
  it("does not send when CONTACT_EMAIL_SENDING_ENABLED is unset", async () => {
    setEnv({ SMTP_USER: "u", SMTP_PASS: "p" });
    const { sendContactEmail } = await import("@/lib/email/send");
    expect(await sendContactEmail(message)).toEqual({
      sent: false,
      error: "sending_disabled",
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not send when it is false, even if the global switch is on", async () => {
    setEnv({
      EMAIL_SENDING_ENABLED: "true",
      CONTACT_EMAIL_SENDING_ENABLED: "false",
      SMTP_USER: "u",
      SMTP_PASS: "p",
    });
    const { sendContactEmail } = await import("@/lib/email/send");
    expect((await sendContactEmail(message)).error).toBe("sending_disabled");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends when enabled with the global switch off, using the shared SMTP config", async () => {
    setEnv({
      EMAIL_SENDING_ENABLED: "false",
      CONTACT_EMAIL_SENDING_ENABLED: "true",
      SMTP_USER: "u",
      SMTP_PASS: "p",
    });
    const { sendContactEmail } = await import("@/lib/email/send");
    expect(await sendContactEmail(message)).toEqual({ sent: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: "inbox@example.com",
      replyTo: "a@b.co",
    });
  });

  it("reports not_configured when enabled without SMTP credentials", async () => {
    setEnv({ CONTACT_EMAIL_SENDING_ENABLED: "true" });
    const { sendContactEmail } = await import("@/lib/email/send");
    expect(await sendContactEmail(message)).toEqual({
      sent: false,
      error: "not_configured",
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("reports a transport failure without throwing", async () => {
    setEnv({
      CONTACT_EMAIL_SENDING_ENABLED: "true",
      SMTP_USER: "u",
      SMTP_PASS: "p",
    });
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendContactEmail } = await import("@/lib/email/send");
    expect(await sendContactEmail(message)).toEqual({
      sent: false,
      error: "smtp down",
    });
  });
});

describe("sendEmail (global switch) is unchanged", () => {
  it("does not send when only the contact switch is on", async () => {
    setEnv({
      CONTACT_EMAIL_SENDING_ENABLED: "true",
      SMTP_USER: "u",
      SMTP_PASS: "p",
    });
    const { sendEmail } = await import("@/lib/email/send");
    expect((await sendEmail(message)).error).toBe("sending_disabled");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends when the global switch is on and the contact switch is off", async () => {
    setEnv({ EMAIL_SENDING_ENABLED: "true", SMTP_USER: "u", SMTP_PASS: "p" });
    const { sendEmail } = await import("@/lib/email/send");
    expect(await sendEmail(message)).toEqual({ sent: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("still reports not_configured when enabled without credentials", async () => {
    setEnv({ EMAIL_SENDING_ENABLED: "true" });
    const { sendEmail } = await import("@/lib/email/send");
    expect((await sendEmail(message)).error).toBe("not_configured");
  });
});
