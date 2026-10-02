# Sign in with Apple

"Continue with Apple" on `/login` and `/signup` signs in through Firebase Auth's `apple.com` provider
(`components/auth/SignInChoices.tsx`, helpers in `lib/apple-signin.ts`).

It only works once Apple and Firebase are configured. Until then the button shows
"Sign in with Apple isn't switched on for this site yet" (Firebase's `auth/operation-not-allowed`).

## One-time setup (cannot be done from code)

### 1. Apple Developer account (developer.apple.com → Certificates, Identifiers & Profiles)

1. **App ID** for the mobile app (`org.gomainstream.operatorcalling`): turn on **Sign in with Apple**.
2. **Services ID** (this is the web "client id"), e.g. `org.gomainstream.operatorcalling.web`:
   - enable **Sign in with Apple** → Configure
   - Primary App ID: the one above
   - Domains: `operator-calling.firebaseapp.com`
   - Return URLs: `https://operator-calling.firebaseapp.com/__/auth/handler`
3. **Key**: create a key with **Sign in with Apple** enabled, download the `.p8` (only offered once) and note the
   **Key ID**. Note the **Team ID** (top right of the portal).

### 2. Firebase Console (project `operator-calling`) → Authentication → Sign-in method

1. Add **Apple** and enable it.
2. Services ID = the Services ID above. Team ID, Key ID and the private key (contents of the `.p8`).
3. Authentication → Settings → **Authorized domains** must include `operatorcalling.com` (and `www.` if used).

### 3. Hide My Email / Private Relay (so mail reaches people who hid their address)

Apple only forwards mail sent **from a registered domain/address**. The detailed, step-by-step setup (SPF record,
registering the From address, SES DKIM, testing) is in [`email-setup.md`](./email-setup.md#apple-private-email-relay-sign-in-with-apple-hide-my-email).

Without this, sign-in still works but any email to a `@privaterelay.appleid.com` address is silently dropped.

## How Hide My Email is handled

- The address Apple gives (`…@privaterelay.appleid.com`) is stored as `email` with `emailIsPrivateRelay: true`.
- Identity is the Firebase uid, never the email. A relay address is **not** used to look for an existing account,
  because it can never equal the address the person uses elsewhere.
- Consequence: someone who already has an account and then picks *Hide My Email* gets a **new, separate** account.
  They can link to their app account the normal way (phone number / support code in the profile).
- If they share their real email and it matches an existing Google account, Firebase refuses with
  `auth/account-exists-with-different-credential` and the page tells them to use Google.

## Apple only sends the name once

Name and email arrive on the **first** authorisation only. A later sign-in sends neither, so a missing name never
overwrites a stored one. A brand new Apple account with no name gets one optional "What should we call you?" step.

## Not done

- Revoking the Apple token when an account is deleted (Apple asks for this for apps that offer Sign in with Apple).
- Sign in with Apple in the **mobile app** (separate work; the App Store requires it if the app offers another
  third-party sign-in).
