# Operator Calling — Community Demand, Waitlist, Outreach and Group Creation System

## Instruction to the AI coder

Build this feature into the existing Operator Calling website and admin dashboard.

Do not create a separate standalone application, duplicate the existing group system, or replace existing authentication, database, UI, routing or deployment patterns. First inspect the current codebase and identify:

- How groups are currently stored and created
- Existing admin permissions and dashboard components
- Existing website routing and public page layouts
- Existing Firebase, database, analytics and server-side conventions
- Existing form validation, rate limiting and email handling
- Existing design system and reusable UI components

Reuse the current architecture and naming conventions wherever practical.

The public product may be described as **Operator Calling** or **the Operator app**, available through **operatorcalling.com**. Use the product name already used consistently in the current website rather than introducing a conflicting brand name.

---

# 1. Product concept

Operator Calling is for people who enjoy talking on the phone with new people.

It is focused on scheduled one-to-one voice calls. Users do not need to search for people, build a friends list, send connection requests or arrange each conversation themselves.

When a user makes themselves available for a scheduled calling period, an inbound call can come to them through Operator. Operator finds another suitable available person and makes the connection.

The central idea is:

> The operator makes the call, so you do not have to.

Operator can help people who already share an interest through a forum, group, discussion, social media page or other online audience move beyond written messages and have optional one-to-one voice conversations.

Operator is a separate service. It is not installed in, embedded within or technically integrated with the website or platform where the interest originated. The original platform continues operating normally.

People register separately with Operator and, if enough demand exists for that subject or audience, a corresponding group can be created within the existing Operator website.

Calls take place through Operator without users exchanging phone numbers.

---

# 2. Core business flow

The existing Operator website already supports groups.

Do not immediately create a new Operator group whenever an outreach source is added.

A group should normally be created only after sufficient demand has been demonstrated through the waitlist.

Use the following flow:

```text
External platform, discussion, topic or audience
        ↓
Tracked waitlist link
        ↓
Visits and waitlist registrations
        ↓
Demand measured for the proposed Operator group
        ↓
Demand threshold reached
        ↓
Authorised Operator staff review the demand
        ↓
Existing Operator group is created or linked
        ↓
Interested people can be invited when the group is ready
```

The threshold should create a **reviewable recommendation**, not automatically publish a live group unless the existing system already has an approved automated workflow.

An authorised Operator user should make the final decision.

---

# 3. Important terminology

## Public terminology

Avoid overusing the word **community**.

Depending on the source, use natural wording such as:

- People interested in this topic
- People from this group
- People following this discussion
- People with this shared interest
- Members of this forum
- People interested in `[topic]`
- This audience
- This calling group

Avoid using **admin** as the default public term.

Use **organiser** for someone who may help:

- Choose suitable calling times
- Help schedule calling sessions
- Help coordinate participation
- Help establish the calling group
- Help look after the group within Operator

## Internal terminology

Technical and permission-related code may still use terms such as:

- `admin`
- `administrator`
- `communityAdminInterest`
- `groupAdmin`

where these already exist in the project.

Do not rename established internal permission concepts merely for public wording.

---

# 4. Relationship and independence rules

A tracked link is an attribution mechanism only.

It does not mean that the referenced forum, group, platform, discussion owner or organiser has:

- Approved Operator
- Partnered with Operator
- Installed Operator
- Integrated Operator
- Officially adopted Operator
- Authorised the outreach

Do not imply any of these unless the relationship has been explicitly verified and manually recorded by an authorised Operator user.

The AI-generated outreach copy must not pretend that the person posting:

- Is an established member when that is not known
- Has personally used Operator when that is not known
- Represents the destination group
- Has permission from the destination platform
- Is speaking on behalf of its organisers

No fake testimonials, fake personal stories or fake endorsements may be generated.

---

# 5. Existing groups integration

The website already has groups. Integrate demand and waitlist records into that system.

