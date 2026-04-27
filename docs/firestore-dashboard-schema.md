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

### Required Firestore Rules (copy-paste reference)

The website and seed tool use these collections:

| Collection | Used for |
|------------|----------|
| `schedules` | User dashboard calls, admin analytics |
| `callbacks` | Callback requests |
| `notifications` | In-app notifications |
| `memberships` | Group membership (group admin lists members by `groupId`) |
| `invites` | Pending group invites (group admin) |
| `reports` | Super admin moderation + group-level counts |
| `admin_controls` | Super admin platform toggles (`platform` doc) |

**Important:** Your production rules file likely already defines helpers like `isSignedIn()` and matches for `user`, `groups`, `invites`, `reports`, etc. Do **not** duplicate those. Either:

1. **Merge:** Add only the **helper functions** below that you do not already have (rename if they clash), then add only **missing** `match` blocks, or
2. **Replace:** If you have no rules for these paths yet, you can paste the whole **helpers + matches** block in one go inside:

`service cloud.firestore { match /databases/{database}/documents { ... } }`

---

#### Helpers (add once, next to your other `function` declarations)

These names are chosen to avoid clashing with common names like `isOwner`. If a name exists, merge the logic manually.

```text
// Web app treats Firestore user doc role "admin" as super-admin for seeding + admin_controls.
function isWebAdmin() {
  return isSignedIn() &&
    exists(/databases/$(database)/documents/user/$(request.auth.uid)) &&
    get(/databases/$(database)/documents/user/$(request.auth.uid)).data.get('role', '') == 'admin';
}

function groupMemberIds(gid) {
  return get(/databases/$(database)/documents/groups/$(gid)).data.get('memberIds', []);
}

function isMemberOfGroup(gid) {
  return exists(/databases/$(database)/documents/groups/$(gid)) &&
    groupMemberIds(gid).hasAny([request.auth.uid]);
}

function isGroupCreator(gid) {
  return exists(/databases/$(database)/documents/groups/$(gid)) &&
    get(/databases/$(database)/documents/groups/$(gid)).data.get('createdBy', '') == request.auth.uid;
}

// Optional: reporter/target on reports (adjust field names if yours differ)
function isReportParticipant() {
  return isSignedIn() && (
    resource.data.get('reporterId', '') == request.auth.uid ||
    resource.data.get('reportedId', '') == request.auth.uid
  );
}

function reportGroupId() {
  return resource.data.get('groupId', '');
}

function isReportForUsersGroup() {
  let gid = reportGroupId();
  return gid != '' && isMemberOfGroup(gid);
}
```

---

#### Collection rules (paste `match` blocks inside `match /databases/{database}/documents`)

**`schedules`** — participants can read/write; optional admin read-all.

```text
match /schedules/{docId} {
  allow read: if isSignedIn() && (
    resource.data.initiatorId == request.auth.uid ||
    resource.data.recipientId == request.auth.uid ||
    isWebAdmin()
  );
  allow create: if isSignedIn() &&
    (request.resource.data.initiatorId == request.auth.uid ||
     request.resource.data.recipientId == request.auth.uid);
  allow update, delete: if isSignedIn() && (
    resource.data.initiatorId == request.auth.uid ||
    resource.data.recipientId == request.auth.uid ||
    isWebAdmin()
  );
}
```

**`callbacks`** — requester or target (same pattern as schedules).

```text
match /callbacks/{docId} {
  allow read: if isSignedIn() && (
    resource.data.requesterId == request.auth.uid ||
    resource.data.targetId == request.auth.uid ||
    isWebAdmin()
  );
  allow create: if isSignedIn() &&
    (request.resource.data.requesterId == request.auth.uid ||
     request.resource.data.targetId == request.auth.uid);
  allow update, delete: if isSignedIn() && (
    resource.data.requesterId == request.auth.uid ||
    resource.data.targetId == request.auth.uid ||
    isWebAdmin()
  );
}
```

**`notifications`** — recipient only (admin generally does not need to read user notification inboxes).

```text
match /notifications/{docId} {
  allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
  allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
  allow update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
}
```

**`memberships`** — **must** allow members of a group to read membership docs for that group (group admin UI queries `where("groupId", "==", groupId)`). Without this, you get `permission-denied`.

```text
match /memberships/{docId} {
  allow read: if isSignedIn() && (
    resource.data.userId == request.auth.uid ||
    isMemberOfGroup(resource.data.groupId) ||
    isWebAdmin()
  );
  allow create: if isSignedIn() && (
    request.resource.data.userId == request.auth.uid ||
    isGroupCreator(request.resource.data.groupId) ||
    isWebAdmin()
  );
  allow update, delete: if isSignedIn() && (
    resource.data.userId == request.auth.uid ||
    isGroupCreator(resource.data.groupId) ||
    isWebAdmin()
  );
}
```

**`admin_controls`** — platform settings doc `platform`; restrict to web admin.

```text
match /admin_controls/{docId} {
  allow read, write: if isWebAdmin();
}
```

**`invites`** — if you **do not** already have `match /invites/{docId}`. The group admin queries pending invites by `groupId` + `status`. Simple dev-friendly rule:

```text
match /invites/{docId} {
  allow read, write: if isSignedIn();
}
```

Tighter option (only inviter, group creator, or web admin — may require composite indexes for your queries):

```text
match /invites/{docId} {
  allow read: if isSignedIn() && (
    resource.data.invitedBy == request.auth.uid ||
    isGroupCreator(resource.data.groupId) ||
    isWebAdmin()
  );
  allow create: if isSignedIn() &&
    request.resource.data.invitedBy == request.auth.uid;
  allow update, delete: if isSignedIn() && (
    resource.data.invitedBy == request.auth.uid ||
    isGroupCreator(resource.data.groupId) ||
    isWebAdmin()
  );
}
```

**`reports`** — if you **do not** already have `match /reports/{docId}`. Super admin loads all reports; group admin filters by `groupId`.

Minimum (matches many existing projects; any signed-in user can read/update — tighten for production):

```text
match /reports/{docId} {
  allow create: if isSignedIn();
  allow read, update: if isSignedIn();
}
```

Stricter option (participant, same-group member, or web admin):

```text
match /reports/{docId} {
  allow create: if isSignedIn();
  allow read: if isSignedIn() && (
    isReportParticipant() ||
    isReportForUsersGroup() ||
    isWebAdmin()
  );
  allow update: if isSignedIn() && (
    isReportParticipant() ||
    isReportForUsersGroup() ||
    isWebAdmin()
  );
  allow delete: if isWebAdmin();
}
```

Ensure seeded/admin fields align with these helpers: `reporterId`, `reportedId`, `groupId` (optional), `status`. If your schema uses different names, adjust the helper functions.

---

#### Indexes

If you use **two equality filters** on one collection (e.g. `invites` with `groupId` + `status`), Firestore may prompt you to create a **composite index** when you first run the query in the app. Use the link in the Firebase console error to create it.

---

#### Publish

- Firebase Console → Firestore Database → Rules → Publish  
- or CLI: `firebase deploy --only firestore:rules`
