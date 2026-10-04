# Account deletion lifecycle: what the website must change

**Documentation only. No website code, copy, rules, deployment or data was changed by
this document.** It hands over the website side of the new automatic deletion
lifecycle to the developer who will implement it.

Companion to the app repo change:
[`operator` PR #34](https://github.com/colinriche/operator/pull/34) (branch
`feat/account-deletion-lifecycle`), which adds the lifecycle itself. Read that PR's
`docs/ACCOUNT_DELETION_LIFECYCLE.md` first. This is Issue 3 of the privacy policy
review (`docs/privacy-policy-review.md` in a working copy; not yet committed).

> [`docs/account-deletion.md`](./account-deletion.md) describes the **current**
> admin-review behaviour. It is correct today and is superseded once this is
> implemented; rewrite it then.

## 1. What changes, in one paragraph

Today a request deletes nothing and a super admin must approve it. In the new
lifecycle, a request **switches the account off immediately**, schedules permanent
deletion **30 days** later, lets the person **cancel** until then, and an automatic
sweep in the app's Cloud Functions then deletes the account. No admin approval. The
website has to stop owning a separate copy of that logic, call the same functions,
show the pending state, and correct every place that says "admin reviews" or "carried
out by hand".

## 2. Current website behaviour (verified in `main`)

| Area | Where | Today |
|---|---|---|
| Request / withdraw | `app/api/account/deletion/route.ts` | Writes `deletionRequests/{primaryId}` itself with the Admin SDK (`status: pending`, `restoreUntil` = now + 30 days). Actions `delete`, `permanent`, `restore`. Its own copy of the logic; the app has another in `functions/account_deletion.js`. |
| Account resolution | `lib/account-deletion.ts` `resolveAccount` | Maps the web login to the primary `user` document: the web uid, plus a linked app profile (`profileDocId`) when it has the same email or an explicit `linkedWebUid`/`webUid`. |
| UI | `components/dashboard/ProfileEditor.tsx` (~l.163-230, 668-735) | "Delete my account", "Request Permanent Deletion", "Restore my account". `DELETION_NOTICE` and confirm text promise a 30-day restore. |
| Admin review | `lib/deletion-review.ts`, `lib/deletion-review-server.ts`, `app/api/admin/deletion-requests/[id]`, `components/admin/DeletionRequestsPanel.tsx` | Super admin deletes or declines each request, via the app's `deleteUser` function as that admin. Early deletion needs a second confirmation. |
| Deletion implementation | `lib/user-archive.ts` `archiveAndDeleteUsers` | Not called by anything (the request path calls the app function). Handles `authUserIds`; keeps a minimal record unless `retainFullArchive`. Diverges from the app's `archiveAndDeleteUser` (always a full archive). |
| Retired | `app/api/account/delete/route.ts` | Returns 410. |
| Public copy | `/account-deletion` page, `/privacy` (lines ~262 and 284-305), `/faq` (line ~43) | See section 6. |
| Enforcement of a disabled account | none | The website does not check `banned`, `accountStatus` or any deletion state when someone signs in to the dashboard. |

## 3. Proposed website changes

### 3.1 Request and cancel: one implementation, in the app's functions

- Stop writing `deletionRequests` from `app/api/account/deletion/route.ts`. Call the
  app's `sendFcmMessage` actions (`requestAccountDeletion`, `cancelAccountDeletion`,
  `getAccountDeletion`) instead, forwarding the caller's ID token, as the
  admin deletion route already does for `deleteUser`.
- **Gap to close in the app functions first:** those actions treat the token's uid as
  the `user` document id. A website login linked to an app profile has a different uid
  (`linkedWebUid`), so the call would not find the account. The functions need to
  resolve "caller -> primary profile" the way `resolveAccount` does (own `user/{uid}`,
  else the profile whose `linkedWebUid` / `linkedWebUids` contains the uid), with the
  same ownership checks. Do this once, server-side, rather than trusting a
  `profileDocId` sent by the browser.
