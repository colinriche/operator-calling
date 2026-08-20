# One Firebase project for the website

**Goal:** the website uses `operator-calling` for everything — Auth, admin
authority, users, groups, memberships, schedules, waitlist/outreach data and
every API route.

**Status of the code: done.** The multi-project machinery is gone. There is one
client config (`lib/firebase.ts`) and one Admin SDK app (`lib/firebase-admin.ts`),
and the server takes its project id from the *same* variable the browser reads,
so the two can no longer drift apart.

**Status of production: done, 2026-08-19.** Vercel production runs on
`operator-calling` — verified by an admin sign-in whose ID token resolved
server-side, and by `/admin/*` reading live data. No `webrtc-clone-dc88c`
credential remains in the Vercel project.

The last step took two attempts, and the second failure looked nothing like a
configuration problem — see [Failure modes](#failure-modes-seen-in-practice)
before debugging anything here.

## What is in Vercel now

Variable **names** below were read with
`npx vercel env ls --project operator-calling` on 2026-08-20. Values are marked
Sensitive, so Vercel will not return them to anyone — including the person who
set them. The notes on what each *contains* are Colin's report, not something
this repo can verify.

**Production is the only configured environment.** Everything unused was deleted
on 2026-08-20. Four variables remain, all scoped to Production, all of them read:

| Variable | Contains |
|---|---|
| `FIREBASE_CLIENT_EMAIL_PROD` | the `operator-calling` service account |
| `FIREBASE_PRIVATE_KEY_PROD` | its private key |
| `NEXT_PUBLIC_FIREBASE_ENV` | `prod` |
| `ADMIN_LOGIN_ENABLED` | gates `POST /api/admin/token` |

Nothing else is set. In particular there is deliberately **no fallback pair**:
the unsuffixed `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` that
`adminCredentials()` falls back to are gone, as are the `*_STAGING` leftovers and
the six `NEXT_PUBLIC_FIREBASE_*` values (inert unless
`NEXT_PUBLIC_FIREBASE_ENV=custom`).

What follows from that:

- **Preview and Development deployments have no Firebase credentials.** Server
  routes there throw `[firebase-admin] Cannot initialize Firebase — missing
  environment variable(s): FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY` and
  return 500. This is intended, not breakage: production is the test environment
  (nothing is verified on a preview), and a preview sharing production
  credentials would read and write live data. Restoring previews means adding
  the `_PROD` pair to the Preview scope — and accepting exactly that.
- **`NEXT_PUBLIC_FIREBASE_ENV=prod` is redundant but kept.** `prod` is already
  the default when the variable is unset. It is set explicitly so the intent is
  visible in the dashboard rather than implied by a code default.
- **There is no `_DEV` pair.** Selecting `dev` would load the
  `webrtc-clone-dc88c` client config and find no credentials at all. Add
  `FIREBASE_CLIENT_EMAIL_DEV` / `FIREBASE_PRIVATE_KEY_DEV` first.

The service account must belong to the same project as the resolved config.
`lib/firebase-admin.ts` logs a named warning when it sees a mismatch.

One side effect worth knowing: `WAITLIST_HASH_SALT` defaults to the private key,
so changing that key changes the visitor-IP hashes and resets unique-visit
dedupe and rate-limit buckets. If the key was replaced rather than re-pasted on
2026-08-19, those buckets restarted then. Duplicate-signup detection is
unaffected — it uses an unsalted hash, deliberately. Set `WAITLIST_HASH_SALT`
explicitly to make future key rotations harmless.

## Failure modes seen in practice

Both produced **HTTP 403 "Admin role required" on every `/api/admin/*` route**,
with the admin visibly signed in. Neither was an authorisation problem, and
neither is diagnosable from the browser — the server log names the cause:

```
npx vercel logs https://operatorcalling.com --project operator-calling --json
```

**1. Malformed private key** (what actually happened, 2026-08-19):

```
[admin-auth] admins lookup failed: 2 UNKNOWN: Getting metadata from plugin
  failed with error: error:1E08010C:DECODER routines::unsupported
[admin-auth] colinriche@gmail.com is not an admin
```

`DECODER routines::unsupported` is OpenSSL refusing the PEM. The Admin SDK
cannot mint an access token, so *every* Firestore read throws, `requireAdmin`
catches it and falls through to the legacy path, and the caller is reported as
not an admin. The second line is a symptom — `admins/{email}` was never read.

The cause was a paste artefact. In the service-account JSON the key appears as
`"private_key": "-----BEGIN PRIVATE KEY-----\n…\n"` — the surrounding quotes are
JSON syntax and must not be copied. `lib/firebase-admin.ts` normalises literal
`\n` escapes, so both the escaped and the real-multiline form work; a stray `"`
does not.

Note what still succeeds in this state: ID-token verification, which needs only
the project id and Google's public certs. That is why the caller's email appears
in the log at all, and it is the tell that the client and server agree on the
project and only the credential is broken.

**2. Credentials from the wrong project.** Reads fail with a permission error
rather than a decoder error, and `lib/firebase-admin.ts` logs that the service
account does not belong to the configured project.

A third, unrelated cause of the same 403 is covered in
[`admin-roles.md`](./admin-roles.md): an email with no `admins/{email}` record.
That one logs `is not an admin` **without** a preceding lookup failure.

## Why it had to be one atomic switch

A Firebase ID token is only valid for the project that issued it —
`verifyIdToken` rejects everything else, and `createCustomToken` is scoped the
same way. The issuer is the client SDK, which has one config for the whole site.
So the verifier could never move unless the issuer moved, and the same
credentials back every route covering groups, memberships, schedules, invites,
the dashboard and account link/delete. There was no "move admin auth" change —
only one move of the whole identity and data plane.

## What is left behind in `webrtc-clone-dc88c`

Counted directly, no personal data read:

| Collection | Docs | Notes |
|---|---|---|
| `user` | 19 | 8 `role: admin`, 10 `role: user`, 1 none |
| `groups` | 51 | 49 have ≥1 member; 0 have `callsEnabled: true`; only 1 waitlist auto-created |
| `memberships` | 31 | |
| `scheduledGroupCalls` | 75 | through 2026-08-09 |
| `invites` | 372 | **370 written by the mobile app, 2 by the website** |
| `admin_controls` | 1 | the `platform` doc the super-admin dashboard reads |
| `schedules` | 3 | |

**Almost none of it is website data.** The website's entire footprint here is
2 invites and 1 group. The rest is the mobile app's own bulk contact-invite
feature, mostly a single run in February 2026, with nothing after April — which
is consistent with the app having moved to `operator-calling` itself.

Consequences of the switch, in the order they bite:

1. **Ordinary user accounts do not transfer.** Firebase Auth users are
   per-project. Anyone with an email/password account in `webrtc-clone-dc88c`
   has no account in `operator-calling` and must sign up again.
2. **`admin_controls/platform` and `schedules`** must exist in
   `operator-calling` or the super-admin dashboard shows zeroes. It no longer
   *fails* — those reads go through the Admin SDK, which ignores rules.
3. **Admin access already survives**, because authority is keyed by email in
   `admins/{lowercase-email}` in `operator-calling`, not by uid and not by
   whichever project issued the token. `admins/colinriche@gmail.com` was seeded
   2026-08-12. See [`admin-roles.md`](./admin-roles.md).

## Verify after the switch

In this order, because each depends on the last:

1. ✅ Admin sign-in → the session is issued by `operator-calling`. *Confirmed
   2026-08-19: the ID token verified server-side and resolved to the caller's
   email.*
2. ✅ `/admin/outreach` → waitlist and demand data load. *Confirmed 2026-08-20,
   once the private key was re-pasted.*
3. ⬜ `/admin/super` → overview loads (Admin SDK, so rules are not involved).
4. ⬜ `/dashboard` → client-side Firestore reads succeed; this is the one that
   exercises the rules, and where `Missing or insufficient permissions` would
   reappear if anything is missing from the ruleset.
5. ⬜ Public waitlist registration.

Steps 3–5 are still unchecked. Step 4 is the one worth doing deliberately: every
route verified so far goes through the Admin SDK, which ignores Firestore rules
entirely, so nothing yet has tested the ruleset in this project.

What the website needs from the ruleset is recorded in
[`firestore-rules.md`](./firestore-rules.md). Rules are applied by Colin through
the main project's Development branch; this repo never modifies them.
