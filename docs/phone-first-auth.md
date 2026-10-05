# Phone-first sign-in and explicit Google/Apple linking

Handover for the change that retires systemName + email as proof of ownership.
Code: `lib/auth-linking.ts`, `components/auth/SignInChoices.tsx`,
`components/dashboard/SignInMethods.tsx`, `app/api/account/link/route.ts`,
`hooks/useAuth.ts`, `components/shared/LinkAccountBanner.tsx`.

## Previous behaviour

- `/login` and `/signup` showed Google, Apple and phone side by side. Any of them **created a new Firebase
  user and a `user/{uid}` profile** when none was found.
- After Google/Apple the page offered "add your phone number", which wrote whatever the person typed to
  `user.phoneNumber` **without verifying it**.
- A website account was tied to an app account by `POST /api/account/link`: caller supplies the app account's
  Support Code (`systemName`) plus, for Google, a matching email or, for phone, the app account's email typed in.
  The route then **merged** into the app profile document (app fields win), set `linkedWebUid` / `linkedWebUids`,
  and **deleted the web account's `user/{uid}` document**. The Firebase Auth users stayed separate.
- `useAuth` and sign-in also found a profile **by Auth email alone** (`where("email", "==", ...)`), and treated
  a shared email as "this is an existing account".

`systemName` and an email are things other people can learn, so none of that proved ownership.

## New behaviour

- `/login` and `/signup` have two tabs. **Phone** is the default. **Other sign-in** has Google and Apple.
- Phone sign-in works for existing app users and for brand new people who never installed the app.
- Google/Apple sign-in **never creates an account**. If the popup just created a Firebase user
  (`getAdditionalUserInfo().isNewUser`) and it has no phone provider, the page deletes that user, signs out, and
  says to sign in with phone first and link from the profile. (`decideFederatedSignIn` in `lib/auth-linking.ts`.)
- Dashboard, Profile, **Sign-in methods** (`SignInMethods.tsx`): a phone-verified user can press *Link Google* /
  *Link Apple*. A user without a verified phone can verify one (`linkWithPhoneNumber`) first.
- Email is no longer used to find or match an account anywhere on the website client.
- `/api/account/link` answers `410 { status: "retired" }` and does nothing.
- The dashboard banner no longer asks for a Support Code; it explains the phone route.

## How phone identity maps to the Operator account

1. The person verifies a phone number; Firebase returns the Auth user for that number. In one Firebase project the
   same number is the same UID on web and in the app.
2. `POST /api/account/resolve` (unchanged) finds the profile: `user/{uid}`, else a profile whose
   `linkedWebUids` / `linkedWebUid` holds the uid, else a profile whose `phoneNumber` equals the **verified**
   `phone_number` claim in the ID token. It records the uid in `linkedWebUids` so later lookups are direct.
3. `useAuth` resolves the same way client-side (alias, then uid). The profile document id can differ from the
   Auth uid, which is why `profileDocId` exists. Nothing here changes that.

## How Google/Apple linking works

`linkWithPopup(currentUser, provider)` adds the provider to the **already signed-in phone user**, so the Auth uid
does not change and no data moves. Afterwards, signing in with Google/Apple returns that same uid (its provider
list contains `phone`), and the same resolution applies. Failures (`auth/credential-already-in-use`,
`auth/email-already-in-use`) are shown as "never merged" and change nothing.

## Protection against duplicate accounts

- Google/Apple sign-in cannot create an account (above); the transient Firebase user is deleted.
- If that delete fails, the retry is still refused: a Google/Apple user with no phone and no resolvable profile is
  never let in (`hasProfile` in `decideFederatedSignIn`). A non-new user is only deleted if created in the last
  15 minutes, and never on a failed profile lookup (the person is just signed out and asked to retry). The
  console warns with the uid of any user that could not be deleted, for manual clean-up.
- Linking attaches to the signed-in user only; Firebase refuses if the identity belongs to another user.
- No email lookups, so an Apple private-relay or a coincidentally equal Google email cannot attach a session to
  someone else's profile.
- The unverified "add phone" write is gone. Otherwise someone could save another person's number on their own
  profile and `resolve` would later hand that profile to the real owner when they signed in.
- Nothing merges two existing accounts. The merge code was removed with the route.

## What happened to systemName / email linking

Retired (410), not deleted outright. Dependencies checked: the only caller was `LinkAccountBanner`
(rewritten). `systemName`, `linkedSystemName`, `linkedWebUid`, `linkedWebUids` are still **read** by `useAuth`,
`/api/account/resolve`, `isLinked`/DashboardNav gating, and admin lookup, so accounts linked the old way keep
working with no data change.

## Migration and backward compatibility

