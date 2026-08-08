# Email setup — Google Workspace SMTP

Two emails are sent: the registration confirmation carrying the manage link, and
"your calling group is live" when a community group activates.

**Nothing breaks without this configured.** `sendEmail` logs what it would have
sent and returns `{ sent: false }`. Registrations, activations and group
creation all work regardless — mail is a side effect, never a dependency.

## What you need to do

### 1. Pick a mailbox

Use a real Workspace mailbox on `operatorcalling.com` — `no-reply@` or
`hello@`. It must be a licensed user, not an alias or group, because it has to
authenticate.

### 2. Turn on 2-Step Verification for that account

Required before Google will issue an app password. Google Account → Security →
2-Step Verification.

### 3. Create an App Password

Google Account → Security → App passwords. Name it something like
"operatorcalling.com website". You get a 16-character string — that is
`SMTP_PASS`. **Not** the account's own password, which will not work for SMTP.

### 4. Set the variables in Vercel

```
SMTP_HOST   smtp.gmail.com
SMTP_PORT   465
SMTP_USER   no-reply@operatorcalling.com
SMTP_PASS   <the 16-character app password>
EMAIL_FROM  The Operator <no-reply@operatorcalling.com>
APP_BASE_URL https://operatorcalling.com
```

`APP_BASE_URL` matters: activation emails are sent from a background path with
no incoming request, so the origin cannot be inferred and manage links would
otherwise be relative and useless.

### 5. Check SPF and DKIM

Workspace normally sets these up when you verify a domain. Worth confirming, as
mail from an unsigned domain goes to spam:

- SPF: a TXT record on `operatorcalling.com` including `include:_spf.google.com`
- DKIM: enabled in Admin console → Apps → Google Workspace → Gmail →
  Authenticate email, with the published TXT record

## Limits, and when this stops being enough

Workspace caps external recipients at roughly **2,000 per day**, and Google's
terms discourage bulk sending from Workspace at all. That is comfortably fine
for testing and early groups: activating a group of 20 sends 20 emails.

It stops being fine when a community activates with hundreds of registrants, or
when you start sending anything campaign-shaped. At that point move to a
transactional provider on a subdomain (`mail.operatorcalling.com`), which keeps
bulk sending away from the reputation of the domain your actual staff email
comes from.

**That move is one file.** Everything calls `sendEmail()` in
`lib/email/send.ts`; replacing the transport there changes nothing else.

## Deliberate behaviours

- **Sending never blocks anything.** The confirmation is fire-and-forget so the
  form does not wait on SMTP; activation catches its own failures so a bounced
  email cannot undo a created group.
- **Confirmations only go on a genuinely new registration.** Resubmitting the
  form does not generate another.
- **Activation claims each recipient before sending.** `notifiedGroupLiveAt` is
  written first, so a crash mid-run leaves someone un-emailed — recoverable —
  rather than emailed twice, which is not. A failed send clears the stamp so a
  later run retries just that person.
- **Every message carries the manage link.** Someone who cannot easily stop
  hearing from you marks you as spam instead, and that costs the sending domain
  far more than the unsubscribe does.
- **Anyone withdrawn, paused, or who left the group is skipped.**
- **Batches are paced at 250ms.** Workspace SMTP refuses bursts.
- **Plain text is always sent**, with HTML as a light wrapper. No images, no
  tracking pixels, no external assets.

## Testing it

Set the variables, deploy, then register on a tracked link with an address you
can read. You should get the confirmation within a few seconds.

If nothing arrives, the Vercel logs will say why — `[email] not configured`
means the variables are missing, and `[email] send failed` includes Google's
own error, which is usually either the app password being wrong or 2-Step
Verification not being on.
