# Dashboard Firestore Schema

The dashboard now reads live data from Firestore instead of local sample arrays.

## Collections

### `user` (existing in app)
- Document ID: `uid`
- Fields used by dashboard:
  - `displayName: string`
  - `email: string`

### `schedules`
- Document ID: auto or custom ID
- Fields:
  - `initiatorId: string` (uid)
  - `recipientId: string` (uid)
  - `groupId?: string` (group doc ID when this is a group call)
  - `scheduledAt: Timestamp`
  - `status: "pending" | "confirmed" | "completed" | "cancelled" | "missed"`
  - `durationMinutes?: number` (set after completed calls)

### `callbacks`
- Document ID: auto or custom ID
- Fields:
  - `requesterId: string` (uid)
  - `targetId: string` (uid)
  - `requestedAt: Timestamp`
  - `status: "pending" | "answered" | "expired"`
  - `expiresAt?: Timestamp`

### `notifications`
- Document ID: auto or custom ID
- Fields:
  - `userId: string` (uid of recipient)
  - `type: "incoming_call" | "call_scheduled" | "callback_request" | "group_invite" | "system"`
  - `title: string`
  - `message: string`
  - `read: boolean`
  - `createdAt: Timestamp`
  - `data?: map<string, string>`

### `groups`
- Document ID: group ID
- Fields used by dashboard:
  - `name: string`
  - `memberCount: number`

### `memberships`
- Document ID: auto or custom ID
- Fields:
  - `userId: string` (uid)
  - `groupId: string`
  - `role: "member" | "moderator" | "admin"`
  - `status: "active" | "pending" | "banned"`
  - `joinedAt?: Timestamp`

## Query Notes

- Dashboard queries are client-side and filter by:
  - `schedules.initiatorId == uid` and `schedules.recipientId == uid`
  - `callbacks.targetId == uid`
  - `notifications.userId == uid`
  - `memberships.userId == uid`
- Related `user` and `groups` docs are fetched by document ID (`documentId() in [...]`).

## Recommended Indexes

Current dashboard queries only use single-field equality constraints, so they should work without custom composite indexes. Add composite indexes only if you later combine additional filters/order clauses.

## One-click Seeding (Super Admin UI)

The app now includes a setup action to create starter records in Firestore:

1. Sign in with a user that has `role: "admin"` in `user/<uid>`.
2. Open `/admin/super`.
3. Go to the **System** tab.
4. In **Dashboard setup**, click **Seed dashboard starter data**.

What gets created/updated for your current uid:

- `user` (current user profile fields used by dashboards)
- `groups`
- `memberships`
- `schedules`
- `callbacks`
- `notifications`
- `invites`
- `reports`
- `admin_controls/platform`

Notes:

- This action is idempotent for the same user because it uses deterministic document IDs.
- You can run it again safely to restore missing starter records.
- If your Firestore rules block some collections, the seeder now performs best-effort writes and reports which collections failed.

### Required Firestore Rules

Your current rules must include matches for the dashboard collections below, otherwise seeding and dashboard reads will fail with `permission-denied`.

Add these blocks inside `service cloud.firestore { match /databases/{database}/documents { ... } }`:

```text
match /schedules/{docId} {
  allow read: if isSignedIn() && (
    resource.data.initiatorId == request.auth.uid ||
    resource.data.recipientId == request.auth.uid
  );
  allow create: if isSignedIn() &&
    (request.resource.data.initiatorId == request.auth.uid ||
     request.resource.data.recipientId == request.auth.uid);
  allow update, delete: if isSignedIn() && (
    resource.data.initiatorId == request.auth.uid ||
    resource.data.recipientId == request.auth.uid
  );
}

match /callbacks/{docId} {
  allow read: if isSignedIn() && (
    resource.data.requesterId == request.auth.uid ||
    resource.data.targetId == request.auth.uid
  );
  allow create: if isSignedIn() &&
    (request.resource.data.requesterId == request.auth.uid ||
     request.resource.data.targetId == request.auth.uid);
  allow update, delete: if isSignedIn() && (
    resource.data.requesterId == request.auth.uid ||
    resource.data.targetId == request.auth.uid
  );
}

match /notifications/{docId} {
  allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
  allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
  allow update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
}

match /memberships/{docId} {
  allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
  allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
  allow update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
}
```

Then publish the rules:

- Firebase Console -> Firestore Database -> Rules -> Publish
- or via CLI: `firebase deploy --only firestore:rules`
