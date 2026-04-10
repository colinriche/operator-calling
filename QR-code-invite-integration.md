\# Vercel Website Prompt



Build the `operatorcalling.com` QR landing flow on Vercel.



\## Context

\- QR URLs arrive in this format:

&#x20; - `https://operatorcalling.com/qrinvite?token=...\&type=personal`

\- Tokens are generated on the VPS

\- Token records are stored in Firestore

\- Website is connected to Firebase Auth and Firestore/database



\## Main Goal

The website must read the short-lived token, validate it, identify the target user safely, and decide whether to:

\- complete the contact/invite flow immediately for a trusted existing user

\- or create/resume a pending flow for a new/unknown user



\## Required Behaviour



\### On `/qrinvite`

1\. Read token from URL

2\. Call backend validation endpoint

3\. Resolve target user safely

4\. Detect platform/device

5\. Detect whether trusted identity already exists

6\. Route to correct next step



\### Branch A: Trusted existing user

\- If Firebase/Auth/session/app handoff already proves identity:

&#x20; - complete add/invite with minimal friction

&#x20; - do not force full manual login page

&#x20; - show success/failure state



\### Branch B: Unknown or untrusted user

\- Do not mutate a real account yet

\- Create a pending connection record

\- Show App Store / Play Store buttons

\- Preserve token/share context through install/signup flow



\## UI States Needed

\- loading/validating

\- success

\- expired token

\- invalid token

\- app opening

\- install app

\- pending invite saved

\- resumed flow complete

\- generic failure



\## APIs To Call

\- token validation endpoint

\- complete contact/invite endpoint

\- create pending connection endpoint



\## Important Product Rule

“No full login” only applies where trusted identity already exists. Do not update arbitrary accounts purely because someone opened a token URL.



\## Output Required

Generate:

\- `/qrinvite` page

\- token parsing logic

\- token validation call

\- trusted-session detection

\- app-open attempt

\- store fallback page

\- pending-flow continuation handling

\- success/error screens

\- file-by-file production-ready code