- Drop the `permanent` / "Request Permanent Deletion" variant. Both buttons do the same
  thing in the new lifecycle; keep `permanent_deletion` only as a legacy `requestType`
  value on old records.
- Cancel ("Restore my account") becomes a call to `cancelAccountDeletion`. It is an
  additional route for linked users; the app does not depend on it.

### 3.2 Show and enforce the pending state on the website

- If the resolved profile has `deletion.status === "pending"`, the dashboard must show
  only an "Account scheduled for deletion" page (date, what it means, **Cancel
  deletion**, sign out), matching the app, and not the normal dashboard or profile
  editor. Today the website would let a pending account carry on editing.
- Any server route that acts for the person (account link, profile writes, group and
  call-scheduling features) should refuse a pending account.
- Linking a web login to an app profile that is pending must be refused or must show
  the pending state (`app/api/account/link/route.ts`).
- The Firestore rules (shared single project, in the app repo, PR #34) already stop
  clients writing `user.deletion`; the website must not try to.

### 3.3 Admin Deletions tab becomes monitoring, not approval

- Remove "Delete account" and "Decline request" as the normal path. Nothing waits for
  an admin.
- Show the new statuses (`pending`, `processing`, `completed`, `restored`, `failed`,
  `held`, legacy `declined`): extend `DELETION_STATUSES`, `STATUS_LABEL`,
  `STATUS_TONE`, `toAdminDeletionRequestView` and their tests.
- Keep, for super admins only, the exceptions that are genuinely needed:
  **Hold** (legal hold: the sweep never deletes a `held` request), **Release hold**,
  **Retry** a `failed` request, and optionally **Delete now** for a verified
  immediate-deletion request. Each writes an audit entry.
- Requests filed before this change (no `autoDelete: true`) and old website requests
  are not processed by the sweep. Decide: leave them in the admin queue until cleared,
  or migrate them with a one-off script that sets `autoDelete: true` (only after the
  people have been told the new terms).
- `lib/deletion-review.ts`, `lib/deletion-review-server.ts` and
  `app/api/admin/deletion-requests/[id]` shrink to the hold/retry/delete-now actions.
  Remove `lib/user-archive.ts` `archiveAndDeleteUsers` (unused, diverged) or fold the
  useful part (deleting every linked auth uid) into the app's purge.

### 3.4 Website-side data the app's purge does not reach

The app's `purgeAccount` deletes `user` documents (including linked uids), Auth
users, the Storage profile photo and a set of app collections. It does **not** touch
data the website holds that is keyed by email:

- `waitlistEntries` (email, country, optional name, language, time zone, referral,
  early-access choice);
- `contactMessages` (name, email, message, `emailStatus`);
- tracked link visits (hashed IP, referrer, landing page);
- any website-only `user/{webUid}` account that was never linked to an app profile
  (it is deleted by the same function if the request resolves to it, but confirm);
- `localStorage` token `operator_waitlist_token` and the signed-in marker cookie
  (client side, cleared on sign-out).

Decision needed for each: delete, anonymise, or keep with a stated reason and period.
Whatever is chosen must be implemented (a website-side step run when a request
completes, or a callable the app sweep invokes) and then stated in the policy. Email
logs held by Amazon SES and crash reports held by Sentry are outside both repos.

### 3.5 Website-only people and the Google Play web URL

Google Play asks for a **web page** where a person can request deletion, listed in the
Play Console. `/account-deletion` is that page today. Check it works for:

- someone who **only used the app** and has no website account (the page tells them to
  sign in to the dashboard; phone sign-in exists on the website and `/api/account/resolve`
  can map a phone number to the app profile, but this path is not documented or tested
  for deletion), and
- someone who **cannot sign in** (today: email privacy@operatorcalling.com).

The page should say plainly how an app-only person requests deletion without
installing anything, and the same cancel route should work for them. Verify against the
current Play policy text (not checked here).

## 4. Public copy that is wrong once the lifecycle ships

| File | Current wording | Needs to say |
|---|---|---|
| `app/(public)/account-deletion/page.tsx` steps | "Go to Dashboard -> Profile and scroll to Delete account", "30-day recovery period ... Restore my account", "After 30 days, eligible for permanent deletion and will be processed as soon as reasonably possible" | App path first (Settings -> Request account deletion), then website; "your account is switched off straight away"; "cancel any time in the 30 days from the app or website"; "after 30 days it is deleted automatically". |
| same page, "What happens to your data" | "deleted or anonymised"; "If your app and website accounts are linked, the request applies to both" | Say exactly what is deleted and what is kept and why (moderation records), and that linked accounts are covered **only once** 3.1 and the app purge handle every linked identity. Do not claim it before it is true. |
| `app/(public)/privacy/page.tsx` ~l.262-266 | "enters a 30-day recovery period ... eligible for permanent deletion, which our team carries out by hand" | Automatic deletion after 30 days; account switched off meanwhile. |
| `app/(public)/privacy/page.tsx` ~l.284-305 | "Deletion applies to the whole account" (fine) | Keep; add where to cancel; add retained records and retention periods once decided (Issue 10). |
| `app/(public)/faq/page.tsx` ~l.43 | "30 days to restore it, after which it becomes eligible for permanent deletion by our team" | Automatic, no team step. |
| `components/dashboard/ProfileEditor.tsx` | `DELETION_NOTICE`, "Delete my account", "Request Permanent Deletion", "Restore my account" | "Request account deletion" label, one button, "Cancel deletion"; switched-off wording. |
| `components/admin/DeletionRequestsPanel.tsx` | "Ready to review", "Delete account", "Decline" | Monitoring wording per 3.3. |

Also: bump the policy's "Last updated" date; **publish the policy changes only when
the behaviour is live**, never before. Re-check the Google Play Data Safety answers and
App Store privacy labels ("can data be deleted", how). Do not describe ordinary
profile, contacts or call history as "safety records"; only moderation reports, blocks
and audit entries are retained for that purpose.

## 5. Dependencies and order

1. App repo PR #34 reviewed, tested on Development, merged; functions and rules
   deployed to Development, then production (via the normal branch process, not the
   console).
2. App functions extended to resolve a linked web uid to its primary profile (3.1).
3. Website: call-through for request/cancel, pending-state page, admin panel changes,
   website-data purge (3.4).
4. Copy and policy updates (section 4), released with step 3.
5. Migrate or clear old `deletionRequests` (3.3).
6. Minimum app version / coordinated release, because an old app build would still
   say "your account keeps working" after filing a request.

## 6. Test checklist (Development)

- [ ] Website-only account: request, see the scheduled page, cancel, normal dashboard returns.
- [ ] App-only account (no website account): request from the app; sign in on the website by phone; see the scheduled page; cancel from the website. Also cancel from the app.
- [ ] Linked account (app + website): request from the website; the **app** shows its scheduled screen; cancel from the app; website returns to normal. And the reverse.
- [ ] While pending, the website refuses profile edits, group/call features and account linking.
- [ ] Banned or suspended person requests then cancels: still banned or suspended.
- [ ] A forced-due request (set `restoreUntil` to a past time in Development) is deleted by the sweep: app user doc, every linked Auth uid, photo; the request record loses its personal details.
- [ ] Website data (3.4) is handled as decided.
- [ ] Admin Deletions tab shows each status; Hold stops the sweep; Retry works on a `failed` request.
- [ ] Old pending requests (no `autoDelete`) are not touched by the sweep.
- [ ] Public pages, FAQ and policy match the behaviour; `/account-deletion` readable signed out.

## 7. Not decided / not verified

- Retention of moderation records and the request record (Issue 10, no period set).
- What to do with `waitlistEntries`, `contactMessages`, link visits (3.4).
- Whether to migrate existing website requests (3.3).
- Google Play and Apple policy wording was not checked against the current text.
- The live Firestore data and Firebase Storage contents were not inspected.
- Whether `/api/account/resolve` reliably maps an app-only phone login for the deletion flow.
