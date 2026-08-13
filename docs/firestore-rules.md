# Firestore rules — what the website needs

## Ownership

The **main Operator app project owns the shared Firestore ruleset.** The website
uses one Firebase project, `operator-calling`, so there is exactly one ruleset
to reason about — the one applied there.

**This repo never modifies those rules.** It does not deploy them, does not hold
them in version control, and does not reach into the app codebase. Its job is to
state what the website requires and why. Colin applies any change manually in
Firebase, through the main project's route.

That constraint shapes the design rather than fighting it: **when admin-only
data can be read through a Next.js route with the Admin SDK, it should be.**
The Admin SDK bypasses rules entirely, so those paths need no rules at all — and
the check that guards them (`requireAdmin`) is the website's own, versioned here,
testable here, and not shared with the app.

## Two separate systems — don't confuse them

| | Website server-side authorisation | Firestore client security rules |
|---|---|---|
| Where | `lib/admin-auth.ts`, `lib/admins.ts` | The app's shared ruleset |
| Authority | `admins/{lowercase-email}` in `operator-calling` | `request.auth`, document contents |
| Applies to | Every `/api/**` route | Every browser/app SDK read and write |
| Owned by | This repo | The main app |

The website's admin hierarchy lives **entirely** in the first column. Rules know
nothing about `super_admin`, and do not need to.

### The hierarchy

| | site `admin` | `super_admin` | group admin |
|---|---|---|---|
| Website admin areas | ✅ | ✅ | own group only |
| Waitlist / outreach / demand | ✅ | ✅ | ❌ |
| View site admins | ✅ | ✅ | ❌ |
| Create / remove site admins | ❌ | ✅ | ❌ |
| Appoint / remove group admins | ✅ | ✅ | ❌ |
| Platform-wide switches | ❌ | ✅ | ❌ |
| Archive / delete user accounts | ❌ | ✅ | ❌ |
| Enable calls for a group | ✅ | ✅ | ✅ own group |

Site roles come from `admins/{email}`. Group-admin authority is
`groups.groupAdminId`, written only by `/api/admin/groups/{id}/admin`, which
also writes the matching `memberships` document so the group shows up in
`GroupAdminDashboard`.

`canAdminister` / `canManageAdmins` / `canManageUsers` in `lib/admins.ts` are the
only place a role string is compared, so `super_admin` is accepted everywhere
`admin` is unless a capability deliberately excludes it.

## Handled server-side — no rule change required

Every one of these goes through the Admin SDK behind `requireAdmin`, so rules do
not apply:

| Area | Route |
|---|---|
| Super-admin overview: users, groups, reports, schedules, platform controls | `/api/admin/overview` |
| Site admin list and CRUD | `/api/admin/admins` |
| Appoint / remove a group admin | `/api/admin/groups/{id}/admin` |
| Enable / disable a group's calls | `/api/groups/{id}/calls` |
| Waitlist, demand sources, source links, registrations, outreach, organisers, global schedule, demand settings, audit | `/api/admin/*` |
| User archive and permanent deletion | `/api/admin/archive` |
| Group create/read/update, members, join requests, schedules | `/api/groups/*` |

**The waitlist and private website collections need no client access at all.**
`groupDemandSources`, `sourceLinks`, `waitlistEntries`, `sourceVisits`,
`shareEvents`, `rateLimits`, `settings` and `admins` are read and written only by
server routes. No browser touches them, and none should — `waitlistEntries` holds
email addresses and `admins` is the permission list itself. Firestore denies a
collection with no `match` block, and the shared ruleset has **no recursive
`match /{document=**}`**, so they are already closed. Nothing to add.

## Still client-side, and genuinely so

These run in the browser against the client SDK, so rules do apply.

