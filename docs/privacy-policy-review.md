# Privacy policy review - findings and open decisions

Written 2026-10-04, alongside the rewrite of `/privacy`
(`app/(public)/privacy/page.tsx`). The policy was written from what the code does,
not from what the old page said. This file records what was found, where the old
page and the product disagree, what changed, and what needs a decision before the
policy is linked from Google Play and the App Store.

Two repos were inspected: this website (`operator-calling`) and the app
(`C:\Users\cjric\projects\operator`, branch `feat/youtube-channel-groups`).
The Google Play Data Safety form itself could not be seen from the code, so it
has **not** been checked line by line against the policy. See "Data Safety" below.

---

## 1. What the implementation actually does

### App (Flutter) - data collected

| Data | Where it comes from | Evidence |
| --- | --- | --- |
| Phone number | The only sign-in method in the app (Firebase phone auth) | `auth_bloc.dart` (`verifyPhoneNumber`) |
| Name, username, photo, bio, city, country, interests | Profile, optional | `profile_page.dart`, photo to Firebase Storage `profile_images/` |
| Internal user ID, FCM and VoIP push tokens, platform, app version | Account and notification delivery | `user` document fields |
| Device contacts | `fast_contacts`, read on the phone only after the user grants permission | `contact_service.dart` |
| Invited phone numbers | Only the numbers the user selects are saved, as `invites` documents; the SMS is launched from the phone | `bulk_invite_page.dart`, `invite_service.dart` |
| Call history | Participants, start and end times, duration, outcome, how it ended | `call_metrics_service.dart`, `user_call_log_service.dart` |
| Call quality | Round-trip time, jitter, packet loss, audio bytes received | `user_call_log_service.dart` |
| Reports | An in-call flag creates a `reports` document (reporter and reported names and IDs, room ID) and increments `report_count` | `signaling_bloc.dart` ~line 2881 |
| Crash and diagnostic data | Sentry, with `sendDefaultPii = true` (IP address and request headers), `tracesSampleRate = 1.0`; EU region | `lib/main.dart` |
| Time zone | `flutter_timezone` | `pubspec.yaml` |
| Device info | `device_info_plus`, `package_info_plus`, `connectivity_plus` | `pubspec.yaml` |

No free-text report field was found in the app, although the Data Safety
declaration mentions free-text reports. Confirm where that text comes from.

### Website - data collected

- **Waitlist**: email, country; optionally name, first language, time zone,
  referral source, organiser interest, family interest, and the early-access
  choice (`waitlist`, `ios`, `android`). Stored in `waitlistEntries`.
- **Website accounts**: email and password, Google, or phone.
- **Contact form**: name, email, message, stored in `contactMessages` with an
  `emailStatus`.
- **Link visits**: a hashed (not raw) IP per tracked link, referrer, landing page.
- **Deletion requests**: `deletionRequests`.
- **Cookies and storage**: one "signed in" marker cookie; `operator_waitlist_token`
  in localStorage.
- **No analytics or advertising trackers.** A Firebase measurement ID
  (`G-WPD40NB0LG`) is in the config but nothing initialises Firebase Analytics,
  in the website or the app.

### Call audio

- The call media server (Janus) creates rooms with `record: false`.
- A separate **"AI peer" service** (`vps/webrtc-recorder/ai-peer.js`, run under
  PM2) can record each participant's full audio to WAV files, upload them to
  Firebase Storage (`recordings/{callId}/`), transcribe them with Whisper and
  translate them with DeepL.
- The app connects to it **only** if the room document has
  `transcriptionEnabled: true` (`signaling_bloc.dart` ~line 2644). That field
  defaults to false, and **nothing in the app code sets it**. It also does not run
  in Socket.IO signalling mode.
- Conclusion: recording and transcription are dormant. The statement "does not
  currently record or store the audio content of calls" is supported by the code,
  but only if no room document has that flag set and nothing is in the
  `recordings/` storage path. This was not checked against live data.

### Matching and what other people see

- The app has **no global stranger matching** (no matching code found in the app
  or the signalling server). It has group "auto call" pools that pair users within
  a group.
- When someone calls you, the server sends the receiver `callerName`, and for the
  other field `callerUsername || callerPhone` (`server/src/socket/handlers/call_handler.js`
  ~lines 262-301). **If the caller has no username, their phone number is
  delivered to the person they call.**

### Providers that actually receive data

