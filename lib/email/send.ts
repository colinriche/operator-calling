import nodemailer, { type Transporter } from "nodemailer";

// ─── Sending ─────────────────────────────────────────────────────────────────
//
// One function, one transport. Everything else in the app calls sendEmail and
// knows nothing about how mail leaves the building - so moving from Google
// Workspace SMTP to a transactional provider later means replacing this file
// and nothing else.
//
// The transport is plain SMTP, configured entirely from the environment, so the
// provider is a matter of which values are set - see docs/email-setup.md. The
// intended setup is Amazon SES SMTP for outgoing mail, with Google Workspace
// receiving replies; Workspace SMTP (an app password) still works for testing
// but is not a bulk sender.
//
// No credential is ever in this repo. SMTP_USER and SMTP_PASS come from the
// deployment's environment (Vercel, Production only) and are never logged.

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text is required - never send HTML-only mail. */
  text: string;
  html?: string;
  /** Where a reply should go, when that is not the sender. */
  replyTo?: string;
}

export interface SendResult {
  sent: boolean;
  /** Present when sending failed; safe to log, never shown to a visitor. */
  error?: string;
}

let cached: Transporter | null = null;

/** The slice of process.env this file reads, so tests can pass a plain object. */
type EnvLike = Record<string, string | undefined>;

const DEFAULT_FROM = "The Operator <no-reply@operatorcalling.com>";

/**
 * The From header. EMAIL_FROM wins. SMTP_USER is only used when it is itself an
 * email address (Google Workspace logs in with one); an SES SMTP username is an
 * access key id, which is not a valid sender and must never end up in From.
 */
export function fromAddress(env: EnvLike = process.env): string {
  if (env.EMAIL_FROM) return env.EMAIL_FROM;
  if (env.SMTP_USER && env.SMTP_USER.includes("@")) return env.SMTP_USER;
  return DEFAULT_FROM;
}

/**
 * Where replies to automated mail go, if EMAIL_REPLY_TO is set - for example a
 * Google Workspace mailbox, since the sending address is a no-reply. A message
 * that sets its own replyTo (the contact form does) keeps it.
 */
export function replyToFor(
  message: { replyTo?: string },
  env: EnvLike = process.env
): string | undefined {
  return message.replyTo || env.EMAIL_REPLY_TO || undefined;
}

// ─── Collection-only mode ────────────────────────────────────────────────────
//
// Addresses are collected and stored as normal; nothing is delivered. This is
// the current state deliberately - the waitlist is gathering people before
// there is anything worth mailing them about, and the first mail this domain
// ever sends should be one somebody wrote on purpose, not an automated
// confirmation that went out while the product was still being built.
//
// Sending needs EMAIL_SENDING_ENABLED=true *and* SMTP credentials. Two
// conditions rather than one so that configuring SMTP - for a test, or because
// the vars were copied between environments - can never by itself start mail
// flowing to real people.

/** Master switch. Off unless explicitly enabled. */
export function isEmailSendingEnabled(): boolean {
  return process.env.EMAIL_SENDING_ENABLED === "true";
}

/** True when enough is configured, and permitted, to attempt a send. */
export function isEmailConfigured(): boolean {
  return isEmailSendingEnabled() && !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Contact form switch. Separate from EMAIL_SENDING_ENABLED on purpose: turning
 * the contact form's email on must not start the waitlist, tester or window
 * mail, and the global switch staying off must not silence the contact form.
 * The SMTP credentials are shared; only the permission to send is separate.
 */
export function isContactEmailSendingEnabled(): boolean {
  return process.env.CONTACT_EMAIL_SENDING_ENABLED === "true";
}

function hasSmtpCredentials(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Callers check their own switch first, so this only decides whether there is
// anything to send with.
function transporter(): Transporter | null {
  if (cached) return cached;
  if (!hasSmtpCredentials()) return null;

  cached = nodemailer.createTransport(smtpConfig());
  return cached;
}

/**
 * SMTP connection settings from the environment.
 *
 * TLS is always on. Ports 465 and 2465 are implicit TLS (SES and Gmail both
 * offer 465); any other port, such as 587, must upgrade with STARTTLS and the
 * connection is refused if the server will not - so credentials are never sent
 * in the clear. TLS 1.2 is the floor.
 *
 * SMTP_HOST has no safe default for SES (the endpoint is per region, for
 * example email-smtp.eu-west-2.amazonaws.com) and must be set there. It still
 * falls back to Gmail so an existing Workspace setup keeps working unchanged.
 */
export function smtpConfig(env: EnvLike = process.env) {
  const port = Number(env.SMTP_PORT ?? 465);
  const implicitTls = port === 465 || port === 2465;
  return {
    host: env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    tls: { minVersion: "TLSv1.2" as const },
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  };
}

/**
 * Send one message.
 *
 * Never throws. Email is a side effect of things that must succeed regardless -
 * a registration is still a registration if the confirmation bounces - so
 * failures are reported in the return value and logged, not raised.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  return deliver(message, isEmailSendingEnabled(), "EMAIL_SENDING_ENABLED");
}

/**
 * Send a contact form message. Gated by CONTACT_EMAIL_SENDING_ENABLED alone, so
 * it works whether or not the global switch is on. Same transport, same
 * never-throws contract as sendEmail.
 */
export async function sendContactEmail(message: EmailMessage): Promise<SendResult> {
  return deliver(message, isContactEmailSendingEnabled(), "CONTACT_EMAIL_SENDING_ENABLED");
}

async function deliver(
  message: EmailMessage,
  enabled: boolean,
  switchName: string
): Promise<SendResult> {
  if (!enabled) {
    // Expected state, not a fault - logged at info so it does not read as one.
    console.log(
      `[email] ${switchName} is off - would have sent "${message.subject}" to ${message.to}`
    );
    return { sent: false, error: "sending_disabled" };
  }

  const transport = transporter();
  if (!transport) {
    console.warn(
      `[email] enabled but SMTP not configured - would have sent "${message.subject}" to ${message.to}`
    );
    return { sent: false, error: "not_configured" };
  }

  try {
    await transport.sendMail({
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(replyToFor(message) ? { replyTo: replyToFor(message) } : {}),
      ...(message.html ? { html: message.html } : {}),
    });
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown";
    console.error(`[email] send failed to ${message.to}:`, error);
    return { sent: false, error };
  }
}

/**
 * Send to many recipients, one message each.
 *
 * Sequential and rate-limited rather than parallel: Workspace SMTP will refuse
 * a burst, and a group activation could be dozens of people at once. Slower is
 * the correct trade when the alternative is being throttled mid-run.
 */
export async function sendEmailBatch(
  messages: EmailMessage[],
  { delayMs = 250 }: { delayMs?: number } = {}
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const message of messages) {
    const result = await sendEmail(message);
    if (result.sent) sent++;
    else failed++;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return { sent, failed };
}

/**
 * Public base URL for links in emails.
 *
 * Emails are often sent from a background path with no request to derive an
 * origin from, so this has to be configured rather than inferred.
 */
export function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://operatorcalling.com")
  );
}
