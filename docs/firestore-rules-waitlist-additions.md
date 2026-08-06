# Firestore rules — waitlist collections

> **This is an insert for the main project, not a ruleset.** Do not deploy it
> from this repo and do not paste it into the Firebase console.

## Where this goes

Rules are owned by the **main project**, where the **Development branch is the
source of truth**. This snippet has to be committed there and then promoted to
Staging along with everything else. Applying it any other way — console edit,
`firebase deploy` from this repo — gets overwritten by the next promotion and
diverges the source of truth.

Consequence for planning: this cannot ship on the website's deploy timeline. The
website can go live without it (the feature works regardless — see below), but
the collections stay unprotected until the promotion lands.

Note also that the Staging Firebase project holds **live data**. These are new
collections landing in a live project.

## Nothing here is needed for the website to work

Every read and write in this feature goes through the Admin SDK in server
routes, which bypasses security rules entirely. No client — web or app — reads
these collections directly.

So this block is purely defensive: it declines to grant client access to
collections that now exist in a project the mobile app can reach, one of which
(`waitlistEntries`) holds email addresses.

## The block

Goes inside the existing
`service cloud.firestore { match /databases/{database}/documents { … } }`,
alongside the app's current `match` statements:

```
    // ── Waitlist & demand tracking (website) ──────────────────────────────
    // Written only by the Admin SDK from server routes, which bypasses rules
    // entirely. No client — web or app — has any reason to touch these.
    match /groupDemandSources/{doc}        { allow read, write: if false; }
    match /sourceLinks/{doc}               { allow read, write: if false; }
    match /sourceLinks/{doc}/visitors/{v}  { allow read, write: if false; }
    match /waitlistEntries/{doc}           { allow read, write: if false; }
    match /sourceVisits/{doc}              { allow read, write: if false; }
    match /shareEvents/{doc}               { allow read, write: if false; }
    match /rateLimits/{doc}                { allow read, write: if false; }
```

## Read this before assuming it worked

Firestore evaluates **every** `match` block whose path matches the request, and
grants access if **any** `allow` in any of them returns true. Rules are not
first-match-wins, and order on the page means nothing.

The practical consequence: **`allow read, write: if false` cannot take access
away.** It only declines to grant. If another rule already grants access to
these paths, the block above changes nothing at all.

So the block is only sufficient if the staging rules have no wildcard covering
these collections.

## Which situation are you in?

Look at the current staging rules for a recursive wildcard — a `match` whose
path ends in `{document=**}`:

**A. No recursive wildcard** (rules name each collection explicitly)

The block above is all you need. The new collections match nothing else, so
nothing grants access to them. Done.

**B. A recursive wildcard that grants access**, e.g.

```
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
```

Then any signed-in app user can already read `waitlistEntries` — which is the
registration emails — and the block above will not stop them. Fixing this means
**editing that existing rule**, which affects the app, so it is your call rather
than something I should do blind.

The narrowest change is to exclude the new collections from the wildcard by
name. Firestore has no "except" syntax, so the wildcard has to become explicit
about what it covers — which for a shared ruleset usually means replacing

```
    match /{document=**} { allow read, write: if request.auth != null; }
```

with one `match /<collection>/{doc}` per collection the app actually uses.
That is a real change to app behaviour and needs testing against the app, not
just the website.

**C. A recursive wildcard that grants nothing** (e.g. `if false`, or rules in
locked mode)

The block above is redundant but harmless. Add it anyway as documentation of
intent.

## How to check which situation applies

Read the rules file on the main project's Development branch — that is the
source of truth, so it answers the wildcard question without touching anything
live. The Firebase console for the **operator-calling** project shows what is
currently promoted, which is useful for confirming the two agree, but is not
where the answer lives.

I did not read the live rules: pulling and regenerating a ruleset shared with
the app is the kind of thing that goes wrong quietly.

## What is at stake

`waitlistEntries` holds email addresses, and `groupDemandSources` holds internal
notes and posting rules. Neither should be readable by an app client. The other
five collections are counters and event logs — lower stakes, but there is no
reason for a client to reach them either.

Until you have confirmed you are in situation A or have made the change for B,
treat registration emails in staging as readable by any signed-in app user.
