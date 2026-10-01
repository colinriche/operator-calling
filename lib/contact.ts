// ─── Contact form ────────────────────────────────────────────────────────────
//
// Pure validation, shared by the API route and its tests. The destination
// address is deliberately not here: it lives only in the server route, so it
// never ships in any page's HTML or JavaScript.

export const CONTACT_MESSAGES = "contactMessages";

export const CONTACT_LIMITS_TEXT = {
  nameMax: 100,
  emailMax: 320,
  messageMin: 10,
  messageMax: 5000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Control characters other than tab and newline. */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface ContactInput {
  name: string;
  email: string;
  message: string;
}

export type ContactErrors = Partial<Record<keyof ContactInput, string>>;

function clean(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(CONTROL_RE, "").trim().slice(0, max)
    : "";
}

/** Validates a raw request body. Returns cleaned values or per-field errors. */
export function validateContact(
  body: Record<string, unknown>
): { ok: true; value: ContactInput } | { ok: false; errors: ContactErrors } {
  // A name goes into a subject line, so it is flattened to one line.
  const name = clean(body.name, CONTACT_LIMITS_TEXT.nameMax).replace(/\s+/g, " ");
  const email = clean(body.email, CONTACT_LIMITS_TEXT.emailMax);
  const message = clean(body.message, CONTACT_LIMITS_TEXT.messageMax);

  const errors: ContactErrors = {};
  if (!name) errors.name = "Enter your name.";
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  if (message.length < CONTACT_LIMITS_TEXT.messageMin) {
    errors.message = `Write a message of at least ${CONTACT_LIMITS_TEXT.messageMin} characters.`;
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, value: { name, email, message } };
}
