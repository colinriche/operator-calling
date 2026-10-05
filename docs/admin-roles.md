# Admin roles - the `admins` collection

## The model

One collection defines who may administer the site. One document per person,
**document id = their email address, lowercased**.

```
admins/{email}
  name       string
  role       "admin" | "super_admin"
  createdAt  timestamp   - written by the API; absent on hand-seeded records
  updatedAt  timestamp
  updatedBy  string      - email of the super_admin who last wrote it
```

Only `name` and `role` are required. A record hand-created in the console with
just those two fields works.

Lives in **`operator-calling`** - the only project the website uses, and the
same one that issues the caller's token - reached through `getAdminDb()` in
`lib/admins.ts`.

### Roles

| | `admin` | `super_admin` |
|---|---|---|
| Outreach, demand sources, waitlist, schedules, groups | ✅ | ✅ |
| View the admin list | ✅ | ✅ |
| Create, edit, remove admins | ❌ | ✅ |
| Edit, archive, delete user accounts | ❌ | ✅ |

Capabilities are functions in `lib/admins.ts` - `canAdminister`,
`canManageAdmins`, `canManageUsers` - so routes ask a question instead of
comparing role strings, and changing a permission is one edit.

### Why a separate collection, keyed by email

Authority used to be a `role` field on the `user` document. Two problems:

1. **`user` is written by many things** - sign-up, the mobile app, account
   linking, the dashboard seeder. A field that grants administrative access
   should be reachable by exactly one code path that demands `super_admin`.
   `admins` is written only by `/api/admin/admins`.
2. **A person is not a uid.** Phone auth mints a fresh Firebase UID, the
   custom-token admin login uses the Firestore document id as the uid, and one
   human can hold several. Their email survives all of it - and it is what
   someone typing into the admin panel actually knows.

Keying by email also decouples authorisation from *which Firebase project*
issued the token, which is what lets admin access survive the move off the dev
project (see `single-project-migration.md`).

Note this normalisation is **not** the same as waitlist duplicate detection:
gmail dots and `+tags` are deliberately **not** stripped. Merging two addresses
somebody believes are distinct would grant access to an address nobody added.

## How a request is authorised

`lib/admin-auth.ts`, two independent steps:

1. **Authentication** - the ID token is verified against every configured
   Firebase project, because a token is only ever valid for its issuer.
2. **Authorisation** - the caller's email is looked up in `admins`.

Resolving the email takes three attempts, because a custom-token session (what
`/api/admin/token` mints) carries no `email` claim of its own: the standard
claim, then a custom claim, then the legacy `user` document at `user/{uid}`.

### Invariants enforced by `/api/admin/admins`

- The **last super_admin cannot be removed or demoted.** Nothing can restore the
  permission afterwards - there is no console flow and no bootstrap route - so
  the collection refuses to empty itself.
- **You cannot demote or delete yourself.** Another super_admin can, if it is
  genuinely intended.

## No fallback: `user.role` grants nothing

The transitional fallback that honoured `role` on the `user` document when `admins` had no record **has been
removed** (2 Oct 2026), from the admin gate and from the admin login. See "`user.role` grants nothing on the
website" below.

## Signing in

There is **no passwordless admin login**. `POST /api/admin/token` (which minted a session from an email address
alone) was removed on 2 Oct 2026 and now answers `410`; `/admin-login` redirects to `/login`. Admins sign in with a
real credential (Google or phone) like everyone else, and the `admins` record for that email (or uid) decides what
they may do. `ADMIN_LOGIN_ENABLED` is no longer read anywhere.

## Firestore rules

`admins` is read and written **only** through the Admin SDK in server routes,
which bypasses rules. No client ever reads it, and no client should be able to -
it is the permission list.

The shared ruleset has no recursive `match /{document=**}`, so a collection with
no match block is already denied to every client by default. **No rule change
required - handled server-side.** See [`firestore-rules.md`](./firestore-rules.md),
which is the single record of what the website needs from the app's ruleset.

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

**Done:** `admins/colinriche@gmail.com` - `role: super_admin` (seeded 2026-08-12; had been changed to an invalid
`user`, set back to `super_admin` on 2 Oct 2026). Authority is keyed by email, so it matches however the session is
established.

### If the collection is unreachable

`requireAdmin` catches a failed `admins` lookup, logs `[admin-auth] admins lookup failed:` and **denies**. There is
no fallback to fall through to, so missing or wrong `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` locks the admin
area until they are fixed (the same variables the rest of the site needs, so this shows up everywhere at once).

## `/admin/super` is super admins only

Every page under `/admin/super` (the Super Admin dashboard, Reports, a user's moderation page) is behind
`components/admin/SuperAdminGate.tsx`, and the sidebar only shows those entries to a `super_admin`. A plain
`admin` who opens the address gets a "Super admins only" page that names the email and role the server found.

The data behind the dashboard is gated on the server too: `/api/admin/overview` and `/api/admin/archive` (GET)
now need `super_admin`, as do the Reports, moderation and deletion-request routes. Hiding a page is never the
protection; the routes are.

## `user.role` grants nothing on the website

Authority comes **only** from the `admins` collection, one document per person named by their email in lowercase
(`lib/admins.ts`). The old transitional fallback, which honoured a `role` on the `user` document, has been removed
from both the admin gate (`lib/admin-auth.ts`) and the admin login (`app/api/admin/token`). The site-side UI that
used to read `profile.role` (the dashboard's Admin link, the group page's super-admin view) now asks the server
through `useAdminRole`.

The mobile app's own `role` on `user` still exists: it is the Flutter operator dashboard's authority and has
nothing to do with this site.

Only a `super_admin` can change the list (`/api/admin/admins`); nothing in a browser can write the collection.
Roles are exactly `admin` or `super_admin`. **Any other value, such as `user`, is treated as no access at all**:
the lookup refuses it rather than guessing.

### "I changed the role in `admins` and it did not take effect" / "I'm a super admin but it says I'm not"

1. The document must be **named by the email this session signed in with, lowercase**. The "Super admins only"
   page and the Reports error both print the email and role the server found: compare it with the document name.
2. `role` must be exactly `super_admin` or `admin`.
3. Reload after changing it; the role is read on each request, so there is nothing to wait for.
