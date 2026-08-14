# One Firebase project for the website

**Goal:** the website uses `operator-calling` for everything — Auth, admin
authority, users, groups, memberships, schedules, waitlist/outreach data and
every API route.

**Status of the code: done.** The multi-project machinery is gone. There is one
client config (`lib/firebase.ts`) and one Admin SDK app (`lib/firebase-admin.ts`),
and the server takes its project id from the *same* variable the browser reads,
so the two can no longer drift apart.

**Status of production: pending a Vercel change.** The project is chosen by
environment variables, and Vercel production still holds the
`webrtc-clone-dc88c` values. Until they are changed the site keeps running on
the old project — the code change alone does not move it.

## What has to change in Vercel

> **Superseded.** The six `NEXT_PUBLIC_FIREBASE_*` variables below are no longer
> how the project is chosen. The client config for both projects is now baked
> into `lib/firebase-env.ts` and selected with one variable —
> `NEXT_PUBLIC_FIREBASE_ENV`, defaulting to `prod` — so an unconfigured
> deployment already lands on `operator-calling`. See
> [`firebase-environments.md`](./firebase-environments.md) for the current
> setup, which is shorter than this.
>
> Two corrections worth recording, since this list was followed by hand:
>
> - The app id here, `1:858295006183:web:48c3cd6b3e63525b394342`, **does not
>   exist**. `operator-calling` has exactly one web app and its id is
>   `1:858295006183:web:b4e7c6e6a59f5109394342` (confirmed with
>   `firebase apps:sdkconfig WEB`). Anything set from this line was wrong.
> - `prod` and `dev` now ignore these variables entirely, so a stale value left
>   behind in Vercel is inert rather than silently overriding half the config.

Production, Preview and Development, then redeploy:

```
NEXT_PUBLIC_FIREBASE_API_KEY              AIzaSyC_R2854WYyC5pYG7kvi_V6fN4qBemaiFI
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN          operator-calling.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID           operator-calling
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET       operator-calling.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID  858295006183
NEXT_PUBLIC_FIREBASE_APP_ID               1:858295006183:web:b4e7c6e6a59f5109394342
FIREBASE_CLIENT_EMAIL                     the operator-calling service account
FIREBASE_PRIVATE_KEY                      its private key
```

`FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` currently hold the
`webrtc-clone-dc88c` service account. The `operator-calling` service account is
already in Vercel under `FIREBASE_CLIENT_EMAIL_STAGING` /
`FIREBASE_PRIVATE_KEY_STAGING` — copy those two values across.

Then delete `FIREBASE_PROJECT_ID_STAGING`, `FIREBASE_CLIENT_EMAIL_STAGING` and
`FIREBASE_PRIVATE_KEY_STAGING`. Nothing reads them any more.

The service account must belong to the same project as
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`. A mismatch is the failure mode that produced
the original mess — valid sign-ins that fail to verify, admin lookups that find
nothing — so `lib/firebase-admin.ts` now logs a named warning when it sees one.

One side effect worth knowing: `WAITLIST_HASH_SALT` defaults to
`FIREBASE_PRIVATE_KEY`, so changing the key changes the visitor-IP hashes.
That resets unique-visit dedupe and rate-limit buckets. Duplicate-signup
detection is unaffected — it uses an unsalted hash, deliberately. Set
`WAITLIST_HASH_SALT` explicitly if you want to keep the old buckets.

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

1. Admin sign-in → the session is issued by `operator-calling`.
2. `/admin/outreach` → waitlist and demand data load.
3. `/admin/super` → overview loads (Admin SDK, so rules are not involved).
4. `/dashboard` → client-side Firestore reads succeed; this is the one that
   exercises the rules, and where `Missing or insufficient permissions` would
   reappear if anything is missing from the ruleset.
5. Public waitlist registration.

What the website needs from the ruleset is recorded in
[`firestore-rules.md`](./firestore-rules.md). Rules are applied by Colin through
the main project's Development branch; this repo never modifies them.