Do not create a second independent group collection unless the current architecture genuinely requires one.

Before demand is approved, use a separate lightweight record representing the possible future group or audience demand.

Suggested conceptual name:

```text
groupDemandSource
```

Alternative names may be used to match the existing project:

```text
audienceCandidate
proposedGroup
waitlistAudience
groupDemand
```

Each demand source may later link to an existing Operator group.

Suggested fields:

```text
id
platformId
sourceName
sourceType
topicName
sourceUrl
publicDisplayName
publicAudienceLabel
description
internalNotes
postingRules
relationshipStatus
status
groupId
demandThreshold
uniqueVisitCount
signupCount
organiserInterestCount
conversionRate
thresholdReachedAt
reviewedAt
reviewedBy
createdAt
createdBy
updatedAt
```

Suggested status values:

```text
researching
active_waitlist
threshold_reached
under_review
approved_for_group
group_created
linked_to_existing_group
paused
rejected
archived
do_not_contact
```

`groupId` should remain empty until:

- A new Operator group is created, or
- The demand source is linked to an existing Operator group

Once linked, the dashboard should retain the original attribution and outreach history.

---

# 6. Demand threshold logic

Support a configurable demand threshold.

The threshold may initially be based on waitlist registrations, for example:

```text
minimumWaitlistSignups
```

Also support future use of:

```text
minimumUniqueVisitors
minimumOrganiserInterest
minimumConversionRate
```

The first implementation can use a single primary signup threshold if that is simpler.

Thresholds may be:

- A global default
- Overridden for a particular demand source
- Changed by authorised Operator staff

When the threshold is reached:

1. Set the source status to `threshold_reached`.
2. Record `thresholdReachedAt`.
3. Show it prominently in the admin dashboard.
4. Create an internal review task or notification using the existing system.
5. Allow an authorised user to:
   - Create a new group using the existing group creation flow
   - Link to an existing group
   - Increase the threshold
   - Keep collecting interest
   - Pause the source
   - Reject or archive it

Do not automatically create duplicate groups.

Before creating a group, search or check for similar existing groups by:

- Name
- Topic
- Slug
- Keywords
- Existing linked sources

Warn the admin when a likely duplicate exists.

---

# 7. Platforms, audiences and places posted

Use a flexible hierarchy:

```text
Platform
  └── Audience or demand source
       └── Outreach records
            └── Visits and waitlist registrations
```

Example platforms:

- Reddit
- Facebook
- Discord
- Discourse
- Other forum
- WhatsApp
- X
- LinkedIn
- Email
- Private message
- Other

An audience or source may be:

- A subreddit
- A Facebook group
- A forum
- A forum category
- A discussion thread
- A Discord server
- A social media page
- A specific topic
- A post
- A comment thread
- A private conversation
- A general shared interest

Do not force every source to be described as a formal community.

---

# 8. Source records

Each source record should support enough information to drive attribution and public wording.

Suggested fields:

```text
id
platformId
sourceName
sourceType
topicName
sourceUrl
publicDisplayName
publicAudienceLabel
publicDescription
internalNotes
postingRules
relationshipStatus
status
groupId
createdAt
createdBy
updatedAt
lastPostedAt
```

Suggested `sourceType` values:

```text
forum
forum_section
group
server
subreddit
social_page
discussion
post
comment
private_message
topic
general_audience
other
```

Suggested `relationshipStatus` values:

```text
unverified
independent_interest
organiser_contacted
organiser_interested
organiser_verified
officially_supported
partnered
```

Default:

```text
unverified
```

Changing the relationship status must require an authorised user.

It must not be inferred from traffic, registrations, pasted discussions or AI output.

---

# 9. Tracked waitlist links

Each tracked link should use a short opaque source code.

Example:

```text
https://operatorcalling.com/waitlist?s=K7P4MX
```

The code is an attribution identifier, not an authentication token.

Do not expose all source details in the URL.

Do not use sequential IDs.

