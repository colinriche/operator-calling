# Waitlist: community interest + early access tester programme

Supersedes the demand/waitlist behaviour described in
[`waitlist-demand-setup.md`](./waitlist-demand-setup.md), which now covers
implementation detail only. Where the two disagree, this document wins.

## 1. The model, in two levels

There are exactly two things a registration can feed. Nothing else is a "pool".

**The global pool** — everyone eligible for global calls with people they do
not know. This is what the **early access tester programme** feeds. Its call
schedules are set by admins; there is no automatic window.

**A community group** — an ordinary Operator group, created for people who
arrived via one tracked community and want calls with others from that same
community. When a tracked community passes its threshold the group is created
automatically and given the default weekly window.

A person can be in both, one, or neither-yet. The two are tracked separately
and one never implies the other.

## 2. Terminology and independence

Operator is **independent** of any community a link was posted in. It is **not
affiliated** with it, has not partnered with it, is not integrated into it and
has not been approved by it — unless a relationship has been explicitly
verified and recorded by an authorised person.

Never imply otherwise in public copy. Do not use "official", "partner",
"approved", "in association with", or the community's branding.

Call the early access programme a **tester programme**. Not "beta" as a
euphemism, not "founding member", not "VIP". Testers must be told plainly that
they may be asked for feedback and may encounter unfinished parts of the
product.

Prefer **organiser** over **admin** in public copy, as before.

## 3. User flow

### Arriving from a tracked community link

`/waitlist?s=CODE` resolves the community server-side, then does two things:

1. **Registers interest in calls with people from that community.** This is the
   primary action and the reason they clicked.
2. **Offers early access as a tester**, using the global pool. Optional,
   opt-in, unticked by default, and clearly separate from the above.

Both are one form and one submission. The tester offer is presented as an
additional opportunity, never as a requirement or a condition of joining.

### Arriving without a tracked link

`/waitlist` with no code, or an unknown/expired one, offers the tester
programme and general interest only. No community is named, and no community
interest record is created — there is no community to attribute it to.

### Time zone

Detected from the browser only, via
`Intl.DateTimeFormat().resolvedOptions().timeZone`. **No GPS, no IP
geolocation, no Google location services.**

The detected zone is shown to the user on the form and can be changed with a
dropdown before submitting, and afterwards from the manage link. Every call
window is displayed in the user's zone. Every stored time is UTC.

### Confirmation

Confirms what was recorded — community interest, tester status, or both — and
shows the **manage link** (see §6). Never promises a group will be created.

## 4. Admin flow

Unchanged: add a platform and source, create tracked links, copy them, post
them by hand, watch visits and registrations accrue.

**Changed at the threshold.** Previously the threshold flagged a source for a
human to review before anything was created. Now:

1. Threshold is reached.
2. The community group is **created automatically** and assigned the default
   weekly window, so nobody who registered is left waiting on a person.
3. The source is flagged in the dashboard as **needing review after the fact**,
   with duplicate-group warnings shown there.
4. An admin can then rename the group, merge it into an existing group, adjust
   the schedule, or archive it.

This is a deliberate reversal of the original "reviewable recommendation, never
auto-publish" rule, made because a community hitting its threshold on a Friday
night should not sit idle until Monday. The safety net moves from before
creation to immediately after it — it is not removed.

The dashboard additionally shows, per source: **tester count** alongside
registration count, and **tester status** per registration.

Global pool schedules are created and edited by admins. There is no default.

## 5. Data model

### Separation rule

Community interest and tester status are stored as **separate fields on the
registration**, never conflated, and neither is inferred from the other.
Withdrawing from the tester programme must leave community interest and its
attribution untouched, and vice versa.

### `waitlistEntries` — added fields

```
# Community interest (existing)
demandSourceId
sourceCode
sourceLinkId
platformId
relationshipStatusAtSignup
communityInterest            bool   — wants calls with people from this community

# Early access tester (new, independent)
testerStatus                 none | pending | active | paused | left
testerConsentAt              timestamp — when they ticked the box
testerConsentVersion         string    — which wording they agreed to
testerJoinedFromSourceCode   string    — attribution at the moment they opted in

# Time zone (new)
timezone                     IANA zone, e.g. "Europe/London"
timezoneSource               detected | user_selected

# Management (new)
manageToken                  opaque secret, indexed
manageTokenCreatedAt         timestamp
```

**`testerJoinedFromSourceCode` is the attribution rule made concrete.** A
tester who joins the global pool keeps the community they came from, recorded
at the moment they opted in. Becoming a tester must never blank, overwrite or
"promote away" `demandSourceId`. Global participation is additive.

