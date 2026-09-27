// ─── Opening a source URL a human typed ──────────────────────────────────────
//
// Client-safe. Admins are never required to type "https://" into a source URL
// field - "reddit.com/r/AppIdeas" is a perfectly normal thing to paste - and a
// bare domain like that is a valid relative path as far as <a href> and
// window.open are concerned. Left unnormalised, "Open source" does not open
// the source; it opens the admin's own current page with that text appended
// to the address bar. Everywhere a stored or typed source URL is opened, it
// goes through this first.

/**
 * Text a human typed, as a web address to open - or null when it is not one.
 * Only http(s) qualifies, so a pasted `javascript:` URL is never returned.
 */
export function asWebUrl(value: string): string | null {
  const v = (value ?? "").trim();
  if (!v || /\s/.test(v)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === "http:" || u.protocol === "https:"
      ? u.hostname.includes(".")
        ? u.href
        : null
      : null;
  } catch {
    return null;
  }
}