Each tracked link should resolve server-side to:

```text
platform
demand source
specific outreach record
waitlist page configuration
relationship status
public audience label
future or existing group link
```

Suggested tracked-link fields:

```text
id
sourceCode
platformId
demandSourceId
outreachId
groupId
formType
status
createdAt
createdBy
firstUsedAt
lastUsedAt
totalVisitCount
uniqueVisitCount
signupCount
organiserInterestCount
```

Suggested status values:

```text
active
paused
expired
archived
```

A link may be reused when the admin wants overall source-level tracking.

A new link should be created when separately tracking:

- A new post
- A new comment
- A private message
- A different conversation
- A different date
- A different outreach style
- A different organiser contact attempt

---

# 10. Admin dashboard — places posted and source links

Create a searchable **Places Posted**, **Outreach Sources** or similarly named section in the existing admin dashboard.

The exact title should fit the current dashboard terminology.

Each row or card should show:

```text
Platform
Source or audience name
Topic
Source URL
Tracked waitlist URL
Linked Operator group, if any
Status
Relationship status
Total visits
Unique visits
Waitlist registrations
Organiser-interest registrations
Conversion rate
Demand threshold
Threshold progress
Date first posted
Date last posted
Notes
```

Each row should provide clear actions:

```text
Copy waitlist link
Copy source link
Open source
Create comment
Create private message
Create new tracked link
View outreach history
View registrations
Review demand
Create group
Link existing group
Edit
Pause
Archive
```

Only show **Create group** when permitted by the current user’s role.

Copy actions must show visible confirmation such as:

```text
Copied
Link copied
Comment and link copied
```

---

# 11. Search, filters and sorting

Search should cover:

```text
platform
source name
topic
public audience label
source URL
notes
posting rules
tracking code
outreach text
destination post URL
linked group name
```

Filters should include:

```text
platform
source type
status
relationship status
threshold reached
group created
not linked to a group
has registrations
has organiser interest
recently posted
not posted recently
public comment
private message
```

Sorting should include:

```text
most registrations
most visits
best conversion
closest to threshold
threshold reached first
most organiser interest
most recent outreach
oldest outreach
source name
```

---

# 12. Outreach records

Every prepared or completed outreach action should have a record.

Suggested fields:

```text
id
platformId
demandSourceId
sourceLinkId
groupId
type
destinationUrl
destinationTitle
pastedConversation
generatedText
editedFinalText
generationSettings
postedBy
postedAt
status
createdAt
updatedAt
```

Suggested types:

```text
public_comment
new_post
private_message
organiser_message
general_link_share
social_share
```

Suggested statuses:

```text
draft
generated
copied
posted
archived
```

The history should allow authorised staff to see:

- What was previously written
- Where it was posted
- Which link was used
- Who prepared or posted it
- When it was posted
- Which outreach produced visits and registrations
- Whether the same destination has already been contacted

Show a warning when:

- The same destination URL has already been used
- The same discussion has already received an Operator link
- The source is marked `do_not_contact`
- Posting rules may prohibit promotion or external links
- Outreach was made very recently

Do not automatically post to external platforms.

The system prepares content and copies it. A human decides whether and where it is posted.

---

# 13. Casual outreach comment generator

Add a **Create Comment** feature.

The authorised user can optionally paste:

- A forum post
- Another person’s comment
- Part of a discussion
- A message
- A question they want to answer
- A description of the context

The generator should create a short response that sounds like a normal member of the public.

It must not sound like:

- A corporate announcement
- A sales advert
- A marketing agency
- A chatbot
- A press release
- A scripted brand account

The generated response should address the discussion first.

Operator should be mentioned only where relevant, with the tracked link acting as supporting information rather than the sole purpose of the reply.

Default style:

- Casual
- Brief
- Natural
- Plain UK English
- Not overly polished
- Not overenthusiastic
- Not full of product language
- Normally one to four short sentences
- No hashtags by default
- No emojis by default

