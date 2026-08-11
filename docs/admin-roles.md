# Admin roles — the `admins` collection

## The model

One collection defines who may administer the site. One document per person,
**document id = their email address, lowercased**.

```
admins/{email}
  name       string
  role       "admin" | "super_admin"
  createdAt  timestamp   — written by the API; absent on hand-seeded records
  updatedAt  timestamp
  updatedBy  string      — email of the super_admin who last wrote it
```

Only `name` and `role` are required. A record hand-created in the console with
just those two fields works.

Lives in **`operator-calling`** — the production data project — reached through
`getProjectDb("staging")` in `lib/admins.ts`.

### Roles

| | `admin` | `super_admin` |
|---|---|---|
| Outreach, demand sources, waitlist, schedules, groups | ✅ | ✅ |
| View the admin list | ✅ | ✅ |
| Create, edit, remove admins | ❌ | ✅ |
| Edit, archive, delete user accounts | ❌ | ✅ |

Capabilities are functions in `lib/admins.ts` — `canAdminister`,
`canManageAdmins`, `canManageUsers` — so routes ask a question instead of
comparing role strings, and changing a permission is one edit.

### Why a separate collection, keyed by email

Authority used to be a `role` field on the `user` document. Two problems:

1. **`user` is written by many things** — sign-up, the mobile app, account
   linking, the dashboard seeder. A field that grants administrative access
   should be reachable by exactly one code path that demands `super_admin`.
   `admins` is written only by `/api/admin/admins`.
2. **A person is not a uid.** Phone auth mints a fresh Firebase UID, the
   custom-token admin login uses the Firestore document id as the uid, and one
   human can hold several. Their email survives all of it — and it is what
   someone typing into the admin panel actually knows.

Keying by email also decouples authorisation from *which Firebase project*
issued the token, which is what lets admin access survive the move off the dev
project (see `single-project-migration.md`).

Note this normalisation is **not** the same as waitlist duplicate detection:
gmail dots and `+tags` are deliberately **not** stripped. Merging two addresses
somebody believes are distinct would grant access to an address nobody added.

## How a request is authorised

`lib/admin-auth.ts`, two independent steps:

1. **Authentication** — the ID token is verified against every configured
   Firebase project, because a token is only ever valid for its issuer.
2. **Authorisation** — the caller's email is looked up in `admins`.

Resolving the email takes three attempts, because a custom-token session (what
`/api/admin/token` mints) carries no `email` claim of its own: the standard
claim, then a custom claim, then the legacy `user` document at `user/{uid}`.

### Invariants enforced by `/api/admin/admins`

- The **last super_admin cannot be removed or demoted.** Nothing can restore the
  permission afterwards — there is no console flow and no bootstrap route — so
  the collection refuses to empty itself.
- **You cannot demote or delete yourself.** Another super_admin can, if it is
  genuinely intended.

## ⚠️ Transitional fallback — remove this

`requireAdmin` still honours `role` on the legacy `user` document **when
`admins` has no record for that email**. Every use logs:

```
[admin-auth] LEGACY ROLE USED for <email> (role=…) — add this address to the
"admins" collection, then remove the fallback
```

It exists so deploying this change cannot lock every administrator out before
the collection is populated. **Until it is removed, a `user` document with
`role: "admin"` still grants access — which is the exact weakness `admins` was
introduced to close.** There are 8 such documents in `webrtc-clone-dc88c`.

To remove it: populate `admins`, confirm nothing logs the warning, then delete
`legacyRole` and its call site in `lib/admin-auth.ts`.

## Signing in

`POST /api/admin/token` takes an **email**, looks it up in `admins`, and returns
a Firebase custom token for it. Both `admin` and `super_admin` are accepted —
the route previously rejected `super_admin`, which would have locked out the
highest role.

The token is minted by the **default** admin app, whose project id comes from
`NEXT_PUBLIC_FIREBASE_PROJECT_ID` — necessarily the same project the browser's
client SDK uses, because `signInWithCustomToken` rejects a token issued by any
other project. Both sides read the same variable, so this stays correct after
the project move.

It carries `email`, `role` and `name` as custom claims. That matters: a
custom-token session has no `email` claim of its own, and authorisation is keyed
by email, so without them the session would authenticate and then fail every
permission check.

### ⚠️ There is no credential check

Submitting an address that appears in `admins` returns a working admin session.
No password, no code, no second factor. **Anyone who knows or guesses an
administrator's email address can become that administrator**, and email
addresses are guessable by design.

This is an accepted trade-off, not an oversight — requiring a real Firebase Auth
sign-in was considered and declined. Two things narrow the window, neither of
which makes it safe:

- `ADMIN_LOGIN_ENABLED` must be `"true"`. Setting it to anything else disables
  the route outright, and is the fastest way to close this.
- Attempts are rate limited to 5 per 15 minutes per IP, so the address space
  cannot be walked quickly. **A targeted guess still succeeds first time.**

If revisited: stop minting sessions here, have admins sign in with a real
credential, and keep `admins` purely for authorisation. Nothing about the
collection or the capability model would need to change.

## Firestore rules

`admins` is read and written **only** through the Admin SDK in server routes,
which bypasses rules. No client ever reads it, and no client should be able to —
it is the permission list.

Provided `operator-calling`'s ruleset has no recursive `match /{document=**}`,
a collection with no match block is already denied to every client by default
and nothing needs adding. If it does have one, this is required, not optional:

```
    // ── Administrative authority (website) ────────────────────────────────
    // Server-only. A client that can read this learns who to target; a client
    // that can write it grants itself access.
    match /admins/{email} { allow read, write: if false; }
```

Same caveat as elsewhere: `allow … if false` cannot take away access another
rule grants. Against a permissive wildcard the wildcard itself has to narrow.
Rules travel through the main project's Development branch — not the console,
not this repo.

## Seeding the first super_admin

Chicken-and-egg: only a super_admin can create admins. So the first one is
created by hand in the Firebase console, in `operator-calling`:

```
Collection: admins
Document id: your.email@example.com      ← lowercase
  name: "Your Name"
  role: "super_admin"
```

Use the address the account you sign in with actually carries, or the lookup
will not match.