Google / Firebase (auth, Firestore, Storage, push), Google reCAPTCHA Enterprise
(phone sign-in), Google public STUN servers (connection set-up, sees IP), Sentry
(crash reports), Vercel (website hosting), the hosting for the VPS that runs the
signalling and media servers, and Amazon SES for service email when email sending
is switched on. DeepL is used only by the dormant AI peer and is not mentioned in
the policy.

### Account deletion (current state)

- A request is a `deletionRequests` record. It starts a 30-day recovery period, the
  account stays active and is not banned or archived, and the user can restore it
  from their profile.
- After 30 days it is eligible for manual permanent deletion by a super admin.
  Nothing is deleted automatically. A super admin can now review a request and
  delete the account or decline it; deletion goes through the app's `deleteUser`
  cloud function for the primary user ID only (see Issue 3).
- The old self-delete route (`/api/account/delete`) is retired (returns 410).
- There is no deletion of individual data categories while keeping the account.

---

## 2. Inconsistencies found

### Old privacy page versus the implementation

| Old claim | Reality |
| --- | --- |
| "Only your first name is shared" in matched calls | Name and username are shared; the phone number is the fallback when there is no username |
| "Matched calls with a stranger" | No global stranger matching in the app |
| "We do not sell, rent, or share personal data with advertisers **or third parties**" | Firebase, Sentry, Google reCAPTCHA, hosting and email providers all process data |
| "All accounts are verified before accessing matched-stranger calls" | No such feature in the app |
| "Reports are reviewed ... within 24 hours" | No such commitment is implemented |

### Serious issues outside the policy wording

These are numbered in the single issue register in section 4 (Issues 1 to 17),
which is the only numbering used anywhere in these docs. Issues 13 to 17 were
added after the first draft; the profile and Firestore rules work (Issues 1, 14,
15, 16, 17) is analysed in [`user-profile-privacy.md`](./user-profile-privacy.md).

| Finding | Issue |
| --- | --- |
| User profiles are publicly readable (`allow read: if true` on `user`) | 1 |
| Signalling to the VPS is unencrypted (`http://`, `ws://`, iOS arbitrary loads) | 2 |
| Permanent deletion exists (super admin review) but does not cover linked or website data | 3 |
| A caller with no username exposes their phone number to the receiver | 4 |
| The dormant recording and transcription service is unconfirmed as off | 5 |
| Other website pages repeat the old stranger-matching and "first name only" claims | 6 |
| The footer's Terms link goes to `/faq#terms`, which does not exist | 7 |
| No free-text report field found, though Data Safety mentions one | 8 |
| Name, username and email are required at app sign-up; the policy says optional | 14 |
| Any signed-in user can overwrite another user's push tokens | 15 |
| Account linking relies on `systemName` and email, both public | 16 |
| Interests and group membership are described as matching signals, but no matching code was found | 17 |

### Data Safety

The declared answers could not be seen (Issue 9). Likely mismatches to check:
encryption in transit (Issue 2), "data can be deleted" and the deletion mechanism
(Issue 3), what counts as collected (contacts, call history, diagnostics, device
IDs), the free-text report content (Issue 8), and "first name, where supplied"
and email "where supplied", which are required fields at sign-up (Issue 14).

---

## 3. What changed

Only `app/(public)/privacy/page.tsx`:

- Kept the "Privacy-first. Always." introduction, the four cards and the dark
  "Safety controls" block, and rewrote their claims to match the code.
- Added a "Last updated" date (2 October 2026).
- Added a 13-section policy: who we are, what we collect, calls and audio, how we
  use information, what other people see, sharing and service providers, where
  information is processed, how long we keep it, deleting your account, security,
  children (18+), your rights and contact, and changes.
- Names the company from the site footer: Mainstream Movement Ltd, England and
  Wales, company number 09098347.
- Contact address `privacy@operatorcalling.com`, as a normal mailto link.
- Links to `/account-deletion`, which is readable without signing in.
- Says deletion applies to the whole account and that there is no per-category
  deletion.
- Says encryption in transit applies to Firebase and the website, and that call
  audio uses WebRTC encryption. It does **not** claim everything is encrypted.
- Says the other person sees your name and username, and may see your phone number
  if you have no username.
- No jurisdiction-specific laws, regulators or retention periods are stated.

---

## 4. Issue register - 17 issues

Every issue has a number, and every point inside it has two labels: a running
point number across the whole document (P1, P2, ...) and its issue-and-point
number (1.1, 1.2, 3.4). Either can be used to refer to a point. All start **Open**
until decided and done.