Avoid phrases such as:

```text
We are excited to announce
Revolutionary platform
Transform your community
Amazing opportunity
Join us today
Sign up now
Discover the future
Unlock meaningful connections
This is perfect for your community
```

Prefer natural wording such as:

```text
This might be useful for people who prefer actually talking rather than just messaging.
```

```text
There’s something being tested for one-to-one voice calls around shared interests. You make yourself available and the call comes to you, rather than having to find someone yourself.
```

```text
It’s separate from this site, but there’s a page here for people who might be interested.
```

```text
The idea is that Operator finds someone suitable and makes the call, so you don’t have to arrange it yourself.
```

Do not deliberately vary wording merely to disguise repeated spam.

The system should encourage relevant, honest outreach only.

---

# 14. Outreach generation controls

Provide controls such as:

```text
Generate
Regenerate
Make shorter
Make more casual
Make less promotional
Make more direct
Remove company-style wording
Write as a reply
Write as a standalone post
Write to an organiser
Write as a private message
Explain the inbound-call idea
Focus on people who like phone calls
```

Allow manual editing before copying.

Provide buttons:

```text
Copy comment
Copy link
Copy comment and link
Save draft
Mark as posted
```

When copying comment and link:

- Do not add the link twice
- Preserve the user’s edited wording
- Save the copied version where practical
- Update the outreach status to `copied`
- Do not mark it `posted` automatically

---

# 15. Structured AI input

Send structured server-side context to the AI.

Example:

```json
{
  "platform": "Reddit",
  "sourceName": "Example subreddit",
  "sourceType": "subreddit",
  "topicName": "Talking with new people",
  "sourceDescription": "People discussing ways to meet and speak to others",
  "postingRules": "No repetitive promotion",
  "relationshipStatus": "unverified",
  "outreachType": "public_comment",
  "conversationText": "Pasted post or comment",
  "productDescription": "Operator Calling is a separate app for people who like talking on the phone with new people. It focuses on scheduled one-to-one voice calls. Users do not need to search for people or arrange calls. They make themselves available and Operator finds another suitable person and places the inbound call. Phone numbers are not exchanged.",
  "trackedUrl": "https://operatorcalling.com/waitlist?s=K7P4MX",
  "requestedStyle": "casual, natural, brief, non-promotional UK English"
}
```

Use a server-side AI call.

Never expose API keys or privileged prompts in the frontend.

Rate-limit generation requests.

Log enough metadata for debugging and moderation without storing unnecessary sensitive content.

---

# 16. AI system prompt for outreach copy

Use a system prompt similar to:

```text
Write a short, casual response that sounds like a normal member of the public.

Respond to the pasted conversation first. Mention Operator Calling only where it is genuinely relevant.

Operator Calling is a separate app for people who like talking on the phone with new people. It focuses on scheduled one-to-one voice calls. The user does not have to search for people, build a friends list or arrange the call. They make themselves available and Operator finds another suitable person and places the inbound call. Phone numbers are not exchanged.

Include the supplied tracked link naturally when a link is appropriate.

Do not sound corporate, promotional, polished, automated or overenthusiastic.

Do not use marketing clichés, fake personal experiences, fake endorsements, hashtags or emojis.

Do not claim that the writer has used the service unless that fact was supplied.

Do not claim that the destination forum, group, organiser or platform has approved or partnered with Operator unless the relationship status explicitly permits that claim.

Use natural UK English.

Return only the proposed comment.
```

---

# 17. Public waitlist page objective

The tracked waitlist page may be the first time the visitor has heard of Operator.

Before arriving, the visitor may know only that they clicked a link in a post, comment, message or social share.

The page must therefore explain very quickly:

1. What Operator Calling is
2. That it is for people who enjoy one-to-one phone-style conversations with new people
3. That users do not need to find or approach someone themselves
4. That calls arrive through Operator during scheduled availability
5. That Operator makes the connection
6. That phone numbers are not exchanged
7. That the originating website or group remains separate
8. That registering only records interest
9. That enough interest may lead to an Operator group being created

