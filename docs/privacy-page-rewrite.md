# Privacy page rewrite - working copy

The text of `/privacy` (`app/(public)/privacy/page.tsx`) as a document, so each
claim can be reviewed and changed here before the page is updated. It is the
source of truth for wording while we work through the issues in
[`privacy-policy-review.md`](./privacy-policy-review.md). If the wording here
changes, the page must be changed to match, and the other way round.

Status key: **OK** = supported by the code as inspected. **Open** = depends on a
decision or a fix, with the issue number from the register in
`privacy-policy-review.md` section 4 (12 issues in total).

Last updated shown on the page: **2 October 2026**. Contact: `privacy@operatorcalling.com`.

---

## Header

**Privacy-first. Always.**

The Operator is built on the principle that your conversations are yours. We're
here to connect you - not to monetise you.

*Privacy policy - Last updated 2 October 2026*

## The four cards

| Card | Text | Status |
| --- | --- | --- |
| We don't sell your data | We never sell or rent your personal information, and we don't share it with advertisers. | OK |
| We don't record your calls | The Operator does not currently record or store the audio of your calls. Audio passes between callers while the call is happening and is not kept. | Open (Issue 5): dormant AI peer recording service must be confirmed off |
| Groups are controlled spaces | Group admins control who joins their group and the calls it runs. Private groups are invitation-only. | OK (website group admin tools) |
| Flag and report | You can flag a call and report another person. Reports are reviewed by our team, who can suspend or remove accounts that break the rules. | OK; no in-app "block" claimed |

## Safety controls

- Group admins control membership and the calls their group runs
- Contact access is your choice - the app works without it
- Flag a call or report someone, and our team reviews it
- We can suspend or remove accounts that break the rules

## The full policy

This is the privacy policy for The Operator app and website. In short: we collect
what we need to run calls, groups and accounts, we don't record calls, and we
never sell your information.

---

### 1. Who we are - OK

The Operator, in the app and on this website, is run by Mainstream Movement Ltd,
a company registered in England & Wales (no. 09098347). We decide how and why your
information is used. Questions about any of this: privacy@operatorcalling.com.

*Basis: company name and number are in the site footer.*

### 2. What we collect - Open (see notes)

In the app, depending on what you use and what you choose to give us:

- **Your phone number**, which you use to sign in to the app.
- **Your name, username and email address**, which the app asks for when you
  create an account. The name is a display name, not necessarily a first or real
  name. *(Published 2026-10-05, Issue 14.)*
- **Your private profile, which is optional**: a photo, city, country, a short bio
  and your interests. You can add, change or remove these at any time. They are
  used to help improve your matches, and to help us understand which interest
  groups people want so we can create them. Other users do not see your email,
  bio, city, country or interests; they see your name, username and photo.
  *(Proposed, Issues 14 and 17: state the matching and group uses only as they
  actually exist at publication. No code matches users by interests today.)*
- **Account and device identifiers**: an internal user ID, and the identifiers
  Firebase and your phone use to deliver notifications and incoming calls.
- **Your contacts**, but only if you give the app contact access to invite people.
  They are read on your phone, and only the phone numbers you choose to invite are
  sent to us. Declining contact access does not stop you using the app.
- **Call history and connection details**: who a call was with, when it started
  and ended, how long it lasted, how it ended, and technical measures of call
  quality such as delay and packet loss.
- **Groups, invitations, preferences and availability**, including the time zone
  you use.
- **Reports you make** about other people or calls, and any text you write in them.
- **Crash logs and diagnostics**, such as device model, operating system, app
  version and your IP address, so we can find and fix problems.

On this website:

- **Waitlist and early-access sign-ups**: your email address and country, and, if
  you give them, your name, first language, time zone, how you found us, and
  whether you would like to help organise calls or have the app on iPhone or
  Android.
- **Website accounts**, if you sign in with email, Google or a phone number, and
  the profile and settings you save. *(Issue 13: Sign in with Apple has since been
  added to the website, so this list needs updating.)*
- **Messages you send us** through the contact form: your name, email address and
  message.
- **Visits to sign-up links we share**, recorded so we can tell which links work.
  We keep a scrambled (hashed) form of your IP address for this and for spam
  protection, not the address itself.

The website does not currently use advertising or analytics trackers. It uses a
small cookie to remember that you are signed in.

*Notes: do not describe the profile as public (see
[`user-profile-privacy.md`](./user-profile-privacy.md)). "any text you write" in reports is unverified - no free-text report field
was found in the app (Issue 8). Contacts, call history, device IDs and diagnostics must
match the Data Safety declaration (Issue 9). The "hashed IP" claim describes the
website link-visit and rate-limit records only; the app's Sentry reports include
the IP address, which the text says.*

### 3. Calls and audio - Open (Issue 5)

**The Operator does not currently record or store the audio content of calls.**
During a call, audio is sent between the people on it, through servers we run to
connect them, and is not saved. Call audio is encrypted by the standard encryption
built into the calling technology (WebRTC).

