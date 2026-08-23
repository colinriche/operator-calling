# The waitlist page: three modes, one source of truth

`/waitlist?s=CODE` renders one of three quite different pages. Everything on it
— heading, artwork, the wording of the form, the `og:title`, the generated
preview image — is derived from a single object built by
`lib/waitlist/presentation.ts`.

## Why it works this way

The page used to hold its own hard-coded headline while `metadata` held its own
hard-coded title. They were only ever the same by coincidence, and once a
tracked link started carrying a topic they stopped being the same at all: the
page said "live poker" and the link preview said "Join the waitlist".

There is now one function, `buildWaitlistPresentation(context)`, and four
callers:

| Caller | File |
| --- | --- |
| The page | `app/waitlist/page.tsx` |
| The Open Graph tags | `generateMetadata` in the same file |
| The preview image | `app/api/og/waitlist/route.tsx` |
| The admin preview | `components/admin/WaitlistPagePanel.tsx` |

`presentation.ts` is client-safe on purpose — pure functions, no
`firebase-admin`, no `next/headers` — which is what lets the admin panel preview
an unsaved edit by running the real code rather than a mock-up of it.

The invariants worth knowing, all covered by `tests/waitlist-presentation.test.ts`:

- `og.description` **is** `lead`, the page's opening paragraph, verbatim.
- `og.title` is `heading`, optionally with the source line the page prints
  directly above it. Nothing is written specially for the preview.
- The community-naming rule is applied once, so a source that may not be named
  on the page cannot be named in the title or the image either.

`generateMetadata` and the render are two passes over one request, so
`resolveWaitlistContext` is wrapped in React's `cache()`. Without it they would
each resolve the source separately, and an edit landing between the two would
produce a page whose own tags described a different page.

## Two independent axes

A page is described by two stored fields, and they answer different questions.

**`waitlistMode`** — the *shape* of the page: global, community or family.

**`connectionType`** — its *register*: do these people already know each other?

- `shared_interest` — interests, hobbies, sports, supporters, communities. The
  pitch is that you never have to find anyone: tell us when you're available and
  a call gets scheduled.
- `existing_connections` — a family, a year group, an old team, former
  colleagues. These people can already reach each other. What they have lost is
  the everyday reason to: the shared job, the school run, the club night. When
  that goes, the relationship drifts into messages and social-media reactions
  even though it still matters. The pitch is that **The Operator** decides when
  it is time and occasionally brings two members together.

They are separate because the arguments are not interchangeable. Telling a group
of former colleagues they will be matched with "others who share an interest"
describes something they did not sign up for, and telling strangers they are
keeping in contact with people they know is a false promise. Tests enforce that
neither vocabulary leaks into the other's page.

### The Type 1 register

Type 1 copy must never put the visitor in the scheduler's seat or read like a
standing commitment — that turns something occasional and welcome into an
obligation. A test bars these outright across every Type 1 string, bullets
included:

> "arrange every call yourself" · "remember to make the call" · "people who
> already know each other" · "schedule a call between you" · "proper voice call"
> · "when your availability overlaps" · "appointment" · "meeting"

This is also why the Type 1 bullets differ. The availability bullet says who
decides rather than asking when you're free, and the privacy bullet offers the
control that actually matters here — in a group where everyone already has
everyone's number, "nobody exchanges phone numbers" is not the reassurance
being sought; "you choose who you'd rather not be connected with" is.

`connectionType` defaults to `shared_interest` — deliberately the weaker of the
two claims, so an unset or unrecognised value can never overclaim a
relationship. A family page is `existing_connections` by definition, whatever is
stored on it, since that is what a family is.

## The three modes

Stored on the demand source as `waitlistMode`.

### `global`

Operator branding, talking-to-new-people wording, no shared interest anywhere.

This matters more than it looks. The neutral fallback audience label —
`"people who share this interest"` — used to reach every unattributed page,
producing "Register your interest in talking with people interested in people
who share this interest." A global page now has no path to that string at all,
and a test asserts it.

### `community`

The topic is the heading. Above it sits the source line; below the lead sits the
independence note, above the form rather than in the fine print.

Artwork comes from a curated set in `lib/waitlist/topic-art.ts` — fourteen
pieces plus the brand mark, chosen by an admin. Deliberately not uploads: a
community page gets posted to a forum full of strangers, and "paste any image
here" turns every one of those pages into a question about who owns the picture.

Each piece is an SVG *string*, not a component, because the same artwork has to
render both in React and in the satori-rendered preview image. Both go through
`topicArtDataUri`, so the image in a link preview is the same file as the image
on the page.

### `family`

The family name is the heading. An admin may upload one hero image, which
appears at the top of the page and in the preview.

A family is the clearest case of `existing_connections`, so it uses the same
Type 1 wording as an old year group or former colleagues rather than a bespoke
variant saying the same thing differently.

No independence note: there is no third-party community to be independent of,
and the relationship-derived disclaimer would be answering a question nobody
asked, in wording that names a link the visitor never followed. Global and
family both use a neutral disclaimer instead.

## Naming the community