Keep the page brief.

It should not feel like a long corporate landing page.

The registration form should remain the main focus.

---

# 18. Public waitlist page content

Use wording in this style.

The exact final wording should match the current website design and brand voice.

## Recommended headline

```text
Like talking on the phone with new people?
```

## Recommended introductory copy

```text
Operator Calling is built around scheduled one-to-one voice calls.

You do not need to search for people, send connection requests or arrange the call yourself. Make yourself available and, when a suitable call is scheduled, Operator makes the connection and the call comes to you.
```

## Supporting copy

```text
It is a separate service from the website, group or discussion where you found this link. Calls take place through Operator without anyone sharing their phone number.
```

## Audience-specific registration line

```text
Register your interest in talking with people interested in [Public Audience Label].
```

## Demand explanation

```text
When enough people register, an Operator calling group may be created for this interest.
```

## Optional product line

```text
The operator makes the call, so you do not have to.
```

This line may be used as:

- A short strapline
- A supporting sentence
- A highlighted callout

Do not repeat it excessively.

---

# 19. Alternative compact public copy

For layouts requiring less text:

```text
Like talking on the phone with new people?

Operator Calling arranges scheduled one-to-one voice calls around shared interests. You make yourself available and the call comes to you — no searching for people, no arranging it yourself and no sharing phone numbers.

Register your interest in talking with people interested in [Public Audience Label].

When enough people are interested, an Operator calling group may be created.
```

Small disclaimer:

```text
Operator is a separate service. A reference to another website, group or discussion does not mean its owners or organisers have approved or partnered with Operator.
```

---

# 20. Dynamic public wording

Do not always insert a formal group name.

Use a calculated:

```text
publicAudienceLabel
```

Examples:

```text
live poker
home solar installations
local history
people following this discussion
members of this forum
this Facebook group
people interested in talking with new people
```

Natural sentence examples:

```text
Register your interest in talking with people interested in live poker.
```

```text
Register your interest in one-to-one calls with other people following this discussion.
```

```text
Register your interest in talking with people from this group.
```

```text
Register your interest in talking with people who share this interest.
```

Fallback:

```text
people who share this interest
```

Do not automatically add words such as:

```text
official
partner
approved
members
community
```

unless accurate.

---

# 21. Relationship-aware disclaimer

For `unverified`, `independent_interest` and `organiser_contacted`:

```text
Operator is a separate service. This reference does not mean that the website, group or its organisers have approved or partnered with Operator.
```

For `organiser_interested` or `organiser_verified`:

```text
Operator is being explored as a separate calling option for people interested in this topic or group.
```

Do not use **official** unless explicitly recorded.

For `officially_supported`:

```text
The organisers are supporting or exploring Operator as a separate calling option.
```

Only `partnered` may be described as a partnership.

---

# 22. Waitlist form

The public page must work without requiring an account or login.

Minimum fields:

```text
email
optionalDisplayName
interestedInOrganising
privacyConsent where required
```

Recommended public labels:

```text
Email address
Name or username (optional)
```

Organiser checkbox:

```text
I may be interested in helping organise or schedule calls for this group.
```

Use a more neutral fallback when no group yet exists:

```text
I may be interested in helping organise or schedule calls around this interest.
```

Submit button:

```text
Join the waitlist
```

Ticking the organiser box must only record interest.

It must not:

- Create an account
- Assign permissions
- Create a group
- Verify the person
- Imply they represent the original website or group

---

# 23. Public confirmation state

After submission, show a clear confirmation.

Example:

```text
You’re on the waitlist.

We’ll keep your interest linked to [Public Audience Label]. If enough people are interested and a calling group is created, we can let you know.
```

For organiser interest:

```text
You also said you may be willing to help organise the calls. This does not create an organiser account; the Operator team may contact you separately.
```

