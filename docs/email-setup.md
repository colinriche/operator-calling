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

## Apple Private Email Relay (Sign in with Apple, "Hide My Email")

People who choose **Hide My Email** when signing in with Apple give us an address like
`abc123@privaterelay.appleid.com`. It is a real address that forwards to them, but **Apple only forwards mail
that comes from a sender you have registered with Apple**. Mail from anywhere else is dropped, with no bounce,
so it looks like we sent it and nothing arrived. Those accounts are marked `emailIsPrivateRelay: true` on their
`user` document.

The sender to register is the one in `EMAIL_FROM` (`no-reply@operatorcalling.com`), on the domain
`operatorcalling.com`.

### 1. Register the domain

Apple Developer portal (developer.apple.com) -> **Certificates, Identifiers & Profiles** -> **More** ->
**Configure Sign in with Apple for Email Communication** -> **Email Sources** -> **+**.

1. Choose **Domains** and enter `operatorcalling.com`.
2. The row shows **Verify SPF**. Apple shows the SPF text it needs. **Copy it from the portal**; do not type it
   from memory or from here.

### 2. Add Apple's SPF entry to DNS

DNS is managed wherever `operatorcalling.com`'s nameservers point (Google Workspace's domain host, Cloudflare,
Namecheap, Route 53 ...). Look there for the TXT record that **starts `v=spf1`** on the root domain
(`operatorcalling.com` / `@`).

- A domain may have **only one** SPF record. If one exists, **edit it and add Apple's `include:` before the
  final `~all`** (or `-all`). Do not add a second `v=spf1` record: two records make SPF fail for **all** mail,
  including Workspace's.
- Keep what is already there. Example only (your existing record and Apple's value will differ):

  ```
  before:  v=spf1 include:_spf.google.com ~all
  after:   v=spf1 include:_spf.google.com include:<value Apple shows> ~all
  ```
- SPF allows at most **10 DNS lookups** in total across all the `include:`s. Google plus Apple is fine; if you
  have added many other services, check the record still passes (a free SPF checker shows the count).
- Leave MX and every other record alone.

Save, wait a few minutes (up to an hour for some providers), return to the portal and click **Verify SPF**.

### 3. Register the From address

In the same **Email Sources** screen: **+** -> **Email Addresses** -> enter `no-reply@operatorcalling.com`
(exactly what `EMAIL_FROM` sends as) -> Register. If you ever change `EMAIL_FROM`, register the new address too.

### 4. Make sure the mail also authenticates through SES

Apple checks that the message really comes from the registered domain. We send through SES, so:

- In SES, `operatorcalling.com` must be a **verified identity** with **Easy DKIM = Successful** (see the section
  above). DKIM on the domain is what proves our mail is ours.
- If you set a **custom MAIL FROM domain** in SES (recommended), SES also publishes SPF for that subdomain. That
  is separate from the root-domain SPF record you edited for Apple.

### 5. Test it

1. On the live site, sign in with Apple using a spare Apple ID and choose **Hide My Email**.
2. Make the site email that account (a waitlist registration or contact confirmation with
   `EMAIL_SENDING_ENABLED=true`, or send to the relay address from the SES console).
3. It should arrive in the Apple ID's own inbox. If it does not arrive and SES shows it as **delivered** to
   `privaterelay.appleid.com`, Apple dropped it: recheck steps 1-4 (most often the SPF value, or the From address
   not registered).

Until this is done Sign in with Apple still works; only mail to hidden addresses is lost. See also
[`apple-signin.md`](./apple-signin.md).

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
