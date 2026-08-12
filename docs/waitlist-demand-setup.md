# Waitlist & demand tracking — setup

> **Behaviour here is partly superseded.** See
> [`waitlist-community-and-tester-spec.md`](./waitlist-community-and-tester-spec.md)
> for the current model: community interest plus an early access tester
> programme, auto-created community groups with review after the fact, time
> zones, and manage links. This document remains accurate for implementation
> detail — project routing, collections, thresholds, rules and indexes.

Stage 1 of the outreach / group-demand system. Covers the tracked link →
public waitlist page → registration → attribution → counters path, plus the
admin panel for creating sources and copying links.

Access: `admin` and `super_admin` both reach the Outreach tab and everything
behind it, including registration emails.

## Where the data lives

Everything is in the **staging** Firebase project (`operator-calling`), reached
through `getProjectDb("staging")` — the project the mobile app reads, so demand
sources and registrations sit alongside the groups they eventually become.

`waitlistDb()` in `lib/waitlist/server.ts` is the single line that decides this.

> **Moved from dev.** This started in `webrtc-clone-dc88c` so the flow could be
> exercised without touching the live-data project, and moved once it had been.
> Nothing was migrated — the dev collections held test data only, so the dev
> copies are stale and should be ignored rather than consulted.

Group creation moved with it. `GROUP_TARGET_PROJECT` in
`lib/waitlist/group-linking.ts` is now `"staging"` too, so a source reaching its
threshold creates its group in `operator-calling`, where the mobile app can
actually see it — a demand source and the group it becomes stay in one project.
Each source records `groupProject` alongside `groupId`, so sources linked either
side of the switch remain unambiguous.

Auto-created groups are still written `callsEnabled: false` with their schedules
`paused`. Visible to the app is not the same as calling anybody — see
[`calls-enabled-dispatch-guard.md`](./calls-enabled-dispatch-guard.md).

One thing did **not** move: the admin role check in `lib/admin-auth.ts` uses the
`"dev"` project key, because that is where web sign-in and the `user` role
documents live. Routes needing both a role check and waitlist data ask for each
project explicitly.