Do not promise that a group will definitely be created.

---

# 24. Share buttons on the waitlist page

Add a visible **Share this** section after the main form or confirmation state.

Support the major practical sharing destinations:

- Facebook
- X
- Reddit
- WhatsApp
- LinkedIn
- Email
- Copy link
- Native device share where supported

Use the Web Share API on supported mobile devices:

```javascript
navigator.share(...)
```

Provide normal share links as fallbacks.

Examples of share targets may use the standard share URL patterns for each platform.

Do not require platform API credentials merely to open standard share-composer links.

If a destination needs additional setup or the implementation is not ready:

- Display a clearly marked placeholder button
- Disable it safely
- Add a developer TODO
- Do not make the button appear functional when it is not

Suggested default share text:

```text
This might interest people who like one-to-one voice calls around [Public Audience Label]. You make yourself available and Operator arranges the call.
```

The shared URL should normally be the same tracked waitlist URL so onward sharing remains attributed to the original source.

However, record that the visit came through a share action where possible.

Suggested approach:

```text
original source code
+
share channel
```

For example, preserve `s=K7P4MX` and add a non-sensitive share parameter:

```text
/waitlist?s=K7P4MX&share=whatsapp
```

Do not create a new demand source merely because the link was shared.

Optionally create a child share-attribution record when useful.

Track share button clicks separately from confirmed external posts.

Never claim that a share completed successfully unless the platform or browser provides a reliable success signal.

---

# 25. Share analytics

Track:

```text
shareButtonClicks
shareChannel
shareClickedAt
sourceCode
demandSourceId
outreachId
```

Suggested share channels:

```text
native
facebook
x
reddit
whatsapp
linkedin
email
copy_link
```

Do not record private message content.

Do not treat a share-button click as a waitlist signup.

Show share counts in analytics where useful, but keep demand based primarily on valid waitlist registrations.

---

# 26. Waitlist attribution flow

When a visitor opens:

```text
/waitlist?s=SOURCE_CODE
```

the server should:

1. Validate the source code.
2. Resolve the platform, demand source and outreach record.
3. Resolve the public audience label.
4. Resolve the relationship disclaimer.
5. Load the correct waitlist form configuration.
6. Record the visit.
7. Exclude admin previews and known internal testing where practical.
8. Preserve attribution during the session.
9. Save attribution with the registration.
10. Update aggregate counters atomically.
11. Recalculate threshold progress.
12. Trigger the threshold-review state when appropriate.

Do not trust platform, audience, group or relationship values sent by the browser.

Resolve them from the source code on the server.

If the source code is invalid, expired or archived:

- Show a friendly general Operator waitlist
- Do not expose a technical error
- Do not name an unverified source
- Record the failure safely for debugging

---

# 27. Attribution persistence

Use first-party storage only where needed.

Possible approaches:

- Secure first-party cookie
- Session cookie
- Local storage as a fallback
- Server-side session

Follow the website’s existing privacy and consent architecture.

Preserve:

```text
sourceCode
demandSourceId
outreachId
shareChannel
landingPage
firstSeenAt
```

Do not allow persisted attribution to overwrite a newer explicit tracked link without a clear rule.

Recommended attribution rule:

- An explicit valid tracked link takes precedence
- Keep first-touch and latest-touch attribution when practical
- Save the actual source used for the final signup

---

# 28. Registration data

Resolve attribution server-side and save:

```text
email
normalisedEmail
optionalDisplayName
interestedInOrganising
sourceCode
platformId
demandSourceId
outreachId
groupId
sourceType
relationshipStatusAtSignup
shareChannel
createdAt
referrer
landingPage
```

Avoid unnecessary personal data.

Prevent duplicate registrations for the same normalised email and demand source.

On duplicate submission:

- Update the existing record safely where appropriate
- Preserve the earliest registration date
- Update organiser interest from false to true if newly selected
- Do not create inflated signup counts
- Show a normal confirmation rather than exposing database behaviour

