# Waitlist & demand tracking — setup

Stage 1 of the outreach / group-demand system. Covers the tracked link →
public waitlist page → registration → attribution → counters path, plus the
super-admin panel for creating sources and copying links.

## Where the data lives

Everything is in the **staging** Firebase project (`operator-calling`), reached
through `getProjectDb("staging")`. Admin role checks still run against the
**dev** project (`webrtc-clone-dc88c`), because web sign-in and the `user`
role documents live there.

Collections created (all in staging):

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

Rules are owned by the **main project's Development branch** and promoted to
Staging — not editable from this repo or the Firebase console. So this cannot
ship on the website's deploy timeline; it has to be transported separately. See
[`firestore-rules-waitlist-additions.md`](./firestore-rules-waitlist-additions.md)
for the block to paste and, more importantly, the caveat that goes with it.

The short version: these collections are written only by the Admin SDK, which
bypasses rules, so no client needs access. But Firestore grants access if *any*
matching rule allows it — `allow read, write: if false` declines to grant and
cannot take access away. If the staging rules contain a recursive wildcard
(`match /{document=**}`) that grants signed-in users access, registration emails
are readable by app users and the deny block will not change that. Fixing it
means editing a rule the mobile app depends on.

`settings/waitlistDemand` is only read server-side; if the `settings` collection
is already client-readable in staging, that is harmless — it holds a single
number.

## Indexes

None — nothing to transport to the main project. Every query is either a
document lookup or a single-field equality (`sourceCode`, `demandSourceId`), all
of which Firestore indexes automatically. The registrations view sorts in memory
rather than adding an `orderBy` that would require a composite index.

This was a deliberate constraint, and worth preserving: because index changes
have to travel through the main project's Development branch, a query needing a
composite index cannot ship with a website deploy. Prefer single-field
equalities plus in-memory sorting for anything added later.

## Environment variables

None new. The staging credentials already set in Vercel
(`FIREBASE_PROJECT_ID_STAGING`, `FIREBASE_CLIENT_EMAIL_STAGING`,
`FIREBASE_PRIVATE_KEY_STAGING`) are what this uses.

Optional: `WAITLIST_HASH_SALT`. Visitor IPs are hashed before storage, never
kept raw. Without this variable the salt is derived from the staging private
key, which is fine — set it only if you want the hashing salt rotatable
independently of the service account.

## Threshold

Defaults to **25 registrations** (`DEFAULT_DEMAND_THRESHOLD` in
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

1. `/admin/super` → **Outreach** tab (super admins only).
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
