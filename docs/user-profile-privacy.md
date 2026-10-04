# Private Profile - findings and proposed Firestore rules change

Written 2026-10-04. This covers Issue 1 of
[`privacy-policy-review.md`](./privacy-policy-review.md) and the follow-ups it
turned up. **Nothing here has been applied.** No rules were deployed or edited,
and the app repo was not changed. The proposed rules are shown below for review.

Repos inspected: the website (`operator-calling`) and the app
(`C:\Users\cjric\projects\operator`, rules in `firestore.rules`).

---

## Summary

- The profile is meant to be private, but the **Firestore rules make every user
  document readable by anyone**. That includes phone number, email, push tokens
  and account links.
- Checked live: an unauthenticated request with no key listed documents in the
  `user` collection. Only a document ID was read; a field mask excluded all
  personal data.
- Hiding fields is **not possible with rules alone**. Rules grant or deny a whole
  document. And the app currently **needs to read other people's push tokens**
  from the client to place calls. So the fix has two stages.
- **Stage 1 (minimum, rules only, no known breakage):** require sign-in to read
  `user`. This closes public and public-key access. It does not stop an
  unrelated signed-in user.
- **Stage 2 (the real fix, a small public/private split):** move private account
  data out of the shared document and call set-up server-side. Needs an app
  release.
- Three further findings came out of this review: any signed-in user can
  overwrite another user's push tokens, the web account-linking proof values are
  public, and the profile screens do not show what is required versus optional.

---

## 1. Fields stored in the user document

The `user/{id}` document is shared by the app and the website. Grouped by purpose:

| Group | Fields | Written by |
| --- | --- | --- |
| Identity shown to others | `name` (also `displayName`), `username`, `imageUrl` (avatar) | Sign-up, Profile screen |
| Private profile (voluntary) | `bio`, `city`, `country`, `interests` | Profile screen |
| Private account and contact | `phoneNumber`, `email`, `linkedWebEmail`, `systemName` (link code), `linkedSystemName`, `linkedWebUid`, `linkedWebUids` | Sign-up, account linking |
| Push and device | `fcmToken`, `voipToken`, `platform`, `appVersion` | App on each launch |
| Presence and call state | `isOnline`, `lastSeen`, `inCall`, `currentCallId`, `callStartedAt`, `inAutoQueue`, `inAutoQueueAt`, `dndUntil`, `dndOption`, `inCar`, `inCarCallKitEnabled`, `inCarUpdatedAt` | App, operator dashboard |
| Call preferences | `autoCallRestrictionPeriod`, `autoCallRestrictionMax`, `autoCallCount`, `totalAutoCalls`, `callLoggingEnabled`, `schedule` | App, operator dashboard |
| Social graph | `contactIds`, `favouriteIds`, `ignoredIds` | App |
| Moderation | `banned`, `flagged`, `report_count`, `accountStatus`, `suspension`, `warnings`, `reportsMade`, `reportsReceived`, `role` | Admins and functions |
| Deletion state | `archived`, `deletedAt`, `deletionReason` | Archive-and-delete function |
| Website-only settings | `callPreferences`, `privacy`, `notifications`, `completeness`, `photoURL`, `createdAt`, `updatedAt` | Website profile editor |

Where it is written: the app's sign-up and Profile screens, `FCMHelper`, presence,
DND, car-mode and auto-call services; the website's profile editor and sign-in
flows; the signalling server and cloud functions (Admin SDK).

## 2. What the app and backend genuinely need

| Need | Fields | Notes |
| --- | --- | --- |
| Sign in and account management | `phoneNumber`, `email`, `username`, `linkedWebUid(s)` | Server routes use the Admin SDK and are not affected by rules |
| Placing a call | The receiver's `fcmToken`, `voipToken`, `platform` | **The app reads these from other users' documents on the phone** (`auto_call_service.dart`, `group_call_service.dart`, `dropped_call_reconnect_service.dart`, `friend_request_service.dart`) and sends the push itself. This is why they are public today |
| Call eligibility | `inCall`, `inAutoQueue`, `dndUntil`, `isOnline`, standing (`banned`, `accountStatus`) | Read before calling; the rules also read standing server-side |
| Finding people | `username` search (friend search), `phoneNumber` match for invites, `email` uniqueness check on the Profile screen | Client queries today |
| Contacts and groups | `contactIds`, `favouriteIds`, group `memberIds` | |
| Matching and understanding demand | `interests`, group membership | See the note below |
| Admin tooling | Everything | The operator dashboard and super admin read broadly |