- **Already linked (alias fields present):** unchanged.
- **Existing website-only Google/Apple users** (Auth user exists, no phone): still allowed in
  (`allow_legacy`). Blocking them would lock out real people. They are not merged; they can verify a phone in
  Sign-in methods. If that number already belongs to another Operator account Firebase refuses, and the person
  is told to sign in with that account. Those people stay as two accounts until a human decides otherwise.
- **People who relied on the old email match** (a profile found only because the Auth email equalled a profile
  email) will now see no profile on web until they sign in by phone. This is intended but visible.
- **Data the old merge carried over** (name, interests, preferences from a web-only doc) is no longer carried.
  Memberships keyed to a web uid were never migrated by the old flow either.
- Stale clients calling the old route get a 410 with an explanation.

## Architecture finding (read this)

Verified in this repo: one Firebase project (`operator-calling`) for web Auth, and the website already resolves
profiles through uid aliases because document ids and Auth uids can differ. Provider linking does not depend on
the profile document id, only on the Auth user, so it is safe on the website side.

**Not verifiable from this repo:** that the production mobile app authenticates by phone in the same
`operator-calling` project (the migration doc says the app still has its own dev project). If the app's Auth user
for a number is a different UID than the website's phone sign-in, linking is still safe (it attaches to the web
phone user) but "same account as the app" then rests entirely on the `phoneNumber` match in `/api/account/resolve`.
Please confirm the app side.

## Manual Development testing required

No Firebase config was changed and nothing deployed. Previews have no Firebase credentials, so per project
practice this is verified in the environment the developer chooses, after deploy.

1. Phone sign-in, number with an existing app account: lands in that account, profile and role correct.
2. Phone sign-in, brand new number: account created, optional email step, dashboard loads.
3. Other sign-in tab, Google with an identity never linked: refused with the phone-first message, and **no new user
   appears in Firebase Auth** (confirms `user.delete()` worked; if it needs a recent login and failed, the console
   shows a warning and a stray Auth user to clean up).
4. Same for Apple (including Hide My Email).
5. Phone-signed-in user: Profile, Sign-in methods, Link Google, sign out, sign in with Google: same uid, same profile.
6. Link a Google identity that already belongs to another account: refused, nothing changed.
7. Existing legacy web-only Google user: still signs in; can verify a phone; clash with an existing phone account is refused.
8. Previously linked account (has `linkedWebUids`): unchanged.
9. `POST /api/account/link` returns 410.
10. Apple link (needs Apple configured, `docs/apple-signin.md`).

## For developer review

- Firebase Console, Authentication, Settings, "User account linking": confirm **one account per email** vs
  **link accounts that use the same email** behaves as intended. Not changed here. Automatic email linking would
  attach Google to any existing user holding the same verified email, which is the behaviour this change avoids.
- `GroupSetupModal` (components/shared) is now unused: the old successful link opened it, and nothing else imports it. Decide whether to show it after a phone sign-in resolves to a linked profile, or remove it.
- `user.delete()` right after popup sign-in is the "undo". A server-side check would be stricter but cannot stop
  Firebase from creating the user first.
- `lib/admin-auth.ts` still has an email fallback for admin lookup. It is gated by the `admins` collection, was out
  of scope, but is the same pattern.
- `npm run lint` fails on a circular-JSON ESLint config error that predates this branch.
- `tests/card-encode.test.ts` can time out (5s) on slow machines; unrelated.
- No emulator test covers `/api/account/resolve`; the rules for Firebase client SDK linking cannot be unit tested here.

## Security findings and how this PR addresses them

Principle: **only an authenticated, verified Firebase credential establishes account ownership.** A systemName, an
email address, or a stored/typed phone number never does. Regression tests: `tests/account-ownership.test.ts`
(they were run against the pre-fix `resolve` and `invite/process` routes and fail there) and
`tests/auth-linking.test.ts`.

### 1. systemName + email could link or merge different accounts - RESOLVED IN PR #3

- **Was:** `POST /api/account/link` merged a web account into the app account for anyone who knew the Support Code
  and the matching email (or typed the app email), and deleted the web account's document.
- **Now:** the route returns 410 and has no database access (`app/api/account/link/route.ts`). The only code that
  writes `linkedWebUid(s)` is `/api/account/resolve`, from a verified token. Google/Apple are attached by Firebase
  `linkWithPopup` to the signed-in phone user (`SignInMethods.tsx`); a clash fails with
  `auth/credential-already-in-use` and changes nothing.
- **Tests:** "finding 1" block in `account-ownership.test.ts` (route returns 410 for a systemName + email body; no
  `runTransaction`/`delete`/`set`; no `where("systemName")` anywhere; only `resolve` writes aliases).
- **Existing data:** see "Existing-data concerns".

