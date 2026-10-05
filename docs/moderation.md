# Moderation (reports, suspensions, bans)

The admin half of the app's report feature. The app files a report; the website
reviews it. The data contract is `docs/MODERATION_CONTRACT.md` in the app repo.

```
Operator app -> Cloud Functions -> reports / blocks -> operatorcalling.com/admin/super
```

Everything is keyed on the **Firebase UID**, so it works for people who have never
signed into this website.

## Where it is

| What | Where |
|---|---|
| Queue (New / Reviewing / Resolved / All) | `/admin/super/reports`, also the Reports tab of `/admin/super` |
| Report detail | `/admin/super/reports/[id]` |
| A user's Moderation block and actions | `/admin/super/users/[uid]` (linked from the Users tab and from a report) |
| Nav badge | "Reports" in the admin sidebar, count = New + Reviewing |

Only a `super_admin` can see or use any of it (`canModerate` in
`lib/moderation-model.ts`). To let `admin` do some of it later, change that one
function.

## Rules

- Opening a report never changes its status. An admin clicks **Start review**.
- **Dismiss / Warn / Suspend / Ban / Disable auto calls** resolve the report and
  record the outcome. A resolved report accepts notes and nothing else.
- Suspend needs a duration (24h / 7d / 30d / custom, at most 365 days: longer is a Ban).
- Ban needs a confirmation step.
- Every action needs a reason, kept in the audit trail and **never shown to the
  user**. Suspend, Ban and Disable auto calls can also carry a separate message that
  the app shows the user.
- Every action writes a `moderation_actions` row: admin, time, reason, outcome.
- A report never bans automatically. The old "10 reports = ban" trigger is gone.
- An admin cannot act on their own account.
- Unban refuses a deleted account: `banned` is also how deletion is marked, so
  clearing it would half-restore it. Use the Archive.

## Files

- `lib/moderation-model.ts` – pure rules and types, unit tested (`tests/moderation.test.ts`).
- `lib/moderation-server.ts` – Admin SDK reads/writes, in transactions.
- `app/api/admin/reports`, `.../reports/[id]`, `.../users/[uid]/moderation` – routes.
- `components/admin/*` – `ReportsQueue`, `ReportDetail`, `UserModerationPanel`, `ModerationActionForm`.

## Two shapes of report live in `reports`

New reports have `reporter`/`reported` objects and a `reason` id. The old in-call
"flag" reports have `reporterId`, `reportedUserId` and no reason. `normaliseReport`
reads both so they share one queue. Old reports show as "Old in-call flag".

## Tests

```bash
npm test                # pure logic
npm run test:emulator   # transactions and Timestamps, against the Firestore emulator
```

The emulator tests need `firebase-tools` and Java.

## Role changes moved

The Users tab used to have a role dropdown writing `user.role` straight from the
browser. The app's Firestore rules now forbid a client writing `role`, `banned` and
the other moderation fields, so that was removed; role is shown read-only. Authority
lives in the `admins` collection (`lib/admins.ts`).
