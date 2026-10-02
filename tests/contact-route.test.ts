import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The route always saves a valid message, and only the contact email result
// decides what emailStatus says.

const { add, set, sendContactEmail } = vi.hoisted(() => ({
  add: vi.fn(),
  set: vi.fn(),
  sendContactEmail: vi.fn(),
}));

vi.mock("@/lib/waitlist/server", () => ({
  waitlistDb: () => ({ collection: () => ({ add }) }),
}));
vi.mock("@/lib/rate-limit", () => ({
  CONTACT_LIMITS: { submit: { limit: 3, windowSeconds: 600 } },
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 2, resetAt: new Date() }),
}));
vi.mock("@/lib/email/send", () => ({ sendContactEmail }));

function post(body: unknown) {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  name: "Ada",
  email: "ada@example.com",
  message: "A real question for you.",
};

let POST: (req: NextRequest) => Promise<Response>;

// Imported once, up front: the first import of the route is slow under a full
// parallel test run and would otherwise eat the first test's timeout.
beforeAll(async () => {
  ({ POST } = await import("@/app/api/contact/route"));
}, 60_000);

beforeEach(() => {
  add.mockReset().mockResolvedValue({ id: "msg1", set });
  set.mockReset().mockResolvedValue(undefined);
  sendContactEmail.mockReset();
});

describe("POST /api/contact", () => {
  it("saves the message and records sent when the email goes out", async () => {
    sendContactEmail.mockResolvedValue({ sent: true });
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0]).toMatchObject({ ...valid, emailStatus: "pending" });
    expect(set).toHaveBeenCalledWith({ emailStatus: "sent" }, { merge: true });
  });

  it("still saves and succeeds when contact email sending is off", async () => {
    sendContactEmail.mockResolvedValue({ sent: false, error: "sending_disabled" });
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    expect(add).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      { emailStatus: "sending_disabled" },
      { merge: true }
    );
  });

  it("records a delivery failure but still succeeds", async () => {
    sendContactEmail.mockResolvedValue({ sent: false, error: "smtp down" });
    expect((await POST(post(valid))).status).toBe(200);
    expect(set).toHaveBeenCalledWith({ emailStatus: "smtp down" }, { merge: true });
  });

  it("saves and emails nothing for an invalid message", async () => {
    const res = await POST(post({ name: "", email: "x", message: "hi" }));
    expect(res.status).toBe(400);
    expect(add).not.toHaveBeenCalled();
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("saves and emails nothing when the honeypot is filled", async () => {
    const res = await POST(post({ ...valid, website: "spam" }));
    expect(res.status).toBe(200);
    expect(add).not.toHaveBeenCalled();
    expect(sendContactEmail).not.toHaveBeenCalled();
  });
});