---

# 29. Organiser-interest management

Create an organiser-interest view in the admin dashboard.

Suggested fields:

```text
email
displayName
demandSourceId
groupId
sourceCode
outreachId
interestStatus
claimedRelationship
verificationStatus
contactNotes
createdAt
updatedAt
```

Suggested statuses:

```text
new
reviewing
contacted
interested
verification_needed
verified
not_suitable
declined
approved
```

Distinguish between:

- Someone willing to help organise Operator calls
- Someone claiming to run the external group
- A verified organiser of the external group
- An authorised organiser within Operator

These are not the same.

No permissions should be granted until the existing review and verification process has completed.

---

# 30. Analytics

Track and display:

```text
total visits
unique visits
waitlist registrations
organiser-interest registrations
conversion rate
threshold progress
registrations by platform
registrations by demand source
registrations by outreach record
registrations over time
share-button clicks
shares by channel
group creation outcome
```

Show both:

```text
Total performance for the possible group
Performance of each individual post, comment or message
```

Do not count:

- Admin dashboard previews
- Known automated health checks
- Obvious bots where reasonably detectable
- Duplicate signups as new demand

Use aggregate counters for dashboard speed while retaining enough event data for reporting and debugging.

Use transactions or atomic increments where appropriate.

---

# 31. Suggested collections or tables

Adapt names to the existing project.

Do not duplicate an existing collection that already serves the same purpose.

Possible structure:

```text
platforms
groupDemandSources
sourceLinks
outreachRecords
waitlistEntries
organiserInterests
sourceVisits
shareEvents
groups
```

The existing `groups` model remains the source of truth for actual Operator groups.

`groupDemandSources` represents demand before group creation and links to `groups` later.

---

# 32. Permissions and security

Only authorised Operator staff may:

- Create or edit source records
- Generate tracked links
- Generate AI comments
- See registration emails
- View outreach history
- Change relationship status
- Review threshold alerts
- Create or link groups
- Archive records

Public users may only:

- Open a valid waitlist link
- Submit the waitlist form
- Use share controls

Use server-side validation for all submissions.

Rate-limit:

- Waitlist registrations
- Visit event creation where necessary
- AI-generation requests
- Repeated share event calls

Protect against:

- Sequential source-code guessing
- Counter manipulation
- Duplicate signups
- Script injection in pasted discussions
- Prompt injection through pasted outreach context
- Unauthorised relationship-status changes
- Unauthorised group creation
- Exposure of admin notes
- Exposure of registration emails

Treat pasted conversation text as untrusted data.

The AI prompt must clearly separate instructions from pasted content.

Do not allow pasted content to override the system prompt.

---

# 33. Privacy and compliance

Use the existing website privacy policy and consent system.

The public page should make clear that:

- Joining records their interest
- Their email may be used to notify them about this Operator calling group
- Organiser interest may result in separate contact
- The external website or group does not automatically receive their details

Do not send registrant data to the source platform.

Avoid collecting unnecessary:

- User-agent details
- IP addresses
- Message content
- External usernames

Only collect or retain these where there is a documented operational need and the existing privacy policy supports it.

---

# 34. User experience requirements

The page should feel:

- Simple
- Human
- Focused on talking
- Focused on inbound one-to-one calls
- Easy to understand without prior knowledge
- Separate from the originating platform
- Not corporate
- Not like a conventional social network
- Not like users must build a profile and search for friends

The most important idea to communicate is:

```text
You make yourself available. Operator finds someone suitable and the call comes to you.
```

Do not present the product primarily as:

- A forum add-on
- A community-management platform
- A group-chat product
- A friend-finding directory
- A dating service
- A conventional phone-number exchange service

---

# 35. Accessibility and responsive design

Use the existing design system.

Ensure:

