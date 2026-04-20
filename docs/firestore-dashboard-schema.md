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
