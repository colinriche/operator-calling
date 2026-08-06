"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Share2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultShareText } from "@/lib/waitlist/copy";
import type { ShareChannel } from "@/lib/waitlist/constants";

// ─── Share this ──────────────────────────────────────────────────────────────
//
// Every destination uses its standard share-composer URL, so nothing here needs
// platform API credentials and no button has to ship disabled.
//
// The shared URL keeps the original ?s= code so onward sharing stays attributed
// to the outreach that started it, and adds &share=<channel> so we can tell
// second-hand traffic from the original post. A share never creates a new
// demand source.

interface ShareRowProps {
  sourceCode: string | null;
  audienceLabel: string;
  className?: string;
}

export function ShareRow({ sourceCode, audienceLabel, className }: ShareRowProps) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const shareText = defaultShareText(audienceLabel);

  function urlFor(channel: ShareChannel): string {
    const base = `${origin}/waitlist`;
    const params = new URLSearchParams();
    if (sourceCode) params.set("s", sourceCode);
    params.set("share", channel);
    return `${base}?${params.toString()}`;
  }

  /**
   * Fire-and-forget: a failed analytics call must never block the share the
   * visitor actually asked for.
   */
  function recordShare(channel: ShareChannel) {
    void fetch("/api/waitlist/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceCode, shareChannel: channel }),
      keepalive: true,
    }).catch(() => {});
  }

  function openShare(channel: ShareChannel, href: string) {
    recordShare(channel);
    window.open(href, "_blank", "noopener,noreferrer");
  }

  async function handleCopy() {
    const link = urlFor("copy_link");
    try {
      await navigator.clipboard.writeText(link);
      recordShare("copy_link");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard can be blocked by permissions — say nothing rather than
      // claiming a copy that did not happen.
    }
  }

  async function handleNativeShare() {
    const link = urlFor("native");
    try {
      await navigator.share({ title: "The Operator", text: shareText, url: link });
      // navigator.share resolving means the sheet was used, not that anything
      // was posted — this is recorded as intent only.
      recordShare("native");
    } catch {
      // Cancelled or unsupported — nothing to report.
    }
  }

  const targets: Array<{ channel: ShareChannel; label: string; href: string }> = [
    {
      channel: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(urlFor("facebook"))}`,
    },
    {
      channel: "x",
      label: "X",
      href: `https://x.com/intent/post?url=${encodeURIComponent(urlFor("x"))}&text=${encodeURIComponent(shareText)}`,
    },
    {
      channel: "reddit",
      label: "Reddit",
      href: `https://www.reddit.com/submit?url=${encodeURIComponent(urlFor("reddit"))}&title=${encodeURIComponent(shareText)}`,
    },
    {
      channel: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${urlFor("whatsapp")}`)}`,
    },
    {
      channel: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(urlFor("linkedin"))}`,
    },
  ];

  const chipClass =
    "h-9 px-3.5 rounded-lg border border-border bg-background text-sm text-foreground hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors flex items-center gap-1.5";

  return (
    <section className={cn("", className)} aria-labelledby="share-heading">
      <h2
        id="share-heading"
        className="font-heading font-semibold text-base text-foreground mb-1"
      >
        Share this
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        If you know someone who&apos;d rather talk than type, send it on.
      </p>

      <div className="flex flex-wrap gap-2">
        {canNativeShare && (
          <button type="button" onClick={handleNativeShare} className={chipClass}>
            <Share2 className="w-4 h-4" aria-hidden="true" />
            Share
          </button>
        )}

        {targets.map(({ channel, label, href }) => (
          <button
            key={channel}
            type="button"
            onClick={() => openShare(channel, href)}
            className={chipClass}
          >
            {label}
          </button>
        ))}

        <button
          type="button"
          onClick={() =>
            openShare(
              "email",
              `mailto:?subject=${encodeURIComponent("Thought this might interest you")}&body=${encodeURIComponent(`${shareText}\n\n${urlFor("email")}`)}`
            )
          }
          className={chipClass}
        >
          <Mail className="w-4 h-4" aria-hidden="true" />
          Email
        </button>

        <button type="button" onClick={handleCopy} className={chipClass}>
          {copied ? (
            <Check className="w-4 h-4 text-primary" aria-hidden="true" />
          ) : (
            <Copy className="w-4 h-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      {/* Announced to screen readers without relying on the icon change alone. */}
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </p>
    </section>
  );
}