**Interests: stated purpose versus code.** Profile `interests` are stored and
edited in the Profile screen ("Your Interests": search, select, add a new one that
does not exist), and a shared `interests` collection holds the tag list. No code
was found that uses a user's interests to match them with other users, in the app,
the signalling server or the cloud functions. Group membership is likewise
available as a signal but is not used for matching in the code reviewed. Both are
intended uses and are worded as such; see section 8.

## 3. What another user genuinely sees

Verified in the app's screens and the call payload:

| Field | Seen by other users? |
| --- | --- |
| `name` | Yes (contacts, call screens, group lists) |
| `username` | Yes (contacts, search, call screens, incoming call) |
| `imageUrl` | Yes (avatars) |
| Phone number | **Only as a fallback.** The server sends `callerUsername || callerPhone` to the receiver, so an account without a username exposes its number. New sign-ups require a username |
| `email`, `bio`, `city`, `country`, `interests` | **No screen shows these to other users.** They appear only on the user's own Profile screen and in the admin dashboard |
| `fcmToken`, `voipToken` | Never shown, but read by the app to place calls |

So the **intended** boundary already holds in the interface. The problem is that
the database does not enforce it: everything in the document is readable.

## 4. Can unauthenticated users read `user` today?

**Yes.** Rule, in the app repo `firestore.rules`:

```
match /user/{userId} {
  allow read: if true;
```

Checked live with a plain HTTPS request and no credentials, with a field mask that
returns no data:

- `user` collection: **200**, a document listed (so reads and lists are open).
- `deletionRequests`, for comparison: **403** (correctly closed).
- `interests`: 200, and that one is **intended** public (the website's `/groups`
  page shows the tag list; it holds no user data).

## 5. Proposed minimum rules change (Stage 1)

One line, in `match /user/{userId}`:

```diff
-      allow read: if true;
+      allow read: if isSignedIn();
```

`isSignedIn()` already exists in the file (`request.auth != null`).

**Effect:** the internet, and anyone holding only the public Firebase key, can no
longer read user documents. Admin SDK access (server routes, cloud functions, the
signalling server) is unaffected, because it bypasses rules.

**What should keep working** (all happen after sign-in):
- App: sign-up and login, friend search by username, invite matching by phone,
  contacts, groups, call set-up and the receiver-token reads, presence, the
  operator dashboard.
- Website: `useAuth` profile lookups, the account link and resolve flows,
  sign-in with Google, Apple or phone, the profile editor, the group admin and
  super admin dashboards.

**What it does not fix:** any signed-in user, which means anyone who can create
an account with a phone number, can still read every user document, including
tokens and contact details. That is the job of Stage 2.

**Unconfirmed, needs a test before deploying:** that no flow reads `user` before
signing in. None was found. The closest candidates are the username lookups in
the app's sign-up path (`auth_bloc.dart`, `getUserByUsername`), which appear to
run after phone verification. Test on the development build, signed out and signed
in, with a new account and an existing one, before promoting.

**Process:** per the project's rules process, this goes in the app repo's
`firestore.rules` on the Development branch and is promoted to Staging. It is
not applied through the Firebase console, and I have not changed that file.

### Stage 1b - stop other users overwriting push tokens (recommended, needs a test)

A second rule in the same block lets **any signed-in user** update another user's
document if only these keys change: `fcmToken`, `voipToken`, `platform`,
`isOnline`, `lastSeen`, `inCall`, `currentCallId`, `callStartedAt`,
`appVersion`, the auto-call counters, `dndUntil`, `dndOption`, `inAutoQueue`,
`inAutoQueueAt`, the in-car fields, `callLoggingEnabled`.

That means a signed-in attacker can set someone else's `fcmToken` or `voipToken`
to their own device and **receive that person's incoming-call pushes**, or mark
them as in a call or on do-not-disturb.

Proposed direction: that branch applies to the owner or an admin only
(`isOwner(userId) || isAdmin()`), with one narrow exception that keeps the app's
existing stale-token cleanup working: another user may change only `fcmToken` and
`voipToken`, and only to `null`. This is riskier than Stage 1 because the app's
presence and dashboard flows write some of those fields, so it needs the same
development-build test pass. It should ship with Stage 1 or immediately after.

## 6. Is a public/private split safer? Yes (Stage 2)

The document mixes public-facing identity with private account data, so no
read rule can both let the app work and protect the private fields. A small split
is the safe design:

- **Keep in `user/{id}` (readable when signed in):** `name`, `username`,
  `imageUrl`, plus the presence and call-state fields the app checks before a call.
- **Move to a private place (owner and server only), for example
  `user/{id}/private/account`:** `phoneNumber`, `email`, `linkedWebEmail`,
  `systemName`, `linkedSystemName`, `linkedWebUid(s)`, `fcmToken`, `voipToken`,
  `platform`, `appVersion`, and the private profile (`bio`, `city`, `country`,
  `interests`) and the social graph (`contactIds`, `favouriteIds`, `ignoredIds`)
  if you want those closed too.
