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

Join early access as a tester and you can start having calls now, with people
from across Operator rather than only this group.

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
| Notification on group creation | **Blocked** on an email provider |

## 10. Open items

- **Email provider** — needed for notification and for delivering manage links.
  Nothing reaches a registrant without it.
- **Default community threshold** — 20 was the figure discussed; currently set
  low for testing and editable per source in the dashboard.
- **Handing a community group to a verified organiser** — organiser interest is
  captured, but transferring group ownership (`createdBy`) is not built.
- **Email normalisation** — `colin+x@` and Gmail dot variants still count as
  separate registrations, so they inflate a threshold that now auto-creates a
  group. More consequential under this plan than the last one.
