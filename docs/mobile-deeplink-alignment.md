# Mobile Deep Link Alignment

This captures the cross-repo contract between:
- Web app: `operator-calling`
- Mobile app: `/Users/jules/Projects/operator`

## Confirmed Mobile Entry Points

From mobile implementation:
- QR invite web handoff is generated and consumed through `operatorcalling://invite?token=...&type=...`
- QR invite source and fallback URLs are managed in mobile QR pages/services.

## Mobile Destinations Beyond Invite

The mobile app currently routes most "deep-link-like" opens via push/call payloads rather than URL schemes:
- `operator_call`
- `auto_call_invite`
- `auto_call_paired`
- `observer_call`
- `group_call_invite`
- `group_call_scheduled`
- `contact_joined`
- `friend_request_accepted`
- `group_request_accepted`

## Alignment Decisions

1. Keep `operatorcalling://invite` as the only public URI entry point in this phase.
2. Treat call/open destinations as app-internal payload destinations, not browser URLs.
3. Keep invite `type` enum shared with QR APIs and mobile parsing.
4. Keep token handling server-validated (`/api/qrinvite/validate` and `/api/qrinvite/complete`).

## Next Phase (if URI expansion needed)

If we add URI destinations beyond invite, define a versioned URI contract first:
- `operatorcalling://call/...`
- `operatorcalling://group/...`
- `operatorcalling://notification/...`

Then update both repos in lockstep:
- Web generator/parsers in `operator-calling`
- Flutter URI parser and route resolution in `/Users/jules/Projects/operator`