We keep a record that a call happened and basic details about it (see above), but
not what was said.

*Basis: Janus rooms are created with `record: false`. A separate recording and
transcription service exists but is only used if a room document sets
`transcriptionEnabled`, which nothing in the app does. Needs confirmation against
live data and the VPS (Issue 5).*

### 4. How we use your information - OK

- To create and run your account, and sign you in.
- To connect you with other people, including pairing within groups.
- To run groups, invitations and schedules.
- To invite people you chose from your contacts, only if you use that feature.
- For safety: blocking, flagging, reports, and acting on accounts that break the
  rules.
- To run, troubleshoot and improve the service, including crash diagnostics.
- To contact you about the service: sign-up confirmations, group and account
  notices, and replies to your messages.

*Note: the word "blocking" appears here but the policy elsewhere only claims flag
and report. Confirm an in-app block exists, or remove the word.*

### 5. What other people see - Open (Issue 4)

When you call someone, or someone calls you, the other person sees the name and
username on your profile. If you have not set a username, they may see your phone
number instead, so it is worth setting one. Other group members can see what the
group makes visible, such as member names.

*Basis: the server sends `callerName` and `callerUsername || callerPhone` to the
receiver. This is the honest wording, but whether the fallback is acceptable is a
product decision (Issue 4). The sentence about email addresses and social profiles was
deliberately removed because user profiles are publicly readable (Issue 1).*

### 6. Sharing and service providers - OK

**We do not sell or rent personal information, and we do not share it with
advertisers.**

We use service providers to run the service, and they process information for us
under our instructions:

- **Google / Firebase**: sign-in, our database, file storage (such as profile
  photos) and push notifications. Google reCAPTCHA helps protect phone sign-in
  from abuse, and Google provides public servers that help phones find each other
  for calls.
- **Sentry**: receives crash reports and diagnostics from the app.
- **Hosting and infrastructure providers**: host this website (Vercel) and the
  servers that connect calls.
- **Email delivery**: when we send service emails, they go through an email
  delivery provider and carry your email address and the message.

We may also disclose information where the law requires it, or to protect people's
safety, or to respond to legal claims.

### 7. Where information is processed - OK

The Operator is a global service. Your information may be processed in countries
other than your own, including by the providers above. Where the law requires it,
we use appropriate safeguards for those transfers.

### 8. How long we keep it - Open (Issues 3, 10)

- Your account information, call history and group activity are kept while your
  account is open.
- If you ask us to delete your account, it enters a 30-day recovery period during
  which you can restore it. After that it is eligible for permanent deletion,
  which our team carries out by hand. When it is deleted, your account and
  associated personal data are deleted or anonymised.
- We may keep limited information where necessary for security, fraud or abuse
  prevention, legal or regulatory requirements, dispute resolution, or to
  establish, exercise or defend legal claims. It no longer forms part of an active
  account.
- Crash reports are held by Sentry, and messages you send us are kept while we deal
  with them. Waitlist details are kept until you ask us to delete them.

*Notes: the super admin deletion step exists but does not yet cover linked or
website data (Issue 3). No
retention periods are set for Sentry data, contact messages or reports (Issue 10).*

### 9. Deleting your account and data - Open (Issue 3)

You can ask us to delete your account and the personal data that goes with it at
any time. The steps are on our Account Deletion page (`/account-deletion`), which
you can read without signing in. If you cannot sign in, or you only joined the
waitlist, email privacy@operatorcalling.com.

Deletion applies to the whole account. We do not currently offer a way to delete
individual kinds of data while keeping your account open; you can edit or remove
the profile details you added yourself in the app and on this website.

### 10. Security - Open (Issues 1, 2)

We take reasonable steps to protect your information. Data sent to Firebase and to
this website is encrypted in transit with TLS, and call audio uses WebRTC
encryption. Access to our admin tools is limited to authorised staff. No service
can promise perfect security, so please tell us straight away if you think your
account has been misused.

*Notes: the text is accurate as written, but it is silent on two real weaknesses:
the signalling server connection is unencrypted (Issue 2), and user profiles are readable
by anyone (Issue 1). Fixing those is better than finding wording for them.*

### 11. Children - OK

The Operator is for people aged 18 and over. It is not intended for children, and
we do not knowingly collect information from anyone under 18. If you believe a
child has given us information, email privacy@operatorcalling.com and we will
delete it.

*Note: the app has no age check at sign-up, so "for people aged 18 and over" is a
statement of intent, not something the app enforces.*

### 12. Your rights and contact - Open (Issue 11)

You can contact us about access to your information, correcting it, deleting your
account, privacy questions, and any other rights you have under the
data-protection laws that apply to you. Email privacy@operatorcalling.com. If you
are not happy with our answer, you can also complain to your local data-protection
authority.

### 13. Changes to this policy - OK

We may update this policy as the service changes. The date at the top shows when it
last changed, and we will make clear any significant changes.
