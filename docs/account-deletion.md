# Account deletion requests

People ask to delete their account; only an admin deletes it.

```
App (Settings -> Account -> Delete account)  \
                                              >  deletionRequests/{uid}  ->  /admin/super  ->  Deletions tab
Website (profile page)                       /
```

## Rules

- **A request deletes nothing.** The app's `requestAccountDeletion` only writes a record. No user-callable path
  deletes an account, and the app's Firestore rules no longer let a user delete their own `user` document.
- The person can **withdraw** a request for 30 days (`restoreUntil`). Asking again while one is pending changes
  nothing, so repeating it cannot push the window out.
- A super admin reviews each request in Super Admin → Deletions:
  - **Delete account** archives the account (recoverable from the Archive tab for 30 days) and removes it, then
    marks the request `completed`. If the deletion fails, the request stays `pending`.
  - **Decline request** closes it with an internal reason and an optional message the person sees in the app.
- Deleting before the person's window has ended needs a second, explicit confirmation.
- An admin cannot delete their own account from here.
- Reports, blocks and moderation records are not touched by a deletion: they outlive the account.

## Statuses

`pending` → `restored` (withdrawn by the person) | `declined` | `completed` (deleted).

## Where the code is

- `lib/deletion-review.ts` – pure rules, tested (`tests/deletion-review.test.ts`).
- `lib/deletion-review-server.ts` – applies a review; emulator-tested.
- `app/api/admin/deletion-requests/[id]` – the one place an account is deleted in response to a request.
- `components/admin/DeletionRequestsPanel.tsx` – the Deletions tab.
- App repo: `functions/account_deletion.js`, `lib/features/presentation/pages/account_deletion_page.dart`.

## Known limits

- It deletes the request's primary account (`userId`). A website request that also names a separate web login in
  `userIds` shows both ids; the extra login is not removed automatically.
- The deletion runs through the app's `deleteUser` function as the reviewing admin, so that admin must be an
  admin there too (the same requirement as the Users tab's Archive/Delete).
