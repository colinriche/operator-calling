# Required: `callsEnabled` guard in the call-dispatch path

**Status: outstanding. Community auto-activation is not safe for production
until this lands.**

This change cannot be made from the website repo. This document identifies
exactly what owns dispatch, gives the patch, and gives the two tests.

## Why it is required

A community group created automatically at threshold is written with
`callsEnabled: false` because nobody has yet taken responsibility for running
its calls. The website enforces that everywhere it can. It does not place calls.

Without the guard, such a group shows **"Calls paused — awaiting group admin"**
in the admin panel and calls people anyway — worse than having no toggle,
because it reads as safe when it is not.

## Where dispatch lives

**Not in this repository.** Verified: no `functions/` directory, and every
reference to `scheduledGroupCalls` here is CRUD from the dashboard or the
waitlist activation — nothing reads it to place a call.

What is known about the owner:

| | |
|---|---|
| Firebase project | `webrtc-clone-dc88c` (the "dev" project) |
| Functions region | `us-central1` |
| Confirmed deployed function | `sendFcmMessage` — referenced at `components/admin/SuperAdminDashboard.tsx:60` |
| Collection dispatch reads | `scheduledGroupCalls` — `status == "scheduled"`, `scheduledAt <= now` |
| Related matching path | `auto_call_sessions/{sessionId}/waiting_members` — the staging Firestore rules comment "The matching Cloud Function rejects stale/missing heartbeats so crashed clients cannot be paired as ghosts", which confirms a matching function exists and reads these |

Source of truth is the **main project's Development branch**.

### Locating it in about two minutes

```bash
# List what is actually deployed
firebase functions:list --project webrtc-clone-dc88c

# In the main project checkout, on Development:
grep -rn "scheduledGroupCalls" --include="*.ts" --include="*.js" .
grep -rn "auto_call_sessions" --include="*.ts" --include="*.js" .
```

The function to change is whichever queries `scheduledGroupCalls` on a timer —
a `onSchedule` / pubsub-scheduled function, or a worker doing the same.

## The patch

Immediately after loading the group document, before **any** matching, session
creation, FCM/VoIP push, or call initiation:

```js
const groupSnap = await db.collection("groups").doc(call.groupId).get();
const group = groupSnap.data();

// Fail closed: anything other than an explicit true means do not dispatch.
if (!group || group.callsEnabled !== true) {
  console.log(`[dispatch] skipping ${call.groupId} — calls not enabled`);
  return;
}
```

Requirements this satisfies:

- Runs in the trusted server-side dispatch path, not the UI.
- Fails closed — a missing field, a missing group, `undefined`, `null` or
  `"true"` as a string all mean do not dispatch. Only boolean `true` proceeds.
- Auto-created groups stay non-calling until an authorised admin enables them.
- Schedules are untouched while disabled.
- Re-enabling resumes from the next occurrence only; nothing missed is replayed
  (the website rewrites `scheduledAt` forward on enable — see below).

## Interim mitigation already in place

Because the guard is not yet deployed, the website makes an unmodified
dispatcher fail closed anyway:

- Auto-created schedules are written with **`status: "paused"`**, not
  `"scheduled"`. A dispatcher filtering on `status == "scheduled"` skips them
  without knowing anything about `callsEnabled`.
- Turning calls off flips that group's schedules to `paused`.
- Turning calls on flips them back to `scheduled` **and rewrites `scheduledAt`
  to the next occurrence**, which is what makes "do not replay missed calls"
  true — a paused schedule whose time has passed would otherwise be instantly
  overdue and fire the moment it became visible.

The schedule's day, time and zone are never altered by any of this.

**This is belt and braces, not a substitute.** It depends on the dispatcher
filtering by status, which is an assumption, not a contract. The guard still
belongs in the dispatch path.

## Tests

Adapt to whatever the main project uses; the assertions are the point.

```js
describe("scheduled call dispatch — callsEnabled guard", () => {
  it("does not dispatch or create matches when callsEnabled is false", async () => {
    const groupId = await createGroup({
      callsEnabled: false,
      scheduleWeekday: 0,
      scheduleLocalTime: "19:00",
      scheduleZone: "Europe/London",
    });
    await createScheduledCall({ groupId, scheduledAt: inThePast(), status: "scheduled" });

    await runDispatch();

    expect(await matchesCreatedFor(groupId)).toHaveLength(0);
    expect(await pushesSentFor(groupId)).toHaveLength(0);
    expect(await callSessionsFor(groupId)).toHaveLength(0);
  });

  it("dispatches normally once callsEnabled becomes true", async () => {
    const groupId = await createGroup({
      callsEnabled: true,
      scheduleWeekday: 0,
      scheduleLocalTime: "19:00",
      scheduleZone: "Europe/London",
    });
    await createScheduledCall({ groupId, scheduledAt: inThePast(), status: "scheduled" });

    await runDispatch();

    expect(await callSessionsFor(groupId)).toHaveLength(1);
  });

  // Fail-closed cases — each must behave exactly like false.
  it.each([undefined, null, "true", 1, {}])(
    "does not dispatch when callsEnabled is %p",
    async (value) => {
      const groupId = await createGroup({ callsEnabled: value });
      await createScheduledCall({ groupId, scheduledAt: inThePast(), status: "scheduled" });

      await runDispatch();

      expect(await callSessionsFor(groupId)).toHaveLength(0);
    }
  );
});
```

The third test is the one worth keeping. `!group.callsEnabled` and
`group.callsEnabled !== true` behave identically for booleans and differ for
the string `"true"` — which is exactly what arrives if the field is ever set
from a form value or a JSON import.

## Fields the website writes

On the group document, in the project named by `GROUP_TARGET_PROJECT`
(`lib/waitlist/group-linking.ts`, currently `dev`):

```
callsEnabled       boolean   — false on automatic creation
callsPausedReason  string    — awaiting_group_admin | admin_paused | group_admin_paused
groupAdminId       string?   — null until an organiser is appointed
callsEnabledAt     timestamp
callsPausedAt      timestamp
callsUpdatedBy     uid
```

On `scheduledGroupCalls` documents for that group:

```
status             "paused" | "scheduled"
scheduledAt        rewritten forward on resume
pausedAt           timestamp
resumedAt          timestamp
```