A community page says **"from a Facebook group"**. It says **"from Poker Players
UK, a Facebook group"** only when the source's `relationshipStatus` is one of:

- `organiser_verified`
- `officially_supported`
- `partnered`

(`NAMEABLE_RELATIONSHIP_STATUSES` in `lib/waitlist/constants.ts`.)

Below those, nobody in that community has said anything at all, and printing
their name next to an invitation reads as an endorsement they never gave. The
decision is made once, in `waitlistContextFrom`, and exposed as
`context.canNameSource`; consumers ask the flag rather than re-deriving the
rule.

Descriptors are plain text and never platform logos — reproducing a mark next to
an invitation implies that platform is behind it, and most brand guidelines say
so explicitly. `sourceDescriptor(platformId, sourceType)` in `copy.ts` maps to
"subreddit", "Facebook group", "Discord server", "online forum", "post on X" and
so on.

If a source ought to be named and isn't, change its relationship status. Do not
change the wording.

## The family hero image

Uploaded through `POST /api/admin/demand-sources/[id]/image`, removed through
`DELETE` on the same route.

**Server-side, via the Admin SDK.** Writing through `getAdminBucket()` needs no
Storage rules at all. This project's ruleset is shared with the mobile app, so a
website feature that required a rules deploy to work would be a website feature
blocked on someone else's release.

The object is saved with a `firebaseStorageDownloadTokens` metadata value and
served from the resulting `firebasestorage.googleapis.com/...?alt=media&token=`
URL. That URL is public by construction — a link-preview crawler has no account
and no way to authenticate, so an image that appears in a preview is an image
anyone can fetch.

Which is why the route **rejects an upload that does not carry
`confirmedPublic: "true"`**. The checkbox in the admin panel is the same
decision, but the server does not take the panel's word for it: a request made
any other way faces the same requirement. The acknowledgement is recorded on the
source (`heroImagePublicConfirmedAt` / `...By`), and the checkbox re-arms after
each upload, because a second image is a second decision.

Other properties of the route:

- Type is decided by sniffing magic bytes, not by the declared content type.
  Storing whatever arrives under an `image/*` label and serving it from a public
  URL is how an image upload quietly becomes file hosting.
- Each upload gets a random object name. Replacing an image must produce a new
  URL, or every crawler holding the old preview would keep serving the picture
  the admin just took down.
- `heroImageUrl` and `heroImagePath` are **not** accepted by the ordinary PATCH
  route. Accepting a URL there would be a way to put an image on a public page,
  and into every link preview, with nobody having acknowledged that it becomes
  public.
- Removal clears the document first, then deletes the object. Previews cached
  elsewhere may still show the image for a while; the admin panel says so.

## Fields on `groupDemandSources`

| Field | Meaning |
| --- | --- |
| `waitlistMode` | `global` \| `community` \| `family` |
| `connectionType` | `shared_interest` \| `existing_connections` — the page's register |
| `topicArtId` | id from the curated set; `""` means the brand mark |
| `familyName` | family mode heading |
| `heroImageUrl` | public download URL, or null |
| `heroImagePath` | Storage object path, kept so a replacement can delete the old file |
| `heroImageUploadedAt` / `heroImageUploadedBy` | who uploaded, when |
| `heroImagePublicConfirmedAt` / `heroImagePublicConfirmedBy` | who accepted that it becomes public |

## The family prompt

Every page that is not already about a family offers one extra question:

> Would you also like to use The Operator to keep your family connected?

It is strictly additive. Ticking it records `familyInterest` on the registration
and nothing else — it does not change the demand source the registration is
attributed to, or what `interestLabel` says they signed up for. Like organiser
interest, it is one-way on resubmission: a later visit can add it but never
silently withdraw it, so an unticked box cannot erase something asked for
earlier.

It is hidden on a family page, where it would be asking something the visitor
answered by arriving.

Sources that predate this field have no `waitlistMode`, which is not an error:
`resolveWaitlistMode` falls back to `community` when a tracked link resolved and
`global` when it did not, so every existing source keeps exactly the page it
already had.

## The preview image

`GET /api/og/waitlist?s=CODE` → 1200×630.

A file-convention `opengraph-image.tsx` would have been simpler, but those do not
receive search params — and the source code is a search param, so every tracked
link would have produced the same generic image.

Two deliberate soft failures, because a link with no preview is worse than a
link with a plain one:

- Fonts are fetched from Google Fonts at render time, since `next/font` keeps
  its files where satori cannot reach them. A failure costs the brand typeface
  and nothing else.
- An uploaded hero is fetched and inlined here rather than left for satori to
  fetch, so a slow or missing Storage object degrades to the brand mark instead
  of taking the whole image down.

The page stays `robots: noindex` — a tracked link is an internal attribution
tool, not something that should accumulate search results for every forum we
post in. That does not stop link-preview crawlers, which is the point.

## Changing what a page says

In `lib/waitlist/presentation.ts`, and nowhere else. Wording that appears in a
single mode lives in that mode's branch; wording shared with the relationship
logic lives in `copy.ts`. If you find yourself editing a string in a component,
the page and its link preview are about to disagree again.
