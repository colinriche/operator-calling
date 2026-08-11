# Moving the production website onto one Firebase project

**Goal:** production uses `operator-calling` for users, permissions, waitlist
data and groups — one coherent project, no split.

**Status:** not done. Waitlist data and group creation already point at
`operator-calling`. Auth and role lookup do not, and moving them is not a code
change — see below.

## What production actually runs today

Established from the deployed bundle at `operatorcalling.com/login`, which
inlines `NEXT_PUBLIC_FIREBASE_*` at build time:

| | |
|---|---|
| Client SDK / auth token issuer | **`webrtc-clone-dc88c`** |
| Admin role lookup (`user` collection) | **`webrtc-clone-dc88c`** |
| Waitlist & demand data | `operator-calling` (as of this change) |
| Auto-created groups | `operator-calling` (as of this change) |

> `.env-production` in this repo says `operator-calling`. **It is not what
> production serves, and Next.js never loads it** — the loaded names are
> `.env`, `.env.local`, `.env.development`, `.env.production` (dots). A file
> called `.env-production` is inert. Treat it as a stale note, not as config.

So `"dev"` in `lib/firebase-admin.ts` genuinely means `webrtc-clone-dc88c` in
production. It is not an alias that happens to resolve to `operator-calling`.

## Why admin auth cannot move on its own

A Firebase ID token is only valid for the project that issued it —
`verifyIdToken` rejects everything else, and `createCustomToken` is scoped the
same way. The issuer is the client SDK in `lib/firebase.ts`, which has one
global config for the whole site.

So the verifier cannot move unless the issuer moves, and the issuer is shared by
every signed-in user. And `getAdminServices()` — the same `"dev"` key — backs
roughly twenty routes covering groups, memberships, schedules, invites, the
dashboard and account link/delete.

**There is therefore no "move admin auth" change.** There is one atomic move of
the website's entire identity and data plane, or nothing.

The move itself is env-only. `PROJECTS.dev` reads its project id and credentials
from environment variables, so pointing production at `operator-calling` means
changing five values in Vercel and redeploying — no code edit:

```
NEXT_PUBLIC_FIREBASE_API_KEY              operator-calling web API key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN          operator-calling.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID           operator-calling
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET       operator-calling.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID  858295006183
NEXT_PUBLIC_FIREBASE_APP_ID               1:858295006183:web:48c3cd6b3e63525b394342
FIREBASE_CLIENT_EMAIL                     operator-calling service account
FIREBASE_PRIVATE_KEY                      its private key
```

`"dev"` and `"staging"` then resolve to the same project. That is harmless —
`verifyIdTokenAnyProject` would try one project twice — and the code can be
tidied afterwards rather than as a prerequisite.

## What the move would cost

What currently lives in `webrtc-clone-dc88c` and would stop being visible to
the website. Counted directly, no personal data read:

| Collection | Docs | Written by | Notes |
|---|---|---|---|
| `user` | 19 | both | 8 `role: admin`, 10 `role: user`, 1 none |
| `groups` | 51 | mostly the app | 49 have ≥1 member; 0 have `callsEnabled: true`; only **1** is waitlist auto-created (Aug 2026). Created Dec 2025 → Aug 2026 |
| `memberships` | 31 | | |
| `scheduledGroupCalls` | 75 | | through 2026-08-09 |
| `invites` | 372 | **370 the app, 2 the website** | see below |
| `admin_controls` | 1 | website | `platform` doc the super-admin dashboard reads |
| `schedules` | 3 | | |

**Almost none of this is website data.** Checked by document shape:

- **370 of the 372 invites came from the mobile app**, not from here. The
  website's only phone-invite writer (`app/api/invite/process/route.ts:136`)
  always stamps `method: "web_signup"` and `via: "sms_link"`. No document in the
  collection has `via` at all, and none has `method: "web_signup"`. What is
  actually there is `bulk_sms` ×310, `sms` ×38, `whatsapp` ×12, `manual` ×10 —
  from 8 senders, 332 of them in **February 2026 alone**, nothing after April.
  That is the app's own bulk contact-invite feature, one big run.