> **Confirmed: they are different projects in production.** The `"dev"` key
> resolves from `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, and the deployed bundle at
> `operatorcalling.com/login` inlines `webrtc-clone-dc88c` — so production auth,
> sign-in and role lookup run on the dev project while waitlist data and groups
> run on `operator-calling`. Ignore `.env-production`, which claims otherwise and
> is not loaded by Next.js at all.
>
> Closing that split is a single env-var switch plus real prerequisites (rules,
> role documents, 19 users / 51 groups left behind). See
> [`single-project-migration.md`](./single-project-migration.md).

Collections created (all in `operator-calling`):

| Collection | Holds |
|---|---|
| `groupDemandSources` | A possible future calling group: audience, public label, notes, counters |
| `sourceLinks` | Tracked links (`sourceCode`), one per post/comment/message |
| `sourceLinks/{id}/visitors/{hash}` | Unique-visit markers — a hashed IP and a timestamp, nothing else |
| `waitlistEntries` | Registrations, keyed `{demandSourceId}__{hash(email)}` |
| `sourceVisits` | Append-only visit events for per-post reporting |
| `shareEvents` | Share-button clicks by channel |
| `rateLimits` | Fixed-window counters for the public endpoints |
| `settings/waitlistDemand` | Optional global threshold override |

No Operator group is created by any of this. `groupDemandSources.groupId` stays
`null` until a person reviews the demand and links or creates a group — that is
stage 2.

## Firestore security rules

**Probably none needed — but the check was done against the wrong project and
has not been redone.** Every read and write goes through the Admin SDK, which
bypasses rules entirely, so the only thing rules decide here is whether a
*client* could reach these collections directly. In the dev ruleset the answer
was no, because there is no recursive `match /{document=**}` and an unmatched
collection is denied by default.

That still needs confirming for `operator-calling`, where the data now lives.
One question decides it: **does the operator-calling ruleset contain a
`match /{document=**}` that grants read?** It does not — checked against the
shared ruleset — so `waitlistEntries` and every other waitlist collection is
already denied to clients by default. **No rule change required — handled
server-side.**

[`firestore-rules.md`](./firestore-rules.md) is the single place the website's
Firestore-rules requirements are recorded.

## Indexes

None — nothing to transport to the main project, and nothing that had to be
recreated when the data moved projects. Every query is either a document lookup
or a single-field equality (`sourceCode`, `demandSourceId`, `manageToken`,
`normalisedEmail`, `testerStatus`, `interestedInOrganising`), all of which
Firestore indexes automatically. The registrations view sorts in memory rather
than adding an `orderBy` that would require a composite index.

This was a deliberate constraint, and worth preserving: because index changes
have to travel through the main project's Development branch, a query needing a
composite index cannot ship with a website deploy. Prefer single-field
equalities plus in-memory sorting for anything added later.

## Environment variables

**Required, wherever the site runs:**

```
FIREBASE_PROJECT_ID_STAGING       operator-calling
FIREBASE_CLIENT_EMAIL_STAGING     service account for operator-calling
FIREBASE_PRIVATE_KEY_STAGING      its private key
```

These already existed for QR invites, but they were optional then — an invite
route simply skipped the staging project when they were absent. They are not
optional now. Without them `getProjectDb("staging")` throws by name and the
public waitlist page, every `/api/waitlist/*` route and the outreach admin panel
fail outright. There is deliberately no fallback to dev: a silent fallback would
scatter registrations across two projects, which is worse than an outage.

The dev credentials (`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`) are still required — admin role checks, group creation
and web sign-in all read dev.

Optional: `WAITLIST_HASH_SALT`. Visitor IPs are hashed before storage, never
kept raw. Without this variable the salt derives from the dev private key, which
is fine — set it only if you want the salt rotatable independently of the
service account. Rotating it resets unique-visit dedupe but is safe for
duplicate-signup detection, which uses an unsalted hash precisely so that the
entry id for an email never changes.

## Email

**Collection-only.** Addresses are gathered and stored; nothing is delivered.
`EMAIL_SENDING_ENABLED` is the master switch and defaults off — sending needs it
set to `true` *and* SMTP credentials, so configuring SMTP alone cannot start
mail flowing. Every suppressed message is logged with its subject and recipient.

Nothing else changes when it is off: registration succeeds, the manage link is
returned to the page rather than only emailed, and the schedule window that
would have notified testers records that it still owes them one.

## Threshold

Defaults to **20 registrations** (`DEFAULT_DEMAND_THRESHOLD` in
`lib/waitlist/constants.ts`). To change it globally without a deploy, create:

```
settings/waitlistDemand → { minimumWaitlistSignups: <number> }
```

Per-source overrides are set in the admin panel when creating a source.

When a source crosses its threshold it flips to `threshold_reached`, stamps
`thresholdReachedAt`, and surfaces a banner at the top of the Outreach tab. It
does **not** create a group. Crossing fires once: `thresholdReachedAt` is only
cleared if someone raises the threshold.

## Using it

1. `/admin/super` → **Outreach** tab (admin or super admin).
2. **Add source** — platform, name, topic, source URL, public audience label.
   Creating a source mints its first tracked link and copies the URL.
3. Post that link. Use **New link** for each separate post/comment so their
   performance is tracked apart.
4. **Preview** opens the page with `&preview=1`, which renders normally but
   records no visit and blocks submission — admin previews stay out of counts.
5. **Registrations** loads emails for that source on demand.

## Public page behaviour

`/waitlist?s=CODE` resolves the code server-side. Platform, audience label,
group and relationship status are read from the database and never taken from
the query string, so a visitor cannot forge an endorsement by editing the URL.

An unknown, paused or archived code silently falls back to the generic waitlist
— no error, and no unverified source is ever named. The miss is logged.

The disclaimer is derived from the source's `relationshipStatus` alone
(`lib/waitlist/copy.ts`). Default is `unverified`, which says plainly that the
group and its organisers have not approved or partnered with The Operator.
Only `partnered` produces partnership wording.

The page is `noindex` — tracked links shouldn't accumulate search results for
every forum posted in.

## Known limitations

- **No email is sent.** Registrations are stored; the confirmation says interest
  is recorded and stops short of promising contact. There is no sending
  infrastructure in this project yet.
- **Duplicate handling is per (source, email).** The same address can join for
  two different audiences — intended, since they are separate demand signals.
  A repeat submission for the same source updates the record, preserves the
  original date, and can only upgrade organiser interest false → true. It never
  increments `signupCount`.
- **Share clicks are intent only.** Nothing tells us whether a visitor actually
  posted. They are counted separately and never feed demand.
- **Unique visits are per hashed IP.** Shared networks undercount; a changing
  mobile IP overcounts. Good enough for a threshold, not an audience metric.
- **Rate limiting fails open.** If Firestore errors, the request is allowed
  rather than taking the signup form offline.
- **No automated tests.** This project has no test framework; verification is
  the type-check, the build, and manual walkthrough in production.

## Not built yet (later stages)

Outreach records and history, the AI comment generator, duplicate-destination
warnings, organiser-interest management view, the review → create/link group
step, and registrations-over-time charts.