| # | Issue | Points |
| --- | --- | --- |
| 1 | User profiles are publicly readable | P1 to P11 |
| 2 | Signalling is not encrypted | P12 to P19 |
| 3 | Permanent deletion is not complete | P20 to P26 |
| 4 | A caller with no username shows their phone number | P27 to P30 |
| 5 | The recording and transcription service is unconfirmed as off | P31 to P35 |
| 6 | Other website pages repeat the old claims | P36 to P39 |
| 7 | The Terms link is broken | P40 to P41 |
| 8 | Free-text reports | P42 to P45 |
| 9 | The Data Safety form has not been compared | P46 to P48 |
| 10 | No retention periods for reports, contact messages or Sentry data | P49 to P51 |
| 11 | Regulator and law wording | P52 to P54 |
| 12 | Unreleased app code | P55 to P56 |
| 13 | The policy has drifted behind the code since it was written | P57 to P60 |
| 14 | Required versus optional profile data | P61 to P64 |
| 15 | Any signed-in user can overwrite another user's push tokens | P65 to P68 |
| 16 | Account linking relies on values that are public | P69 to P71 |
| 17 | Interests and group membership: described purpose versus code | P72 to P75 |

**Total: 17 issues, 75 points.**

**Status update 2026-10-05** (branch `docs/privacy-issues-6-7-14`):

- **Issue 14:** the privacy page wording is fixed (name, username and email described as required). The app marker and the Data Safety answers are still open.
- **Issue 7:** the broken footer link is fixed and a `/terms` page structure exists. **No legal text has been written;** the owner supplies it.
- **Issue 6:** documented only. The exact locations of the badly worded copy are listed under Issue 6 so the owner can edit them. Review again later (the matching redesign).

### Issue 1 - User profiles are publicly readable

- **P1 (1.1)** The shared Firestore rule for `user` is `allow read: if true` (app repo `firestore.rules`, `match /user/{userId}`). The profile is meant to be private; the database does not enforce that.
- **P2 (1.2)** Verified live on 2026-10-04: an unauthenticated request with no key listed documents in the `user` collection (a field mask returned no personal data). `deletionRequests` correctly returned 403.
- **P3 (1.3)** Anyone can therefore read phone number, email, push tokens (`fcmToken`, `voipToken`), account links, the contact lists and the moderation fields on every user document.
- **P4 (1.4)** What other users genuinely see in the app: `name`, `username` and `imageUrl` only. No screen shows another user's email, bio, city, country or interests. The phone number appears only as the call fallback for an account with no username (Issue 4).
- **P5 (1.5)** What the app genuinely needs to read from other users' documents: the receiver's push tokens and platform (the phone places the call push itself), call-eligibility fields (`inCall`, `inAutoQueue`, `dndUntil`), username search, phone-number invite matching and an email-uniqueness check.
- **P6 (1.6)** Rules cannot hide individual fields; they grant a whole document. Because the app needs the receiver's tokens on the phone, no read rule can both keep calls working and protect the private fields. Full analysis: `docs/user-profile-privacy.md`.
- **P7 (1.7)** Stage 1 (minimum, rules only): change the one line to `allow read: if isSignedIn();`. Closes public and public-key access. No signed-out read was found, but it must be tested on the development build (sign-up, login, search, calls). Any signed-in user can still read everything.
- **P8 (1.8)** Stage 1b (recommended with Stage 1): restrict who may update another user's push tokens and call-state fields, see Issue 15.
- **P9 (1.9)** Stage 2 (the real fix, a small public/private split): keep `name`, `username`, `imageUrl` and call-eligibility fields in `user/{id}`; move phone, email, link codes, tokens, the private profile and contact lists to a private place readable only by the owner and the server; move call set-up, search and token cleanup to server calls; migrate with a minimum app version.
- **P10 (1.10)** Recommendation: Stage 1 and 1b now, Stage 2 as the next release. The policy makes no claim about who can see profile data until Stage 1 is live.
- **P11 (1.11)** Process: rules changes are prepared in the app repo for the Development branch and promoted to Staging. Never the Firebase console. Nothing has been changed or deployed.

### Issue 2 - Signalling is not encrypted

