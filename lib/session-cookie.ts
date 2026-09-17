// ─── The signed-in marker cookie ─────────────────────────────────────────────
//
// proxy.ts decides whether /dashboard and /admin may render by whether the
// `__session` cookie exists. It never reads the value — the pages and every API
// route verify the Firebase ID token themselves — so the cookie is a marker,
// not a credential.
//
// It used to hold the ID token with max-age=3600. Firebase keeps a user signed
// in indefinitely, but after an hour the cookie vanished and the proxy sent a
// perfectly signed-in person back to the login page. Now it lives as long as a
// browser allows (Chrome caps cookies at 400 days) and is renewed every time
// Firebase reports the user signed in, so it only goes away when they sign out.
//
// Client-only.

const NAME = "__session";

/** 400 days: the longest lifetime Chrome accepts. */
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function secure(): string {
  return typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
}

export function markSignedIn(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${NAME}=1; path=/; SameSite=Lax; max-age=${MAX_AGE_SECONDS}${secure()}`;
}

export function markSignedOut(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${NAME}=; path=/; SameSite=Lax; max-age=0${secure()}`;
}