- **Matching and group suggestions** read the private profile on the server with
  the Admin SDK, so they keep working.

What has to change to make that possible:
1. **Call set-up moves server-side.** Instead of the phone reading the receiver's
   tokens, it sends the receiver's user ID to the existing `sendFcmMessage`
   function, which looks the tokens up and sends the push.
2. **Search moves server-side:** invite matching by phone number, friend search
   by username, and the email-uniqueness check become function calls.
3. **Stale-token cleanup moves server-side.**
4. **Migration and a minimum app version.** Old app builds read the old fields.
   Copy the data, write both places for a transition, then require the new app
   version before the old fields are removed.

Do Stage 1 and 1b now; plan Stage 2 as the next release.

## 7. Further findings from this review

| Finding | Why it matters |
| --- | --- |
| Any signed-in user can overwrite another's push tokens (Stage 1b) | Incoming-call hijack |
| **Account linking is weak while profiles are public.** Linking a phone-only web session to an app account needs the app's `systemName` code plus the app account's email. Both are readable by anyone today | An attacker could link their own web sign-in to a victim's app account, and then read and edit that profile from the website. Fixed in effect by Stage 2, and made harder by Stage 1 |
| Social graph and moderation fields are public (`contactIds`, `favouriteIds`, `ignoredIds`, `report_count`, `warnings`) | Reveals who someone talks to and their moderation record |
| The profile screens do not mark required versus optional | Name, username and email are required at app sign-up; city, country, bio, photo and interests are optional |

## 8. Wording

### App and website: Profile becomes Private Profile (proposal only)

Places the current label is used: bottom navigation `Profile` and page titles
(`main_page.dart` around lines 598 and 776), the app drawer `Profile`
(`app_drawer.dart` line 439), and the website's dashboard `Profile`.

Proposed:
- **Title:** Private Profile
- **Subtitle:** Used to improve your matches
- **One line under it:** Only your name, username and photo are shown to other people.

Conditions before using it:
- "Used to improve your matches" is true as an intention. The code does not yet
  use a profile's interests to match people (section 2). Either build that, or use
  softer wording such as "Helps us suggest people and groups".
- "Only your name, username and photo are shown" is true in the interface today,
  but not in the database until Stage 2. Do not publish the line until Stage 1
  and ideally Stage 2 are live.
- "Required" markers: name, username and email at sign-up; the rest optional.

### Policy: how profile and interests are described

- Name, username and email are asked for when you create an account in the app.
  Photo, city, country, bio and interests are optional and you can edit or remove
  them.
- Interests and group membership are used, or intended to be used, to help match
  you with like-minded people and to understand what interest groups people want,
  so we can create suitable groups. State only the uses that exist at publication.
- Other users see your name, username and photo. They do not see your email, bio,
  city, country or interests. The phone number may be shown only on an old account
  that has no username.
- Do not call the profile public.

## 9. What contradicts this

| Where | Contradiction |
| --- | --- |
| `/privacy` page, "What we collect" | **Fixed 2026-10-05.** Previously said name, username, email, photo and other profile details were optional. It now says name, username and email are required for new app accounts and the rest is optional |
| `/privacy` page, "What other people see" | Does not say that other profile fields are not shown to other users |
| `/privacy` page, "Security" | Silent on the public database rule. Accurate wording needs Stage 1 first |
| Website FAQ, features, how-it-works | Describe stranger matching "by shared interests" and "first name only". No such matching in the code reviewed. **Not changed yet:** exact locations are listed in `privacy-policy-review.md` Issue 6 for the owner to edit |
| Website dashboard `Profile`, `ProfileEditor` | Named "Profile" and shows an "allow unknown calls" setting with no matching feature behind it |
| `docs/firestore-rules.md` | Says `user` must be readable "before any session context exists". The website reads it after sign-in |
| Data Safety assumptions | "First name, where supplied" and email "where supplied" do not match required sign-up fields; encryption in transit and deletion answers need checking (Issues 2, 3, 9) |

## 10. Decisions needed

1. Approve **Stage 1** (`allow read: if isSignedIn()`) and **Stage 1b** for the
   app repo's Development branch, with the sign-up and login test pass.
2. Approve planning **Stage 2** (the private split, server-side call set-up and
   search, minimum app version).
3. Approve the **Private Profile** wording, and whether the "improve your
   matches" line waits until matching uses interests.
4. Decide whether to remove the "allow unknown calls" setting and the stranger
   matching copy from the website until that feature exists.
