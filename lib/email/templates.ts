import { appBaseUrl, type EmailMessage } from "./send";

// ─── Templates ───────────────────────────────────────────────────────────────
//
// Plain text is the source of truth and always sent; HTML is a light wrapper
// over the same words. Deliberately sparse — this is mail somebody asked for
// about a calling group, not a campaign, and it should read like a person
// wrote it.
//
// Every message carries the manage link. Someone who cannot easily stop hearing
// from you will mark you as spam instead, which costs the sending domain far
// more than the unsubscribe does.

function manageUrl(token: string): string {
  return `${appBaseUrl()}/waitlist/manage?t=${encodeURIComponent(token)}`;
}

function wrap(bodyHtml: string, manageLink: string): string {
  return `<!-- plain wrapper: no images, no tracking, no external assets -->
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2b2b2b;max-width:520px">
${bodyHtml}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 14px">
<p style="font-size:12px;color:#767676;margin:0">
  Manage or stop these emails: <a href="${manageLink}" style="color:#8a6d1f">${manageLink}</a><br>
  The Operator is an independent service.
</p>
</div>`;
}

// ─── Confirmation, with the manage link ──────────────────────────────────────

export function registrationConfirmation(opts: {
  to: string;
  audienceLabel: string;
  manageToken: string;
  isTester: boolean;
}): EmailMessage {
  const link = manageUrl(opts.manageToken);

  const text = `You're on the list.

We'll keep your interest linked to ${opts.audienceLabel}. If enough people are interested and a calling group is created, we'll let you know.
${opts.isTester ? "\nYou've also joined early access as a tester.\n" : ""}
Save this link — it lets you pause, leave or change your time zone at any time, without an account:
${link}

Keep it private: anyone with it can change your settings.

The Operator is an independent service.`;

  const html = wrap(
    `<p><strong>You're on the list.</strong></p>
<p>We'll keep your interest linked to ${opts.audienceLabel}. If enough people are interested and a calling group is created, we'll let you know.</p>
${opts.isTester ? "<p>You've also joined early access as a tester.</p>" : ""}
<p>Save the link below — it lets you pause, leave or change your time zone at any time, without an account. Keep it private: anyone with it can change your settings.</p>`,
    link
  );

  return {
    to: opts.to,
    subject: "You're on the list — The Operator",
    text,
    html,
  };
}

// ─── Group is live ───────────────────────────────────────────────────────────

export function groupActivated(opts: {
  to: string;
  audienceLabel: string;
  manageToken: string;
  /** Rendered in the recipient's own time zone by the caller. */
  firstCallLocal: string;
  timezone: string;
  /** True when they have no account yet and must create one to join. */
  needsAccount: boolean;
}): EmailMessage {
  const link = manageUrl(opts.manageToken);
  const signUp = `${appBaseUrl()}/signup`;

  const joining = opts.needsAccount
    ? `To join the calls you'll need an account. Create one with this email address and you'll be added to the group automatically:
${signUp}`
    : `You're in the group already — nothing to do.`;

  const text = `The calling group for ${opts.audienceLabel} is now running.

Enough people registered, so it's open. Calls are weekly.

First call: ${opts.firstCallLocal} (${opts.timezone})

${joining}

Change your time zone, pause or leave at any time:
${link}

The Operator is an independent service.`;

  const html = wrap(
    `<p><strong>The calling group for ${opts.audienceLabel} is now running.</strong></p>
<p>Enough people registered, so it's open. Calls are weekly.</p>
<p style="background:#faf6ec;border:1px solid #e8dcbb;border-radius:8px;padding:12px 14px;margin:18px 0">
  <strong>First call:</strong> ${opts.firstCallLocal}<br>
  <span style="font-size:13px;color:#767676">Shown in ${opts.timezone}</span>
</p>
${
  opts.needsAccount
    ? `<p>To join the calls you'll need an account. Create one with this email address and you'll be added to the group automatically:<br>
<a href="${signUp}" style="color:#8a6d1f">${signUp}</a></p>`
    : `<p>You're in the group already — nothing to do.</p>`
}`,
    link
  );

  return {
    to: opts.to,
    subject: `Your calling group for ${opts.audienceLabel} is live`,
    text,
    html,
  };
}

// ─── Early access calls scheduled ────────────────────────────────────────────

export function testerCallsScheduled(opts: {
  to: string;
  manageToken: string;
  /** Already rendered in the recipient's own time zone. */
  firstCallLocal: string;
  timezone: string;
  recurrence: string;
}): EmailMessage {
  const link = manageUrl(opts.manageToken);

  const text = `Early access calls now have a time.

${opts.recurrence}
Next one: ${opts.firstCallLocal} (${opts.timezone})

Make yourself available around then and The Operator will connect you with someone. You don't need to find anyone or arrange anything.

Change your time zone, pause or leave at any time:
${link}

The Operator is an independent service.`;

  const html = wrap(
    `<p><strong>Early access calls now have a time.</strong></p>
<p style="background:#faf6ec;border:1px solid #e8dcbb;border-radius:8px;padding:12px 14px;margin:18px 0">
  <strong>Next call:</strong> ${opts.firstCallLocal}<br>
  <span style="font-size:13px;color:#767676">${opts.recurrence} · shown in ${opts.timezone}</span>
</p>
<p>Make yourself available around then and The Operator will connect you with someone. You don't need to find anyone or arrange anything.</p>`,
    link
  );

  return {
    to: opts.to,
    subject: "Your early access calls have a time",
    text,
    html,
  };
}
