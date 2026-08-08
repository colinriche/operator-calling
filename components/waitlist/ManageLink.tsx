"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

// The manage link is a bearer credential — anyone holding it can change that
// registration. Shown once, copyable, and never included in anything the share
// buttons produce.

export function ManageLink({ token }: { token: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const url = `${origin}/waitlist/manage?t=${encodeURIComponent(token)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked — the link is selectable on screen regardless.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="flex-1 min-w-0 text-xs font-mono text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 truncate">
        {origin ? url : "…"}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="h-9 px-3.5 rounded-lg border border-border bg-background text-sm text-foreground hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors flex items-center gap-1.5 shrink-0"
      >
        {copied ? (
          <Check className="w-4 h-4 text-primary" aria-hidden="true" />
        ) : (
          <Copy className="w-4 h-4" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? "Manage link copied to clipboard" : ""}
      </p>
    </div>
  );
}
