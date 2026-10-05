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
