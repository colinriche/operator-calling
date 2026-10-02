# Email setup - Amazon SES (sending), Google Workspace (receiving)

Who does what:

- **Firebase** holds the email list (waitlist entries, contact messages).
- **Vercel** hosts the site and decides what to send.
- **Amazon SES** (SMTP) sends the transactional mail.
- **Google Workspace** receives replies and the contact inbox. Its MX records
  are untouched by anything here.

Mail the site can send: the registration confirmation carrying the manage link,
"your calling group is live", and the contact form's message to the inbox.

**Nothing breaks without this configured.** `sendEmail` logs what it would have
sent and returns `{ sent: false }`. Registrations, activations and group
creation all work regardless - mail is a side effect, never a dependency.

## Where the secrets live

Only in **Vercel, Production**. This repo has no secrets and the website has no
Firebase Functions - the Vercel environment is the secure store. `.env*` is
gitignored (only `.env.local.example`, which holds no values, is tracked).

Preview and Development deployments deliberately get **none** of these, the same
as the Firebase credentials (see [`firebase-environments.md`](./firebase-environments.md)):
a preview holding SMTP credentials could send real mail. Without them it just
logs and carries on.

## The variables

```
SMTP_HOST      email-smtp.<region>.amazonaws.com   # the region SES is set up in
SMTP_PORT      465                                  # 465 = implicit TLS; 587 = STARTTLS (required)
SMTP_USER      <SES SMTP username>                  # SECRET - Sensitive in Vercel
SMTP_PASS      <SES SMTP password>                  # SECRET - Sensitive in Vercel
EMAIL_FROM     The Operator <no-reply@operatorcalling.com>
EMAIL_REPLY_TO hello@operatorcalling.com            # optional; replies land in Workspace
APP_BASE_URL   https://operatorcalling.com

EMAIL_SENDING_ENABLED          false   # waitlist, tester, window, activation mail
CONTACT_EMAIL_SENDING_ENABLED  false   # contact form mail; independent of the line above
CONTACT_EMAIL_TO               hello@operatorcalling.com   # optional; this is the default
```

- **`SMTP_USER` / `SMTP_PASS`** are the SES **SMTP credentials** (created under
  SES -> SMTP settings -> Create SMTP credentials). They are not your AWS login and
  not the IAM access key shown at creation - the SMTP password is derived from it.
  They are valid for one AWS region only, so `SMTP_HOST` must be that region's
  endpoint.
- **TLS is always on.** 465 is implicit TLS. Any other port (587) must upgrade
  with STARTTLS and the connection is refused if it cannot, so credentials never
  travel in the clear. TLS 1.2 minimum.
- **`EMAIL_FROM` must be on a domain verified in SES.** The SMTP username is an
  access key id, never a valid sender, and the code will not use it as one.
- Nothing is sent until the switch for that kind of mail is `true`. Setting the
  SMTP variables alone changes nothing.

## Setting them (without the values touching a file or chat)

Dashboard: Vercel -> the `operator-calling` project -> Settings -> Environment
Variables -> Add. Choose **Production only**, tick **Sensitive** for
`SMTP_USER` and `SMTP_PASS`, paste the value, Save.

CLI (prompts for the value, so it is not in shell history or on screen):

```
vercel env add SMTP_USER production --sensitive
vercel env add SMTP_PASS production --sensitive
vercel env add SMTP_HOST production
vercel env add SMTP_PORT production
vercel env add EMAIL_FROM production
```

Run from the project folder, with `--project operator-calling` if it is not
linked. Redeploy afterwards: Vercel applies new variables only to new builds.

Keep the downloaded SES credentials file out of the repo folder. Delete it once
the values are in Vercel; SES cannot show the password again, but it can issue a
new one.

## SES: what must be true before mail leaves

- The sending domain (`operatorcalling.com`, or the subdomain used) is **verified**
  with Easy DKIM showing *Successful*.
- The account is out of the **SES sandbox**, or every recipient is individually
  verified. In the sandbox SES rejects mail to anyone else, which looks like a
  send failure in the logs.
- SPF and DMARC: SES publishes DKIM; for SPF and DMARC alignment set a custom
  MAIL FROM domain and keep the existing Workspace SPF record for Workspace mail.
  Do not remove or edit the existing MX or authentication records.

## Limits

SES enforces its own daily quota and send rate (shown in the SES console), far
above what Workspace allowed. Batches are still paced, which keeps a large
activation inside the per-second rate.

Everything calls `sendEmail()` (or `sendContactEmail()`) in `lib/email/send.ts`.
The provider is whatever the `SMTP_*` variables point at, so changing it again
is configuration, not code.

## Deliberate behaviours

- **Sending never blocks anything.** The confirmation is fire-and-forget so the
  form does not wait on SMTP; activation catches its own failures so a bounced
  email cannot undo a created group.
- **Confirmations only go on a genuinely new registration.** Resubmitting the
  form does not generate another.
- **Activation claims each recipient before sending.** `notifiedGroupLiveAt` is
  written first, so a crash mid-run leaves someone un-emailed - recoverable -
  rather than emailed twice, which is not. A failed send clears the stamp so a
  later run retries just that person.
- **Every message carries the manage link.** Someone who cannot easily stop
  hearing from you marks you as spam instead, and that costs the sending domain
  far more than the unsubscribe does.
- **Anyone withdrawn, paused, or who left the group is skipped.**
- **Batches are paced at 250ms.** SMTP providers throttle bursts.
- **Plain text is always sent**, with HTML as a light wrapper. No images, no
  tracking pixels, no external assets.

## Testing it

Set the variables, redeploy, then turn on the one switch you are testing. The
contact form is the safest first test: set `CONTACT_EMAIL_SENDING_ENABLED=true`
and send a message from `/faq#contact`. The saved record in `contactMessages`
carries an `emailStatus`, and the Vercel logs show the rest.

- `sending_disabled` - that switch is not `true` in the deployment you hit.
- `not_configured` - `SMTP_USER` or `SMTP_PASS` is missing there.
- `Invalid login` / `535` - wrong SMTP credentials, or credentials from a
  different AWS region than `SMTP_HOST`.
- `554 Message rejected: Email address is not verified` - the sender domain is
  not verified yet, or the account is in the sandbox and the recipient is not
  verified.
