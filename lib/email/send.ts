import nodemailer, { type Transporter } from "nodemailer";

// ─── Sending ─────────────────────────────────────────────────────────────────
//
// One function, one transport. Everything else in the app calls sendEmail and
// knows nothing about how mail leaves the building — so moving from Google
// Workspace SMTP to a transactional provider later means replacing this file
// and nothing else.
//
// Currently Workspace SMTP via an app password. That is fine for testing and
// early groups but is not a bulk sender: Workspace caps external recipients
// around 2,000/day and Google's terms discourage bulk use. Watch the cap before
// a large community activates.

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text is required — never send HTML-only mail. */
  text: string;
  html?: string;
}

export interface SendResult {
  sent: boolean;
  /** Present when sending failed; safe to log, never shown to a visitor. */
  error?: string;
}

let cached: Transporter | null = null;

function fromAddress(): string {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    "The Operator <no-reply@operatorcalling.com>"
  );
}

/** True when enough is configured to attempt a send. */
export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter(): Transporter | null {
  if (cached) return cached;
  if (!isEmailConfigured()) return null;

  const port = Number(process.env.SMTP_PORT ?? 465);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cached;
}

/**
 * Send one message.
 *
 * Never throws. Email is a side effect of things that must succeed regardless —
 * a registration is still a registration if the confirmation bounces — so
 * failures are reported in the return value and logged, not raised.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const transport = transporter();
  if (!transport) {
    console.warn(
      `[email] not configured — would have sent "${message.subject}" to ${message.to}`
    );
    return { sent: false, error: "not_configured" };
  }

  try {
    await transport.sendMail({
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
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