| Where | Collections | Verdict |
|---|---|---|
| `hooks/useAuth.ts` | `user` — by `linkedWebUids`, `linkedWebUid`, uid, `email` | Must stay. Runs before any session context exists. Already allowed (`allow read: if true`) |
| `hooks/useDashboardData.ts` | `schedules`, `callbacks`, `notifications`, `memberships` | Ordinary user's own data. **Rules needed** |
| `components/admin/GroupAdminDashboard.tsx` | `memberships`, `groups`, `user`, `invites`, `schedules`, `reports`, `scheduledGroupCalls` | Mostly allowed; **`memberships` and `schedules` need rules** |
| `components/public/PublicGroupsBrowser.tsx` | `groups` where `isPrivate == false`, `interests` | Currently denied for signed-out visitors — see optional section |
| Auth forms (`AuthForm`, `LoginTabs`, `PhoneAuthForm`), `ProfileEditor` | own `user` document | Already allowed |

The four collections that need rules — `memberships`, `schedules`, `callbacks`,
`notifications` — have **no `match` block at all** in the shared ruleset, so
every read is denied by default. This is why the ordinary dashboard is as broken
as `/admin/super` was, for the same underlying reason.

## Better moved behind an API route than granted rules

- **`lib/dashboardSeed.ts`** — a client batch write to `user`, `groups`,
  `memberships`, `schedules`, `callbacks`, `notifications`, `invites`, `reports`
  and `admin_controls`, triggered by the "Seed dashboard data" button. Granting a
  browser write access to nine collections to support a test fixture is the wrong
  trade. Move it to `/api/admin/seed` behind `requireAdmin`. Until then it will
  fail on the collections above.
- **`SuperAdminDashboard`'s three remaining writes** — `user.role`, `user.banned`,
  `reports.status`. They work today only because the `user` rule lets any signed-in
  user write `role` and `banned`, which is far too generous. `canManageUsers` is
  `super_admin`-only, and a browser write cannot enforce that. Move to
  `/api/admin/users`.
- **`GroupAdminDashboard`'s group-wide reads** — workable with the rules below,
  but the whole component would be simpler and safer behind
  `/api/admin/group/{id}` with the group-admin check server-side.

None of these are done yet; they are recorded here so the choice is deliberate.

## Rules that reject `super_admin`

```
function isAdmin() {
  return isSignedIn() && … get(…/user/$(request.auth.uid)).data.role == 'admin';
}
```

An exact string compare, so a `role: "super_admin"` user document fails it. It
guards `groups` reads for the app's operator dashboard.

**The website no longer depends on it.** `SuperAdminDashboard` reads groups
server-side now, and a group admin reads their own group through
`request.auth.uid in resource.data.memberIds` — `/api/admin/groups/{id}/admin`
adds them to `memberIds` when appointing them, precisely so this works. The fix
below is for the app's benefit and for consistency, not to unblock the website.

Note also that this rule is the last trace of the old `user.role` model. Website
authority is `admins/{email}`; `user.role` grants nothing on the website except
through the transitional fallback described in
[`admin-roles.md`](./admin-roles.md).

## The legacy fallback — can it go?

`requireAdmin` still honours `role` on the legacy `user` document when `admins`
has no record for that email. `admins/colinriche@gmail.com` now exists with
`role: super_admin`, so the fallback is no longer load-bearing.

**It can be removed** once you have signed in and confirmed nothing logs
`[admin-auth] LEGACY ROLE USED`. Leaving it in means any `role: admin` user
document in `operator-calling` still grants website admin access — which is the
exact weakness `admins` was introduced to close. Delete `legacyRole` and its call
site in `lib/admin-auth.ts` when you are ready; say the word.

---

# Manual Firestore rules changes

Copy into the shared ruleset, inside `match /databases/{database}/documents`.

## Rules required for `super_admin`

**None. No rule change required — handled server-side.**

Every site-admin and super-admin operation runs through the Admin SDK behind
`requireAdmin`, which bypasses rules. Authority is `admins/{email}`, read by a
server route. The rules below exist for *other* website functionality and are
not a precondition for `super_admin` working.

## Rules required for other client-side website functionality

Four collections have no `match` block, so every client read is denied. These
serve the group-admin dashboard and the ordinary user dashboard. Read-only —
every write stays server-side.

**GroupAdminDashboard** needs `memberships` (its own, then group-wide) and
`schedules` (by `groupId`). Its other reads — `groups`, `user`, `invites`,
`reports`, `scheduledGroupCalls` — are already permitted.

