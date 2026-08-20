# The Firebase project

The website uses **one** Firebase project, `operator-calling`, hard-coded in
`lib/firebase-env.ts`. There is no runtime switch, no default, and no fallback.

Three environment variables run the site:

```
FIREBASE_CLIENT_EMAIL   firebase-adminsdk-…@operator-calling.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY    its private key
ADMIN_LOGIN_ENABLED     true      # gates POST /api/admin/token
```

Nothing else is read. `NEXT_PUBLIC_FIREBASE_ENV`, the `*_PROD` / `*_DEV`
credential pairs and the six `NEXT_PUBLIC_FIREBASE_*` values were removed on
2026-08-20; if you find one lingering in a dashboard it is inert.

## Why there is no switch

The browser client (`lib/firebase.ts`) and the Admin SDK (`lib/firebase-admin.ts`)
both resolve through `lib/firebase-env.ts`, and that module now returns a
constant. Neither can read the project from anywhere else, so they cannot drift
apart.

That matters more than it looks. A Firebase ID token is only valid for the
project that issued it — the client is the issuer, the server is the verifier.
When those two disagreed, sign-in appeared to succeed and then every read failed
with `Missing or insufficient permissions`, and admin lookups quietly found
nothing. The selection machinery that was supposed to keep them in step was
itself the thing that let them separate: every code path — an env name, a scoped
credential pair, an unsuffixed fallback — was another way to configure half a
project. Deleting them removes the failure class rather than guarding against it.

**This is a statement about the website only.** The mobile app still has its own
`dev` flavour and its own project, configured in `lib/firebase_options.dart` and
`dart-defines/dev.json`, and reads nothing from this repo. What changed is that
the website can no longer be pointed at anything but production — chosen to keep
the deployment simple, not because anything else went away.

If a second project is ever genuinely needed here, add it as an explicit, tested
code path. Do not reintroduce a silent default or a fallback.

## The client config is committed on purpose

`lib/firebase-env.ts` holds the complete web config. Firebase web config is
public by design — it identifies a project, it does not grant access to one.
Access is decided by Firestore/Storage rules and by Auth. The mobile app commits
the same values in `lib/firebase_options.dart`, and they ship in the browser
bundle regardless.

Values were read from the live project with `firebase apps:sdkconfig WEB`, not
copied from documentation. `operator-calling` has exactly one web app.

**Server credentials are never baked in** — those are real secrets and stay in
the environment.

## The private key

It is the PEM from the service-account JSON. `lib/firebase-admin.ts` normalises
literal `\n` escapes, so both the escaped one-line form and a real multi-line
PEM work. What does not work is the surrounding `"` from the JSON: that produces

```
error:1E08010C:DECODER routines::unsupported
```

on the first Firestore call, which surfaces as a 403 from every `/api/admin/*`
route rather than anything mentioning a key. See
[`single-project-migration.md`](./single-project-migration.md#failure-modes-seen-in-practice).

`WAITLIST_HASH_SALT` defaults to this key, so rotating it changes every
visitor-IP hash and resets unique-visit dedupe and rate-limit buckets.
Duplicate-signup detection is unaffected — it uses an unsalted hash,
deliberately. Set `WAITLIST_HASH_SALT` explicitly to decouple them.

## Only Production is configured

Preview and Development deployments have no credentials, so their server routes
throw `[firebase-admin] Cannot initialize Firebase — missing environment
variable(s): …` and return 500. This is intended: production is the test
environment, and a preview holding production credentials would read and write
live data.

## What lives outside this repo

**Accounts.** Firebase Auth users are per-project, so no account transferred
from the project the website used previously. See
[`single-project-migration.md`](./single-project-migration.md).

**Cloud Functions.** `SuperAdminDashboard` derives its function URL from
`firebaseProjectId()`, calling
`https://us-central1-operator-calling.cloudfunctions.net/sendFcmMessage`. That
function is deployed from the app repo and must exist in this project.

**Firestore rules.** Owned by the app repo and applied manually — this repo never
modifies them. What the website needs from them, including why `user` is
world-readable, is in [`firestore-rules.md`](./firestore-rules.md).