### `groupDemandSources` — added fields

```
testerCount                  number  — registrations from this source who are testers
autoCreatedGroupAt           timestamp
reviewRequiredAfterCreate    bool
```

### Scheduling: two different models

These are deliberately not the same, and conflating them is the mistake to
avoid.

**Global Early Access = manually scheduled testing.** The tester pool gets **no
automatic or default recurring schedule**. An admin creates a window when there
is a test to run. Testers see it in their own time zone and are emailed when one
is created. Windows can be paused, edited or deleted. The global pool is not a
group and is not treated as one.

**Community group = default schedule created automatically at activation.**
Sunday 19:00 Europe/London, created the moment the group is, even if the group
has no admin yet. Turning calls on later must never have to invent a schedule.

### A schedule existing does not mean calls are enabled

Every community group carries a **Calls On / Off** flag, separate from its
schedule.

| | Effect |
|---|---|
| **Calls On** | Scheduled calls operate normally |
| **Calls Off** | Group stays active, members stay, people can still join, schedules stay stored **unchanged**. No calls start and no matches are created. |

Turning calls off never deletes, cancels or alters a schedule. Turning them back
on resumes from the **next valid occurrence** — nothing missed while paused is
replayed.

### A community group without a group admin starts with Calls OFF

On automatic creation:

1. Create the group.
2. Create the default Sunday 19:00 Europe/London schedule.
3. Set `callsEnabled: false`, `callsPausedReason: "awaiting_group_admin"`.
4. Do not run calls.

The group can exist, accumulate members and hold a ready schedule while calling
has not begun, because nobody is yet responsible for it. `createdBy` is the
Operator staff member who set up the demand source — that is not the same as
somebody who has taken on running this community's calls.

**Appointing a group admin does not switch calls on.** The admin turns them on
explicitly when ready. Prefer explicit activation even where an admin already
exists at creation.

Sequence:

```
threshold reached → group created → default schedule created
  → no group admin → Calls OFF
  → group admin appointed → admin chooses Calls ON → calls begin
```

### Who can toggle Calls

- Group admins, for their own group
- Site admins
- Super admins

So site and super admins hold an operational kill switch for an individual group
without deleting it or touching anyone's schedule.

### Schedules

Stored in UTC. A community group's default window is **Sunday 19:00
`Europe/London`**, stored as the resolved UTC instant plus the source zone, so
it survives British Summer Time correctly:

```
scheduleZone       "Europe/London"
scheduleLocalTime  "19:00"
scheduleWeekday    0            # Sunday
scheduleNextRunUtc timestamp
```

Storing only a UTC instant would drift by an hour twice a year; storing only
local time loses the instant. Both are kept.

## 6. Controls: join, pause, leave

Every registration issues an opaque **manage token**, giving a URL like
`/waitlist/manage?t=<token>`. It is:

- shown on the confirmation page and saved in the browser, so it works
  immediately with no email infrastructure
- emailed to them once sending exists — the same link, delivered properly

From it a person can, without an account:

- **Join** the tester programme if they didn't at first
- **Pause** — stays registered, receives no calls, keeps their place
- **Leave** the tester programme — community interest untouched
- **Withdraw** community interest — tester status untouched
- **Change time zone**
- See their call windows in local time

The token is a bearer credential: unguessable, revocable, and never shown in a
URL we ask anyone to share publicly.

## 7. Notification when a group goes live

When a community group is created, everyone who registered interest in that
community should be told. **This requires email sending, which does not exist
in this project yet** — no provider, no domain, no key.

Until it does, the trigger and the recipient list are recorded, and the
dashboard shows who is awaiting notification, so nothing is lost and the
messages can be sent once a provider is chosen.

## 8. Public copy

### Headline

```
Like talking on the phone with new people?
```

### Intro

```
Operator arranges scheduled one-to-one voice calls. You do not need to search
for people, send connection requests or arrange the call yourself. Make
yourself available and, when a call is scheduled, Operator makes the
connection and the call comes to you.
```

### Community interest

```
Register your interest in calls with other people interested in
[Public Audience Label].

When enough people register, a calling group may be created for this interest.
```

### Tester offer

```
Want calls sooner?

Join Early Access to help test The Operator app. You can take part in test
calls without waiting for this group to become active.

It is an early version, so you may come across unfinished parts, and we may
ask you for feedback. You can pause or leave at any time.
```

Checkbox, unticked by default:

```
Yes, I'd like to join the early access tester programme.
```

