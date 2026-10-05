"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WaitlistImagePicker, describeImageChoice } from "@/components/admin/WaitlistImagePicker";
import { useWaitlistLibrary } from "@/hooks/useWaitlistLibrary";
import { cn } from "@/lib/utils";
import type { WaitlistMode } from "@/lib/waitlist/constants";
import {
  builtInNetworkImageChoice,
  SOCIAL_NETWORKS,
  suggestedNetworks,
  type SocialImages,
  type SocialNetwork,
} from "@/lib/waitlist/library";

// ─── A different link-preview picture per network ────────────────────────────
//
// Set up nothing and every network shows the page's picture. Pick a network and
// choose a picture, and only that network changes. The networks this source is
// actually posted on come first; the rest sit behind "More networks" so the
// common case stays one row.
//
// Controlled: reports the whole map on every change, and the caller decides
// whether that is a draft or a write.

/* eslint-disable @next/next/no-img-element */

interface Props {
  value: SocialImages;
  onChange: (next: SocialImages) => void;
  /** The picture every network without its own choice uses. */
  baseChoice: string;
  /** Put this source's platform first. */
  platformId?: string | null;
  ownImageUrl?: string | null;
  /** Offer "Default" in the picker. Off for the defaults themselves. */
  allowDefault?: boolean;
  /** This page's mode, or null for the site-wide defaults, which have none. */
  mode?: WaitlistMode | null;
  disabled?: boolean;
}

export function SocialImageOverrides({
  value,
  onChange,
  baseChoice,
  platformId = null,
  ownImageUrl = null,
  allowDefault = true,
  mode = null,
  disabled = false,
}: Props) {
  const { library } = useWaitlistLibrary();
  const suggested = suggestedNetworks(platformId);
  const customised = SOCIAL_NETWORKS.filter((n) => value[n.id]).map((n) => n.id);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<SocialNetwork | null>(null);

  const shown = showAll
    ? SOCIAL_NETWORKS.map((n) => n.id)
    : [...new Set<SocialNetwork>([...suggested, ...customised])];

  const base = describeImageChoice(baseChoice, library, ownImageUrl);

  /**
   * What a network shows with nothing chosen for it. Usually the page's
   * picture; WhatsApp ships with one of its own, so the tile has to say so
   * rather than claiming the card matches the page when it does not.
   */
  function builtInFor(id: SocialNetwork) {
    const choice = builtInNetworkImageChoice(id, mode);
    return choice ? describeImageChoice(choice, library, ownImageUrl) : null;
  }

  const anyBuiltIn = shown.some((id) => builtInNetworkImageChoice(id, mode) !== "");

  function set(network: SocialNetwork, choice: string | null) {
    const next = { ...value };
    if (choice) next[network] = choice;
    else delete next[network];
    onChange(next);
  }

  const editingNetwork = SOCIAL_NETWORKS.find((n) => n.id === editing);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {customised.length === 0
          ? anyBuiltIn
            ? "Each network shows the page's picture unless it has one of its own. Pick a network to change it."
            : "Every network shows the page's picture. Pick a network to give it a different one."
          : `${customised.length} network${customised.length === 1 ? " has its" : "s have their"} own picture; the rest show the page's.`}
      </p>

      <div className="flex flex-wrap gap-2">
        {shown.map((id) => {
          const network = SOCIAL_NETWORKS.find((n) => n.id === id)!;
          const own = value[id] ? describeImageChoice(value[id]!, library, ownImageUrl) : null;
          const builtIn = own ? null : builtInFor(id);
          const thumb = own ?? builtIn ?? base;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => setEditing(editing === id ? null : id)}
              title={network.hint || network.label}
              aria-pressed={editing === id}
              className={cn(
                "flex items-center gap-2 rounded-lg border pl-1 pr-2.5 py-1 text-xs disabled:opacity-50",
                editing === id
                  ? "border-primary ring-2 ring-primary/30"
                  : own
                    ? "border-primary/60"
                    : "border-border hover:border-primary/40"
              )}
            >
              {thumb && (
                <img
                  src={thumb.src}
                  alt=""
                  className={cn(
                    "w-10 h-7 rounded bg-muted",
                    thumb.contain ? "object-contain" : "object-cover",
                    !own && "opacity-50"
                  )}
                />
              )}
              <span className="text-left leading-tight">
                <span className="block font-medium text-foreground">{network.label}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {own ? "Own picture" : builtIn ? "Built-in picture" : "Same as page"}
                </span>
              </span>
            </button>
          );
        })}
        {!showAll && shown.length < SOCIAL_NETWORKS.length && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setShowAll(true)}
          >
            More networks
          </Button>
        )}
      </div>

      {editingNetwork && (
        <div className="rounded-lg border border-border/60 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              Picture for {editingNetwork.label}
              {editingNetwork.hint && (
                <span className="font-normal text-muted-foreground"> · {editingNetwork.hint}</span>
              )}
            </p>
            <Button
              type="button"
              variant={value[editingNetwork.id] ? "outline" : "ghost"}
              size="sm"
              disabled={disabled || !value[editingNetwork.id]}
              onClick={() => set(editingNetwork.id, null)}
            >
              {!value[editingNetwork.id] && <Check className="w-3.5 h-3.5" />}
              {builtInNetworkImageChoice(editingNetwork.id, mode)
                ? "Back to the built-in picture"
                : "Same as the page"}
            </Button>
          </div>
          <WaitlistImagePicker
            value={value[editingNetwork.id] ?? ""}
            onChange={(choice) => set(editingNetwork.id, choice)}
            allowDefault={allowDefault}
            ownImageUrl={ownImageUrl}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