- Mobile-first layout
- Accessible labels
- Keyboard operation
- Proper focus states
- Sufficient contrast
- Clear form errors
- Screen-reader-friendly share controls
- No reliance on colour alone
- Copy confirmation is announced accessibly
- Disabled placeholder buttons explain why they are unavailable

---

# 36. Testing requirements

Add tests covering:

## Tracking

- Valid source code resolves correctly
- Invalid code falls back safely
- Archived code shows a friendly state
- Source values cannot be forged by the browser
- Admin previews do not increment public counters
- Share parameters do not replace the original source

## Waitlist

- Guest can register without an account
- Required fields validate
- Duplicate email for the same demand source does not inflate demand
- Organiser interest can be added later
- Attribution is retained
- Confirmation page shows correct public label
- Unverified sources show the correct disclaimer

## Demand threshold

- Signup counters update atomically
- Threshold progress is correct
- Threshold is triggered only once
- Repeated duplicate submissions do not trigger it
- Creating a group links the demand source
- Linking an existing group does not create a duplicate
- Similar-group warning appears

## Outreach

- Comment generation uses the correct tracked link
- Pasted text cannot override the system prompt
- Generated text remains editable
- Copy comment and link does not duplicate the URL
- Marking as copied does not mark as posted
- Duplicate destination warning works
- `do_not_contact` sources block or strongly warn against outreach

## Sharing

- Copy link works
- Web Share API is used where supported
- Fallback share links are correctly encoded
- Placeholder buttons are clearly disabled
- Share clicks are recorded without storing private share content
- Share clicks do not count as registrations

## Permissions

- Public users cannot access admin records
- Non-authorised staff cannot view emails
- Only authorised roles can change relationship status
- Only authorised roles can create or link groups

---

# 37. Acceptance criteria

The feature is complete when an authorised Operator user can:

1. Add or select a platform.
2. Add a possible audience, topic or source without creating an Operator group.
3. Enter its source URL, public audience label, notes and posting rules.
4. Create a tracked waitlist link.
5. Copy the waitlist link or source link.
6. Search and filter places where links were posted.
7. Paste a discussion or comment into the outreach generator.
8. Generate a short casual reply that sounds like a normal person.
9. Edit and copy the reply with its tracked link.
10. Save the destination URL and mark the outreach as posted.
11. See a warning when the same destination has already been used.
12. Open the tracked page as a guest.
13. Immediately understand that Operator Calling is for scheduled one-to-one voice calls with new people.
14. Understand that the user does not have to search for someone or arrange the call.
15. Understand that Operator makes the connection and the call comes to them.
16. Understand that phone numbers are not exchanged.
17. Register an email address without creating an account.
18. Optionally express interest in helping organise calls.
19. Share the page using major social options or copy the link.
20. See the registration correctly attributed to the platform, source and outreach record.
21. See visits, registrations, organiser interest and threshold progress in the dashboard.
22. Reach the configured demand threshold without automatically creating a duplicate group.
23. Review the demand and create a group through the existing group system.
24. Link the demand source to an existing group instead where appropriate.
25. Retain all source, outreach and registration history after the group is created.
26. Confirm that no external platform is described as approving or partnering with Operator unless manually verified.
27. Confirm that the system never posts externally without a human action.

---

# 38. Implementation output required from the AI coder

Before coding, report:

- The relevant existing files and components found
- How current groups are stored and created
- How this feature will connect to the existing group system
- The proposed database changes
- The proposed routes, APIs or server functions
- Any security-rule changes
- Any environment variables required
- Any assumptions

Then implement in clear stages.

After implementation, report:

- Files created
- Files changed
- Database migrations
- Indexes required
- Security rules changed
- Environment variables added
- Tests added
- Manual setup still required
- Placeholder social-share buttons still needing configuration
- Deployment steps
- Rollback considerations
- Known limitations

Do not stop after producing mock UI.

Complete the functional data flow from:

```text
tracked link
→ public waitlist page
→ registration
→ attribution
→ demand threshold
→ authorised review
→ existing Operator group creation or linking
```