- **P12 (2.1)** The app reaches the signalling server over `http://` and the Janus media server over `ws://` (`app_constants.dart`, around lines 100 and 105). The dormant AI peer is also `ws://`.
- **P13 (2.2)** iOS has `NSAllowsArbitraryLoads` switched on in `Info.plist`.
- **P14 (2.3)** What travels unencrypted: call set-up data such as user IDs, names, usernames or phone numbers (`callerName`, `callerPhone`) and call IDs.
- **P15 (2.4)** What is encrypted: Firebase traffic, the website, and call audio (WebRTC media encryption).
- **P16 (2.5)** Data Safety impact: "all data is encrypted in transit" cannot be answered yes.
- **P17 (2.6)** Fix: put TLS in front of the signalling and Janus servers (a domain and certificate, then `https` and `wss`), update the app, and remove the iOS exception. Needs VPS changes on development and production and an app release.
- **P18 (2.7)** Alternative: declare it accurately in Data Safety and keep the policy as is.
- **P19 (2.8)** The policy currently claims TLS only for Firebase and the website, and WebRTC encryption for audio, so it does not overclaim.

### Issue 3 - Permanent deletion is not complete

- **P20 (3.1)** A super admin can now review a deletion request and either delete the account or decline it (`/api/admin/deletion-requests/[id]`, `lib/deletion-review-server.ts`). Nothing is deleted automatically.
- **P21 (3.2)** Deletion runs through the app's `deleteUser` cloud function for the request's primary user ID only. It archives a full copy, marks a 30-day recovery in the archive, then removes the account.
- **P22 (3.3)** Not covered: the other linked user documents recorded on the request, website sign-in accounts, waitlist entries (matched by email), contact messages, and records in other collections owned by the user.
- **P23 (3.4)** An admin can delete before the 30-day window ends (the review records this as an early deletion).
- **P24 (3.5)** The privacy and account deletion pages say the account and associated personal data are "deleted or anonymised" and that app and website accounts are covered together. That is a stronger statement than the code does today.
- **P25 (3.6)** Needed: extend deletion to all linked identities and website data, delete only records the user owns (do not remove other people's records that merely mention them), keep the legal-hold exception, and never delete automatically.
- **P26 (3.7)** Until then, soften the page wording or hold publication.

### Issue 4 - A caller with no username shows their phone number

- **P27 (4.1)** When someone calls, the server sends the receiver `callerName` and `callerUsername || callerPhone` (`call_handler.js`, around lines 262 to 301).
- **P28 (4.2)** So a caller who has not set a username exposes their phone number to the person they call.
- **P29 (4.3)** The policy now says this plainly: name and username are shown, and the phone number may be shown if there is no username.
- **P30 (4.4)** Options: require a username before calling, never send the phone number, or accept it and keep the wording.

### Issue 5 - The recording and transcription service is unconfirmed as off

- **P31 (5.1)** A separate "AI peer" service (`vps/webrtc-recorder/ai-peer.js`, run under PM2) can record full audio, upload it to Firebase Storage under `recordings/`, transcribe it with Whisper and translate it with DeepL.
- **P32 (5.2)** The app connects to it only when a room document has `transcriptionEnabled: true`. It defaults to false and nothing in the app code sets it. It does not run in Socket.IO signalling mode.
- **P33 (5.3)** The call media server creates rooms with `record: false`.
- **P34 (5.4)** So the statement "does not currently record or store call audio" is supported by the code, but not yet checked against live data.
- **P35 (5.5)** Needed: confirm the service is stopped or unused on the VPS, that no room has the flag set, and that `recordings/` in Storage is empty. Stopping the service removes the doubt.

### Issue 6 - Other website pages repeat the old claims

- **P36 (6.1)** The FAQ, features and how-it-works pages still describe matched stranger calls and "only your first name is shared".
- **P37 (6.2)** The app has no global stranger matching. It pairs users within group pools.
- **P38 (6.3)** The website profile has an "allow unknown calls" setting that has no matching feature behind it in the app.
- **P39 (6.4)** Needed: correct those pages to match the app and the policy.
- **Status (2026-10-05):** deliberately **not changed** in this branch. The owner will edit the copy as part of the redesign and it will be reviewed again afterwards.

**Where the copy is** (found by searching the code for "stranger", "first name", "matched", "by interest", "anonymous"; not an exhaustive read of every page):

| # | File and lines | Current wording | What is wrong |
| --- | --- | --- | --- |
| a | `app/(public)/faq/page.tsx` 18-19 | Q "Can I call strangers?" A "Yes, but only if you opt in. Matched stranger calls are privacy-first: only your first name is shared, and you're matched by shared interests through our admin-moderated system." | No global stranger matching in the app; name and username are shared, not just a first name; no interest matching found in code (Issue 17) |
| b | `app/(public)/features/page.tsx` 21 | "Matched stranger calls - Opt in to calls with people outside your network. Matched by interest, protected by privacy." | Same: no stranger matching, no interest matching |
| c | `app/(public)/features/page.tsx` 30 | "Anonymous matched calls - Opt-in stranger calls reveal only a first name. You control what's visible." | Not anonymous: name and username are shown, and the phone number if there is no username (Issue 4) |
| d | `app/(public)/how-it-works/page.tsx` 15 | "...or opt into matched calls with people from around the world who share your interests." | No such matching; the app pairs people inside group pools |
| e | `app/(public)/use-cases/page.tsx` 22-23 | "...without the awkwardness of cold-calling strangers..." and scenario "Matched by target language" | Implies language matching that does not exist |
| f | `components/marketing/FeatureSections.tsx` 24-28 | "Unexpected calls with people you don't [know]" / "Opt into privacy-first calls with people from around the world. Same interests, different lives." | Describes stranger matching by interest |
| g | `components/marketing/GroupsSection.tsx` 34 | Testimonial: "...I was sceptical about calling strangers, but the matched calls are honestly some of the best conversations I've had this year." | Describes matched stranger calls. Also confirm the testimonial is genuine and attributed |
| h | `components/dashboard/ProfileEditor.tsx` 546-547 | Setting "Allow matched calls with strangers - Opt into privacy-first calls with people outside your network, matched by interest." (stores `callPreferences.allowUnknownCalls`) | A setting with no feature behind it in the app (P38). Related defaults: `components/auth/SignInChoices.tsx` 79, `lib/dashboardSeed.ts` 278 (`enableStrangerCalls`) |
| i | `components/dashboard/ProfileEditor.tsx` 376 and 464 | "Add a bio and interests to get better matched calls." / placeholder "...helps with matched calls." | Promises a matching benefit that does not exist (Issue 17) |

Accurate and **not** a problem: `app/(public)/groups/start/page.tsx` 226 and `components/marketing/GroupsSection.tsx` 91 ("no random strangers"/"no strangers in your group unless you approve them"), and the group "random pairs" options in `groups/start`, which describe pairing inside a group. `app/dashboard/groups/[id]/page.tsx` 1033 ("Partner is anonymous - shows Family only") was not checked and may need a look.

### Issue 7 - The Terms link is broken

- **P40 (7.1)** The footer's Terms link goes to `/faq#terms`, which does not exist.
- **P41 (7.2)** Needed: add a Terms page, or remove the link.
- **Status (2026-10-05):** the footer link now goes to `/terms` (`components/shared/Footer.tsx`) and `app/(public)/terms/page.tsx` exists as **structure only**. `TERMS_SECTIONS` is empty, so the page shows a "being finalised" notice and is marked `noindex`. **The owner supplies the legal text** (ideally reviewed by a lawyer): fill `TERMS_SECTIONS`, set `LAST_UPDATED`, and remove the `robots` line from `metadata`. Nothing in the repo invents terms.

### Issue 8 - Free-text reports

- **P42 (8.1)** The Data Safety declaration mentions free-text reports.
- **P43 (8.2)** The only report found in the app is an in-call flag that records names and the room ID. No free-text field was found.
- **P44 (8.3)** The policy says "any text you write" in reports.
- **P45 (8.4)** Needed: confirm where free-text report content comes from, or correct the declaration and the policy line.

### Issue 9 - The Data Safety form has not been compared

- **P46 (9.1)** The declared answers could not be seen from the code.
- **P47 (9.2)** Likely mismatches: encryption in transit (Issue 2), data deletion (Issue 3), what counts as collected (contacts, call history, diagnostics, device IDs), and free-text reports (Issue 8).
- **P48 (9.3)** Needed: compare the declared answers with `privacy-policy-review.md` and `privacy-page-rewrite.md` and fix any mismatch before submission.

### Issue 10 - No retention periods for reports, contact messages or Sentry data

- **P49 (10.1)** None is implemented, so the policy gives none.
- **P50 (10.2)** Reports, contact messages (`contactMessages`) and Sentry crash data are kept until something removes them.
- **P51 (10.3)** Needed: decide whether to set periods. If so, they must be implemented and then stated.

### Issue 11 - Regulator and law wording

- **P52 (11.1)** The policy uses generic wording and does not name a law or regulator.
- **P53 (11.2)** The company is registered in England and Wales.
- **P54 (11.3)** Decision: name the UK GDPR and the ICO, or keep the generic wording. No jurisdiction-specific retention periods are stated either way.

### Issue 12 - Unreleased app code

- **P55 (12.1)** The app branch has YouTube channel connections and group features that the policy does not describe.
- **P56 (12.2)** Needed: confirm what is released. Anything released that collects data must be in the policy and in Data Safety.

### Issue 13 - The policy has drifted behind the code since it was written

- **P57 (13.1)** Sign in with Apple was added to the website, with handling for private relay (Hide My Email) addresses. The policy says website accounts use email, Google or a phone number.
- **P58 (13.2)** A reports queue, user moderation and an audit trail were added to the super admin tools. The policy's safety wording is general and still true, but should be re-read.
- **P59 (13.3)** The deletion review (Issue 3) changed what "deleted" means in practice.
- **P60 (13.4)** Needed: re-read the policy against the current code before publication, and keep doing so after each release that touches data.

### Issue 14 - Required versus optional profile data

- **P61 (14.1)** App sign-up requires a name ("Your display name"), a username (at least 3 characters, letters, numbers and underscores) and an email address. City, country, bio, photo and interests are optional.
- **P62 (14.2)** The privacy page says name, username, email and other profile details are given "where you choose to supply them" and are optional. That is wrong for new app accounts.
- **P63 (14.3)** The name field is a free-text display name, not necessarily a first name, so "first name, where supplied" in the Data Safety wording needs checking.
- **P64 (14.4)** Needed: correct the policy, mark required fields in the app, and align the Data Safety answers.
- **Status (2026-10-05):** the policy is corrected in `app/(public)/privacy/page.tsx` ("What we collect"). It now says name (a display name, not necessarily a first or real name), username and email address are required to create an app account, and that a photo, bio, city, country and interests are optional. **Still open:** marking required fields in the app, and the Data Safety answers (Issue 9). Decision taken: the policy follows the app, so the app is not being changed to make these optional.

### Issue 15 - Any signed-in user can overwrite another user's push tokens

- **P65 (15.1)** A second rule in `match /user/{userId}` lets any signed-in user update another user's document when only a listed set of keys changes: `fcmToken`, `voipToken`, `platform`, `isOnline`, `lastSeen`, `inCall`, `currentCallId`, `callStartedAt`, `appVersion`, the auto-call counters, `dndUntil`, `dndOption`, `inAutoQueue`, `inAutoQueueAt`, the in-car fields and `callLoggingEnabled`.
- **P66 (15.2)** A signed-in attacker can set a victim's `fcmToken` or `voipToken` to their own device and receive the victim's incoming-call pushes, or mark them as in a call or on do-not-disturb.
- **P67 (15.3)** Proposed (Stage 1b): that branch applies to the owner or an admin only, with one narrow exception that keeps the app's stale-token cleanup working: another user may change only `fcmToken` and `voipToken`, and only to `null`.
- **P68 (15.4)** Needs the same development-build test pass as Stage 1, because the app's presence and the operator dashboard write some of those fields.

### Issue 16 - Account linking relies on values that are public

- **P69 (16.1)** Linking a phone-only web session to an app account needs the app's `systemName` code and the app account's email (`app/api/account/link/route.ts`). Both are readable by anyone while `user` is public.
- **P70 (16.2)** An attacker could link their own web sign-in to a victim's app account and then read and edit that profile from the website.
- **P71 (16.3)** Stage 1 makes this harder (the attacker needs a signed-in account); Stage 2 removes it by moving those values out of the shared document.

### Issue 17 - Interests and group membership: described purpose versus code

- **P72 (17.1)** Intended purposes: help match people with like-minded people, and help us understand what interest groups users want so we can create them. Group membership is also a matching signal.
- **P73 (17.2)** In the code reviewed, profile `interests` are stored, edited and shown only to the owner and to admins. No code was found that matches users by their interests, in the app, the signalling server or the cloud functions. Group membership is likewise not used for matching.
- **P74 (17.3)** The policy and the Private Profile wording should describe these as intended or current uses accurately at the time of publication.
- **P75 (17.4)** Needed: either build the matching use, or word the policy and UI so they do not promise it.

---

## 5. Not verified

- The live Firestore data and Firebase Storage contents.
- Whether `EMAIL_SENDING_ENABLED` or `CONTACT_EMAIL_SENDING_ENABLED` are on in
  production, and whether SES is verified.
- The Google Play Data Safety form and the App Store privacy labels.
- Whether an in-app block feature exists (the policy says "flag" and "report",
  not "block").
- The hosting provider and region of the VPS.
