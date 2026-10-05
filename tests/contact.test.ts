import { describe, expect, it } from "vitest";
import { validateContact } from "@/lib/contact";

describe("validateContact", () => {
  const good = { name: "Ada", email: "ada@example.com", message: "Hello there, a question." };

  it("accepts a complete message", () => {
    const r = validateContact(good);
    expect(r.ok).toBe(true);
  });

  it("reports every missing field", () => {
    const r = validateContact({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "message", "name"]);
  });

  it("rejects a bad email and a too-short message", () => {
    const r = validateContact({ ...good, email: "nope", message: "hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "message"]);
  });

  it("flattens the name to one line so it cannot inject headers", () => {
    const r = validateContact({ ...good, name: "Ada\r\nBcc: x@evil.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).not.toMatch(/[\r\n]/);
  });

  it("caps the message length", () => {
    const r = validateContact({ ...good, message: "x".repeat(9000) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.message.length).toBe(5000);
  });

  it("ignores non-string input", () => {
    const r = validateContact({ name: 5, email: {}, message: [] });
    expect(r.ok).toBe(false);
  });
});
