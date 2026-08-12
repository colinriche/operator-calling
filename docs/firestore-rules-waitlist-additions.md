# Firestore rules — waitlist collections

> **The data moved.** These collections now live in **`operator-calling`**
> (the "staging" project), not `webrtc-clone-dc88c`. The analysis below was
> carried out against the **dev** ruleset and its conclusion has **not** been
> re-verified against operator-calling. The reasoning transfers; the fact does
> not, because it depends on what that ruleset actually contains.

## One question decides it

**Does the `operator-calling` ruleset contain a `match /{document=**}` that
grants read?**

- **No** → nothing to do. Skip to the end of this section.
- **Yes** → `waitlistEntries` is client-readable and holds email addresses.
  That wildcard has to narrow; adding the block below will not help (see why).

The reasoning, which holds in either project:

1. **Nothing reads them from a client.** Every read and write in this feature
   goes through the Admin SDK in server routes, which bypasses security rules
   entirely.
2. **A collection with no `match` block is already closed.** Firestore denies
   by default. So as long as there is no recursive wildcard, `groupDemandSources`,
   `sourceLinks`, `waitlistEntries`, `sourceVisits`, `shareEvents`, `rateLimits`
   and `globalSchedules` are unreachable from any client without a single line
   being written.

That was true of the dev ruleset, checked directly. Whether it is true of
operator-calling is the open item.

## The block, if one is ever needed

Add this **only** if the wildcard question above comes back yes — and note it
may not achieve anything on its own:

```
    // ── Waitlist & demand tracking (website) ──────────────────────────────
    // Written only by the Admin SDK from server routes. No client needs these.
    match /groupDemandSources/{doc}        { allow read, write: if false; }
    match /sourceLinks/{doc}               { allow read, write: if false; }
    match /sourceLinks/{doc}/visitors/{v}  { allow read, write: if false; }
    match /waitlistEntries/{doc}           { allow read, write: if false; }
    match /sourceVisits/{doc}              { allow read, write: if false; }
    match /shareEvents/{doc}               { allow read, write: if false; }
    match /rateLimits/{doc}                { allow read, write: if false; }
    match /globalSchedules/{doc}           { allow read, write: if false; }
```

Firestore evaluates **every** matching block and grants if **any** `allow`
returns true. Order means nothing, and `allow read, write: if false` declines to
grant — it **cannot take away** access another rule grants. Against a permissive
wildcard this block does nothing; the wildcard itself has to narrow.

Rules are owned by the **main project's Development branch** and promoted to
Staging, so any such change travels that route — not the console, not this repo.

## Separate finding: the admin dashboard was broken by these rules — fixed

Not a waitlist issue, but it surfaced while diagnosing one, and it was why
`/admin/super` showed a permissions error.

`SuperAdminDashboard` ran five client-SDK reads in a single `Promise.all`.
Three were denied:

| Read | Why it failed |
|---|---|
| `getDocs(collection(db, "schedules"))` | No `schedules` match block exists — default deny |
| `getDoc(doc(db, "admin_controls", "platform"))` | No `admin_controls` match block exists — default deny (the write too) |
| `getDocs(collection(db, "groups"))` | Rule is `uid in resource.data.memberIds \|\| isAdmin()`. Firestore rejects an unconstrained collection query it cannot prove is satisfiable for every document. `isAdmin()` also tests `role == 'admin'` **exactly**, so a `super_admin` failed it |

One rejection failed the whole `Promise.all`, so the dashboard loaded no data
and toasted "Missing or insufficient permissions".

**Resolved by moving the reads server-side**, not by changing rules —
`app/api/admin/overview/route.ts`, behind `requireAdmin`. The Admin SDK bypasses
rules, and this is the better boundary anyway: the dashboard's data is admin-only,
so it should be gated by the admin check rather than by whatever the shared app
ruleset happens to permit. The platform-control write moved with it (super_admin
only). Nothing here needs a rules change, which matters because that ruleset is
the app's and travels through the main project's Development branch.

`/admin/outreach` deliberately does not depend on any of this.

## Note: the `user` collection is world-readable

`match /user/{userId} { allow read: if true; }` — deliberate, and the inline
comment explains why (admin username login queries the collection before any
Firebase Auth session exists). It does mean every user document, including email
addresses, is readable by anyone who can reach the project.

Out of scope for the waitlist work, but worth recording as a known exposure
rather than leaving it implicit — particularly since it makes `waitlistEntries`
the *better*-protected of the two places this site stores email addresses.
