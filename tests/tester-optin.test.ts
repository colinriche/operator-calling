import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ─── The tester opt-in bypass ────────────────────────────────────────────────
//
// Regression guard for a real defect: the public, unauthenticated registration
// endpoint accepted `joinTesterProgramme: true` and wrote
// `testerStatus: "active"` with a consent timestamp — no login, no uid, no
// consent actually given. A scripted POST could mint "active testers" who would
// then be emailed about test windows.
//
// These assert the structural property that makes the bypass impossible:
// nothing on the unauthenticated path can express tester intent at all. That is
// a stronger guarantee than checking one handler's behaviour, and it survives
// refactoring.

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const REGISTER_ROUTE = "app/api/waitlist/register/route.ts";
const SERVER = "lib/waitlist/server.ts";
const TYPES = "lib/waitlist/types.ts";
const TESTER_ROUTE = "app/api/waitlist/tester/route.ts";

describe("unauthenticated registration cannot create a tester", () => {
  it("RegistrationInput has no field for joining the tester programme", () => {
    const types = read(TYPES);
    const input = types.slice(
      types.indexOf("export interface RegistrationInput"),
      types.indexOf("export interface RegistrationResult")
    );
    expect(input).not.toMatch(/joinTesterProgramme/);
  });

  it("the public register route never reads joinTesterProgramme from the body", () => {
    expect(read(REGISTER_ROUTE)).not.toMatch(/joinTesterProgramme/);
  });

  it("registerWaitlistEntry never activates a tester", () => {
    const server = read(SERVER);
    expect(server).not.toMatch(/joinTesterProgramme/);
    // The only testerStatus it may write on a new entry is "none".
    expect(server).toMatch(/testerStatus:\s*"none"/);
    expect(server).not.toMatch(/testerStatus:\s*"active"/);
  });

  it("registerWaitlistEntry never records tester consent", () => {
    const server = read(SERVER);
    // Consent must only ever be stamped by the authenticated flow.
    expect(server).not.toMatch(/testerConsentAt:\s*FieldValue/);
  });
});

describe("the authenticated tester route is the only way in", () => {
  const route = read(TESTER_ROUTE);

  it("requires an Authorization bearer token", () => {
    expect(route).toMatch(/authorization/i);
    expect(route).toMatch(/Sign in to join early access/);
  });

  it("verifies the token rather than trusting a claimed identity", () => {
    expect(route).toMatch(/verifyIdTokenAnyProject/);
  });

  it("records the verified uid alongside the active status", () => {
    expect(route).toMatch(/testerStatus:\s*"active"/);
    expect(route).toMatch(/testerUid:\s*identity\.uid/);
  });

  it("requires explicit consent and stamps the wording version", () => {
    expect(route).toMatch(/body\.consent\s*!==\s*true/);
    expect(route).toMatch(/testerConsentVersion:\s*TESTER_CONSENT_VERSION/);
  });

  it("does not disturb community attribution when someone joins", () => {
    // demandSourceId is the community record; opting in is additive.
    const updateBlock = route.slice(
      route.indexOf("const update: Record<string, unknown> = {"),
      route.indexOf("const wasCounted")
    );
    expect(updateBlock).not.toMatch(/demandSourceId:/);
    expect(updateBlock).not.toMatch(/communityInterest:/);
  });
});
