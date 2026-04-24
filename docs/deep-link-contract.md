# Deep Link Contract (App and Website)

This document defines the supported deep-link and URL-state contract for user-facing surfaces in `operator-calling` (admin intentionally excluded).

## Web Routes

### Public / Auth

| Route | Purpose | Params | Validation | Fallback |
|---|---|---|---|---|
| `/invite` | Invite landing page | `ref`, `gid` | `ref` username charset/length; `gid` id charset/length | Ignore invalid params |
| `/signup` | Signup with invite continuity | `ref`, `gid` | same as `/invite` | Render signup without invite context |
| `/login` | Login entry + post-auth redirect | `method`, `next` | `method in {email,phone}`; `next` must be relative path | `method=email`, `next=/dashboard` |
| `/qrinvite` | QR invite web flow | `token`, `type`, `ctx`, `groupId` | `token` length/format; `type` allowlist; `ctx`/`groupId` sanitized | Show invalid/expired/used states |

### Dashboard (User)

| Route | Purpose | Params | Validation | Fallback |
|---|---|---|---|---|
| `/dashboard/groups/[id]` | Group detail operations | `tab` | `tab in {overview,schedule,settings,moderation}` | `tab=overview` |
| `/dashboard/profile` | Profile editor direct section links | `tab` | `tab in {basics,calls,privacy,notifs}` | `tab=basics` |
| `/dashboard/calls` | Calls list with URL-backed filters | `status`, `type`, `q` | status/type allowlists; search length bound | `status=all&type=all&q=""` |
| `/dashboard/notifications` | Notification center with filters | `filter`, `q` | `filter in {all,unread}`; search length bound | `filter=all&q=""` |

## Mobile Handoff URI

| URI | Purpose | Params |
|---|---|---|
| `operatorcalling://invite` | Open app and complete QR invite | `token`, `type` |

Notes:
- `token` is a bearer credential and must be treated as sensitive.
- `type` is an enum from invite types.

## Security and Validation Rules

1. Never trust URL params directly for privileged operations.
2. `token` must be server-validated against `qr_tokens` (`active`, not expired, not used).
3. `next` must be relative-only (prevent open redirects).
4. Unknown or invalid params should degrade gracefully to safe defaults, not hard-fail navigation.
5. Client URL state (tabs/filters) must not bypass auth/authorization checks.