### 2. Profiles resolved by email alone - RESOLVED IN PR #3 (for the website sign-in path)

- **Was:** `useAuth` fell back to `where("email", "==", authEmail)`, and `SignInChoices` treated any profile with
  the same email as "an existing account". A Google email equal to someone's profile email attached the session
  to that profile.
- **Now:** both lookups are removed; profiles are found by uid, by link alias, or by a verified phone
  (see 3). Google/Apple additionally cannot create or enter an account without a phone link or an existing profile.
- **Tests:** "finding 2" block (no `where("email"` in `useAuth`, `SignInChoices`, `resolve`; resolve never reads
  an email) and the `decideFederatedSignIn` cases in `auth-linking.test.ts`.
- **Deliberately left (not self-service identity):** admin-typed lookups by email in
  `app/api/admin/groups/[id]/admin/route.ts` and `app/api/admin/organisers/route.ts` (an admin choosing a person,
  behind `requireAdmin`), and the `admins/{email}` authority records in `lib/admin-auth.ts`. They do not let a
  user claim an account. `app/api/qrinvite/pending/claim/route.ts` matches pending invites by the token's
  verified phone, or its email when there is no phone; it grants an invite, not account ownership, but a developer
  should confirm the token email there is a verified one.

### 3. Unverified phone numbers trusted for ownership - RESOLVED IN PR #3 for new writes; existing data needs developer review

- **Was:** the "add phone" step saved a typed number to `user.phoneNumber`, and `/api/account/resolve` later matched
  a verified sign-in to any profile whose stored `phoneNumber` equalled it, so a number squatted on a profile
  was handed to its real owner. `/api/invite/process` also keyed an `invites` record by a client-supplied number.
- **Now:**
  - The add-phone step is gone; the only phone written is `user.phoneNumber`, which Firebase just verified.
    A phone is added to an existing account only by `linkWithPhoneNumber` (code verified by Firebase).
  - `resolve` takes the number only from the verified token (`decoded.phone_number`) and, for the *stored-number*
    match, only selects an **app-created** profile (has `systemName`) and only when exactly one matches
    (`lib/account-resolve.ts`). A web-created profile carrying a typed number can no longer be matched, and an
    ambiguous number matches nothing.
  - `/api/invite/process` ignores the body's `inviteePhone` unless it equals the verified token number.
- **Tests:** "finding 3" blocks (`pickPhoneMatch` cases; resolver uses the token number and the picker; sign-in
  writes no typed number; invite route behaviour with a fake database: body phone ignored when it differs from
  or the token lacks a verified number, written only for the verified one).
- **Why not fully resolved for existing data:** a squatted number on a profile that *does* have a `systemName`
  (for example written by the app or another path) is still indistinguishable from a real one from this repo. The
  app's rules/writers own that (see below).

## Existing-data concerns (nothing was read or changed in production)

Please have a developer audit these read-only before or after rollout. Decide any clean-up; this PR does not.

1. **Accounts linked by the old flow.** Profiles in `user` with `linkedWebUid` / `linkedWebUids` / `linkedWebEmail`
   set. Each was linked on the strength of systemName + email, not a verified phone. They still resolve (we did
   not break them, and we did not re-verify them). Query: `user` where `linkedWebUid` != null; compare each
   linked uid's Firebase Auth record: does it have the phone provider and the same number as the profile?
2. **Profiles associated by email matching.** There is no marker for "found by email"; the old code only displayed
   such a profile and never wrote an alias, so no stored link is expected. Spot check: accounts whose Auth user has
   no `linkedWebUids` entry and no `user/{uid}` document but whose email equals a profile email. After this PR those
   people see no profile until they sign in by phone.
3. **Stored phone numbers never Firebase-verified.** Written by the old web "add phone" step, and possibly other
   writers. Query: `user` where `phoneNumber` != null and no `systemName`, and compare with the Auth user's
   verified `phoneNumber`. Also `user` documents whose `phoneNumber` is shared by more than one profile (these now
   match nothing in `resolve`).
4. **`invites` records** with `method == "web_signup"` and `via == "sms_link"` keyed by a phone that is not the
   inviting session's verified number were possible before this fix.
5. **Rules.** Whether a signed-in user can write `systemName`/`phoneNumber`/`linkedWebUid` onto their own `user`
   document depends on the app's `firestore.rules`, which this repo does not own. If they can, the `systemName`
   filter in `pickPhoneMatch` is only a partial guard; the rule should forbid client writes to those fields.

## Deliberately deferred

- Any migration, re-verification, merging or clean-up of existing accounts or fields.
- Re-keying stored phone numbers to a verified-only field (needs the app to write it; developer decision).
- The admin and QR-invite email lookups noted under finding 2.