### Independence disclaimer

```
Operator is an independent service and is not affiliated with the website,
group or discussion where you found this link. Its owners and organisers have
not approved or partnered with Operator.
```

### Time zone

```
Times are shown in [detected zone]. Not right? [change]
```

### Confirmation

```
You're on the list.

We'll keep your interest linked to [Public Audience Label]. If enough people
are interested and a calling group is created, we'll let you know.
```

Tester addition:

```
You've also joined early access as a tester. Calls run on the schedule below,
shown in your time zone.
```

Both states then show:

```
Save this link to pause, leave or change your time zone later: [manage link]
```

## 9. What this changes in what is already built

| Area | Status |
|---|---|
| Tracked links, attribution, visit/registration counters | Unchanged, keep |
| Country + first-language fields | Unchanged, keep |
| Duplicate-per-source protection | Unchanged, keep |
| Manual review before group creation | **Replaced** by auto-create + review after |
| `findSimilarGroups` duplicate guard | Keep, moves to the after-the-fact review |
| Public copy | **Rewrite** per §8 |
| Tester fields, time zone, manage token | **New** |
| Auto-scheduling of the default window | **New** |
| Notification on group creation | Built — needs SMTP credentials to actually send |
| Calls On/Off, group-admin appointment, organiser review | **New** — see 9b |
| Outreach records, history, duplicate + do-not-contact warnings | **New** — hand-written copy; AI generation deferred |

## 9b. Who administers a community group

One field is authoritative. The other two are supporting, and writing either
without the other is what previously produced a group that had an admin by one
definition and not another.

| | Meaning |
|---|---|
| `groups.groupAdminId` | **Source of truth.** Who administers this group. |
| `groups.createdBy` | Provenance — who created it. For an auto-created group, the staff member who set up the demand source. Not authority. |
| `memberships` doc, `role: "admin"` | The index `GroupAdminDashboard` queries. Written alongside `groupAdminId`, never alone. |

`POST /api/admin/groups/[id]/admin` is the only writer of both, and it also adds
the person to `memberIds` because the Firestore rules gate group reads on that.
It never touches `callsEnabled`.

Activation and the account-claim path also write `memberships` documents with
`role: "member"`, or a group created from demand appears empty to its own admin.

### Organiser interest → appointment

Ticking the organiser box on the waitlist form grants nothing. Four things are
stored separately because they collapse into each other otherwise:

```
organiserStatus      new | reviewing | contacted | interested |
                     verification_needed | verified | not_suitable |
                     declined | approved
claimsToRunSource    they SAY they run the external community
claimVerified        somebody checked
groups.groupAdminId  actual authority
```

`claimsToRunSource` is an unverified assertion by a stranger. The admin panel
labels it as such, and **appointment is disabled until `claimVerified` is set**.

Appointment additionally requires an Operator account on that email address —
authority attaches to a uid, and a volunteer who has not signed up has none. The
panel says which precondition is missing rather than showing a dead button.

Review state lives on the waitlist entry, not a separate collection: the entry
already holds the person, their community and their attribution.

## 10. Integration still required — calls must respect the flag

**The `callsEnabled` flag is stored and enforced everywhere this codebase
controls, but this codebase does not place calls.**

Whatever runs scheduled group calls — the mobile app, or a Cloud Function —
must read `callsEnabled` on the group document and skip any group where it is
`false`. Until it does, a group created automatically will have a stored
schedule, `callsEnabled: false`, and calls that still run.

The check is one condition:

```
if (group.callsEnabled !== true) return;   // skip: calls paused
```

Fields written on the group document:

```
callsEnabled       boolean   — false on automatic creation
callsPausedReason  string    — awaiting_group_admin | admin_paused | group_admin_paused
groupAdminId       string?   — null until an organiser is appointed
callsEnabledAt     timestamp
callsPausedAt      timestamp
callsUpdatedBy     uid
```

## 11. Open items

- **SMTP credentials** — the sending layer is built (docs/email-setup.md);
  nothing actually reaches a registrant until the Google Workspace variables are
  set in Vercel.
- **Default community threshold** — 20 was the figure discussed; currently set
  low for testing and editable per source in the dashboard.
- **AI comment generation — deferred, not launch-blocking.** Outreach records,
  history, duplicate-destination and do-not-contact enforcement, templates and
  mark-as-posted are all built and usable by hand. A generator would only ever
  populate the existing `generatedText` field on an outreach record, behind the
  same UI and the same route, so adding one later changes no data model and no
  downstream code. There is no AI SDK or provider dependency in the project.