**Ordinary user dashboard** (`useDashboardData`) needs `schedules`, `callbacks`,
`notifications` and `memberships`, all scoped to the signed-in uid.

> **No client write on `memberships`.** An earlier draft here proposed
> `allow update` for a group admin, guarded only by an unchanged `groupId`. That
> is too broad: `memberships.role` is authority, and a browser-side rule cannot
> constrain which fields or which values without becoming a second, divergent
> copy of the permission model. `GroupAdminDashboard`'s two membership writes —
> change role, ban member — belong on a server route that checks
> `groups.groupAdminId` and validates the target role. `/api/groups/{id}/members/{uid}`
> is the natural home but does not cover it yet: it authorises on `createdBy`,
> not `groupAdminId`, and writes `groups.members.{uid}` rather than the
> `memberships` collection. Until it is extended, those two buttons will fail —
> deliberately, rather than by opening the collection.

```
    // ── Website: group-admin authority ───────────────────────────────────────
    // groups.groupAdminId is the appointed admin, written only by the website's
    // /api/admin/groups/{id}/admin route. exists() first so a document without a
    // groupId cannot error the rule.
    function isGroupAdminOf(groupId) {
      return isSignedIn() &&
             groupId is string && groupId != '' &&
             exists(/databases/$(database)/documents/groups/$(groupId)) &&
             get(/databases/$(database)/documents/groups/$(groupId)).data.groupAdminId == request.auth.uid;
    }

    // ── Memberships ──────────────────────────────────────────────────────────
    // Read: your own, or every membership of a group you administer.
    // Update: a group admin changing role/status within their own group.
    // Create and delete stay server-side.
    match /memberships/{docId} {
      allow read: if isSignedIn() && (
        resource.data.userId == request.auth.uid ||
        isGroupAdminOf(resource.data.groupId)
      );
      allow write: if false;
    }

    // ── Schedules ────────────────────────────────────────────────────────────
    // Read-only from a client; all writes go through the website's API routes.
    match /schedules/{docId} {
      allow read: if isSignedIn() && (
        resource.data.get('initiatorId', '') == request.auth.uid ||
        resource.data.get('recipientId', '') == request.auth.uid ||
        isGroupAdminOf(resource.data.get('groupId', ''))
      );
      allow write: if false;
    }

    // ── Callbacks & notifications ────────────────────────────────────────────
    // Your own only. Written by the app and by server routes, never the browser.
    match /callbacks/{docId} {
      allow read: if isSignedIn() && resource.data.targetId == request.auth.uid;
      allow write: if false;
    }

    match /notifications/{docId} {
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow write: if false;
    }
```

## Optional — only if the public `/groups` page should list groups

`PublicGroupsBrowser` queries `groups where isPrivate == false` and reads
`interests`, for signed-out visitors. Both are denied today, and the component
swallows the error, so the page shows a permanently empty state. It is a public
marketing page, so this makes those two reads public. Skip it if you would rather
that page came from a server route.

```
    // In the existing `match /groups/{groupId}` block, replace allow read with:
      allow read: if resource.data.get('isPrivate', true) == false ||
                     (isSignedIn() &&
                      (request.auth.uid in resource.data.memberIds || isAdmin()));

    // In the existing `match /interests/{docId}` block, replace allow read with:
      allow read: if true;
```

## Optional — let the app's `isAdmin()` accept `super_admin`

Not needed by the website. Include it so the app's operator dashboard does not
reject a `super_admin`.

```
    // In the existing isAdmin() helper, replace the final comparison with:
      get(/databases/$(database)/documents/user/$(request.auth.uid)).data.role in ['admin', 'super_admin'];
```

## Everything else

**No rule change required — handled server-side.** Waitlist, demand sources,
source links, outreach, organisers, global schedule, the `admins` collection,
`admin_controls`, `Archive`, group creation and membership management, group
call enablement, and the whole super-admin overview all run through the Admin
SDK behind `requireAdmin`, which bypasses rules.