- The **2** website-written invites are from the `GroupAdminDashboard` email
  form (`invitedEmail` + `expiresAt`).
- Of 51 groups, exactly **1** carries waitlist provenance
  (`autoCreatedGroupAt`). The rest predate this feature or came from the app and
  the dashboard seeder.

So "no users, no groups, only test stuff" is right *about the website* — this
repo has written almost nothing here. But `webrtc-clone-dc88c` is not an empty
scratch project either: it is where the **mobile app** kept its invites, groups
and members through early 2026.

That reframes the migration. The website has essentially no data to lose. The
real question is whether anything still reads `webrtc-clone-dc88c` — the app
appears to have moved to `operator-calling` (QR invites are written there), and
its invite writes here stop in April, which is consistent with that. Confirm the
app no longer reads this project and the move becomes low-risk.

## Blockers, in the order they bite

**1. Firestore rules in `operator-calling` — highest risk.**

The site's client SDK reads `user` directly, before it knows who anyone is:

- `hooks/useAuth.ts:79,88,123` — queries by `linkedWebUids`, `linkedWebUid`,
  then `email`
- `components/admin/SuperAdminDashboard.tsx:127` and
  `components/admin/GroupAdminDashboard.tsx:431` — unconstrained
  `getDocs(collection(db, "user"))`

`webrtc-clone-dc88c` permits this with `match /user/{userId} { allow read: if
true; }`. If `operator-calling`'s ruleset is stricter — likely, since it is the
app's ruleset — **sign-in and both admin dashboards break immediately** on
switching. This has to be confirmed, and any change handed over as an additive
block through the main project's Development branch. Do not deploy rules from
here.

**2. Admin role documents must exist in `operator-calling`.**

Admin login (`app/api/admin/token/route.ts`) looks up a `user` doc by
`username`, then `name`, then `email`, and mints a custom token for that
document's id. The lookup is server-side via the Admin SDK, so rules do not
apply to it, and `createCustomToken` does not require a Firebase Auth user to
exist — **only the Firestore `user` document is needed.** That makes admin
access the cheapest thing to recreate.

Since fixed: authority moved to the `admins` collection, keyed by email, in
`operator-calling`. Because that lookup no longer depends on which project
issued the token, **admin access already survives the move** — the record can be
created before the switch. See [`admin-roles.md`](./admin-roles.md).

**3. Ordinary user accounts do not transfer.**

Firebase Auth users are per-project. Anyone signing in with email/password
against `webrtc-clone-dc88c` has no account in `operator-calling`. Only the
custom-token admin path survives without re-provisioning.

**4. `admin_controls/platform` and `schedules`** must exist in
`operator-calling`, or the super-admin dashboard reads fail — it already fails
against the dev rules for a related reason
(see `firestore-rules-waitlist-additions.md`).

## Recommended order

1. Confirm nothing still reads `webrtc-clone-dc88c` — chiefly the mobile app,
   which owns 370 of the 372 invites and most of the 51 groups there. The
   website's own footprint is 2 invites and 1 group, so it has nothing to lose.
2. Read `operator-calling`'s ruleset; answer the `user`-read question above.
3. Create the first `admins/{your.email}` record in `operator-calling` with
   `role: "super_admin"` — see [`admin-roles.md`](./admin-roles.md). Authority is
   now keyed by email in the production project, so it no longer depends on
   which project issued the token, and this step can be done before the switch.
4. Hand over any rules addition; wait for it to reach Staging.
5. Switch the eight Vercel production variables; redeploy.
6. Verify in this order: admin username login → `/admin/outreach` →
   `/admin/super` → public waitlist registration → dashboard sign-in.
7. Tidy the now-redundant `"dev"` / `"staging"` split in
   `lib/firebase-admin.ts`, and delete or correct `.env-production`.

Steps 1–3 are the real work. Step 5 is a five-minute change that is
irreversible only in the sense that anything written to the wrong project
afterwards has to be found and moved.
