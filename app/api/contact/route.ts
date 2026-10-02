import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { CONTACT_MESSAGES, validateContact } from "@/lib/contact";
import { sendContactEmail } from "@/lib/email/send";
import { CONTACT_LIMITS, checkRateLimit } from "@/lib/rate-limit";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { waitlistDb } from "@/lib/waitlist/server";
import { visitorHashFrom } from "@/lib/waitlist/source-code";

// POST /api/contact - public contact form.
//
// The message is saved first and emailed second. Emailing it needs
// CONTACT_EMAIL_SENDING_ENABLED=true (independent of EMAIL_SENDING_ENABLED, which
// governs every other automated email), and SMTP can fail, so the saved copy is
// what guarantees nothing a visitor wrote is lost. The inbox address is read
// here, on the server, and never sent to the browser.

export const runtime = "nodejs";

const INBOX = process.env.CONTACT_EMAIL_TO || "hello@operatorcalling.com";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a field no person sees. Answer as if it worked so a bot learns
  // nothing, and send nothing.
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ success: true });
  }

  const result = validateContact(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Please check the highlighted fields.", fields: result.errors },
      { status: 400 }
    );
  }
  const { name, email, message } = result.value;

  try {
    const db = waitlistDb();
    const limit = await checkRateLimit(db, COLLECTIONS.rateLimits, {
      scope: "contact_submit",
      identifier: visitorHashFrom(req.headers),
      ...CONTACT_LIMITS.submit,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many messages. Please try again in a little while." },
        { status: 429 }
      );
    }

    const ref = await db.collection(CONTACT_MESSAGES).add({
      name,
      email,
      message,
      emailStatus: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    const sent = await sendContactEmail({
      to: INBOX,
      replyTo: email,
      subject: `Operator contact form: ${name}`,
      text: `From: ${name} <${email}>\n\n${message}\n\n(Saved as contactMessages/${ref.id})`,
    });

    await ref.set(
      { emailStatus: sent.sent ? "sent" : (sent.error ?? "failed") },
      { merge: true }
    );

    // Saved is what counts: a message that could not be emailed is still held.
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[contact]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
