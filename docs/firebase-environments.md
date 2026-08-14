# Switching the Firebase project

The website talks to **one** Firebase project at a time, chosen by a single
variable. `operator-calling` is the default.

```
NEXT_PUBLIC_FIREBASE_ENV = prod | dev | custom      # unset ⇒ prod
```

| Value | Project | Notes |
|---|---|---|
| `prod` (default) | `operator-calling` | The live project. Also `production`. |
| `dev` | `webrtc-clone-dc88c` | Matches the mobile app's `dev` flavour and `dart-defines/dev.json`. Also `development`. |
| `custom` | whatever you configure | Reads the full `NEXT_PUBLIC_FIREBASE_*` set. For a third project or the emulator suite. |

An unrecognised value warns and falls back to `prod` rather than starting
half-configured.

## Why one variable

The browser client (`lib/firebase.ts`) and the Admin SDK (`lib/firebase-admin.ts`)
both resolve through `lib/firebase-env.ts`. Neither reads the project from
anywhere else, so they cannot drift apart.

That matters more than it looks. A Firebase ID token is only valid for the
project that issued it — the client is the issuer, the server is the verifier.
When those two disagreed, sign-in appeared to succeed and then every read failed
with `Missing or insufficient permissions`, and admin lookups quietly found
nothing. This is the same failure the single-project migration fixed; keeping one
resolver is what stops it coming back.

For that reason `prod` and `dev` **ignore** the `NEXT_PUBLIC_FIREBASE_*`
variables entirely. A stale `NEXT_PUBLIC_FIREBASE_PROJECT_ID` left in Vercel
cannot silently override half the config. If you need those variables honoured,
say so explicitly with `NEXT_PUBLIC_FIREBASE_ENV=custom`, which requires all six
and rejects a partial set.

## The client config is committed on purpose

`lib/firebase-env.ts` holds the complete web config for both projects. Firebase
web config is public by design — it identifies a project, it does not grant
access to one. Access is decided by Firestore/Storage rules and by Auth. The
mobile app commits the same values in `lib/firebase_options.dart`, and they ship
in the browser bundle regardless.

Values were read from the live projects with `firebase apps:sdkconfig WEB`, not
copied from documentation. Each project has exactly one web app.

**Server credentials are never baked in** — those are real secrets and stay in
the environment.

## Vercel setup

```
NEXT_PUBLIC_FIREBASE_ENV      prod

FIREBASE_CLIENT_EMAIL_PROD    firebase-adminsdk-…@operator-calling.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_PROD     its private key

FIREBASE_CLIENT_EMAIL_DEV     firebase-adminsdk-…@webrtc-clone-dc88c.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_DEV      its private key
```

With both pairs present, flipping `NEXT_PUBLIC_FIREBASE_ENV` moves the server
with the client. Set Preview/Development to `dev` and Production to `prod` to get
the app's dev/prod split.

The unsuffixed `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` still work as a
fallback, so a deployment that has only ever set those keeps running — but it
will then use the same service account whichever env is selected, which is a
mismatch as soon as you switch. `lib/firebase-admin.ts` logs a named warning when
the service account does not belong to the selected project.

Email and key are always resolved as a pair. If only one half of a scoped pair is
set, both are ignored and the fallback is used, so one project's email can never
be combined with another's key.

### One side effect

`WAITLIST_HASH_SALT` defaults to the resolved Firebase private key, so switching
project changes the visitor-IP hashes. That resets unique-visit dedupe and
rate-limit buckets. Duplicate-signup detection is unaffected — it uses an
unsalted hash, deliberately. Set `WAITLIST_HASH_SALT` explicitly to keep the
buckets stable across a switch.

## What does *not* follow the switch

**Accounts.** Firebase Auth users are per-project. Someone with an account in
`operator-calling` has no account in `webrtc-clone-dc88c`, and vice versa. A
switch is a switch of the whole identity plane, not just the data.

**Cloud Functions.** `SuperAdminDashboard` derives its function URL from the
selected project, so it will call
`https://us-central1-<project>.cloudfunctions.net/sendFcmMessage`. That function
has to be deployed in whichever project you select; it lives in the app repo.

**Firestore rules.** Owned by the app repo and applied manually — this repo never
modifies them. See [`firestore-rules.md`](./firestore-rules.md).

## Permissions parity, measured

Anonymous reads against both live projects, to confirm a switch does not change
what the browser is allowed to do:

| Collection | `operator-calling` | `webrtc-clone-dc88c` |
|---|---|---|
| `memberships` | denied | denied |
| `schedules` | denied | denied |
| `callbacks` | denied | denied |
| `notifications` | denied | denied |
| `groups` | denied | denied |
| `interests` | denied | denied |
| `invites` | denied | denied |
| `reports` | denied | denied |
| `scheduledGroupCalls` | denied | denied |
| `user` | **allowed** | **allowed** |

Identical in both. The rules gap that `firestore-rules.md` describes —
`memberships`, `schedules`, `callbacks` and `notifications` having no `match`
block, so the ordinary dashboard cannot read them — is present in **both**
projects equally. Switching neither causes it nor fixes it.

`user` being world-readable is deliberate and documented: `hooks/useAuth.ts` has
to resolve a profile before any session context exists.
