"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  canNameSourcePublicly,
  HERO_IMAGE_MAX_BYTES,
  HERO_IMAGE_TYPES,
  RELATIONSHIP_STATUSES,
  WAITLIST_MODES,
  type WaitlistMode,
} from "@/lib/waitlist/constants";
import {
  HERO_IMAGE_CONFIRM_LABEL,
  HERO_IMAGE_WARNING_ADVICE,
  HERO_IMAGE_WARNING_BODY,
  HERO_IMAGE_WARNING_HEADLINE,
} from "@/lib/waitlist/copy";
import {
  buildWaitlistPresentation,
  waitlistContextFrom,
} from "@/lib/waitlist/presentation";
import { TOPIC_ART, topicArtDataUri } from "@/lib/waitlist/topic-art";
import type { DemandSourceRow } from "@/lib/waitlist/types";

// ─── What this source's waitlist page looks like ─────────────────────────────
//
// Mode, artwork and family name, plus a preview.
//
// The preview is not a mock-up. It is built by calling the same
// buildWaitlistPresentation the page and the Open Graph route call, on a
// context assembled by the same waitlistContextFrom the server uses — so what
// is shown here is what will render, including the rule about whether the
// community may be named.

/* eslint-disable @next/next/no-img-element */

interface Props {
  source: DemandSourceRow;
  /** Reload the list once something has actually been saved. */
  onSaved: () => Promise<void> | void;
}

export function WaitlistPagePanel({ source, onSaved }: Props) {
  const { user } = useAuth();

  const [mode, setMode] = useState<WaitlistMode>(
    (WAITLIST_MODES.find((m) => m.id === source.waitlistMode)?.id ??
      "community") as WaitlistMode
  );
  const [topicArtId, setTopicArtId] = useState(source.topicArtId ?? "");
  const [familyName, setFamilyName] = useState(source.familyName ?? "");
  const [saving, setSaving] = useState(false);

  const [confirmedPublic, setConfirmedPublic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty =
    mode !== (source.waitlistMode || "community") ||
    topicArtId !== (source.topicArtId ?? "") ||
    familyName !== (source.familyName ?? "");

  // Exactly what the page will render, from exactly the same code.
  const preview = useMemo(
    () =>
      buildWaitlistPresentation(
        waitlistContextFrom(
          {
            platformId: source.platformId,
            sourceType: source.sourceType,
            relationshipStatus: source.relationshipStatus,
            publicDisplayName: source.publicDisplayName,
            publicAudienceLabel: source.publicAudienceLabel,
            topicName: source.topicName,
            groupId: source.groupId,
            waitlistMode: mode,
            topicArtId,
            familyName,
            heroImageUrl: source.heroImageUrl,
          },
          {
            sourceCode: source.links[0]?.sourceCode ?? null,
            demandSourceId: source.id,
            sourceLinkId: source.links[0]?.id ?? null,
            shareChannel: null,
            attributed: true,
          }
        )
      ),
    [source, mode, topicArtId, familyName]
  );

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/demand-sources/${source.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ waitlistMode: mode, topicArtId, familyName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Waitlist page updated");
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    if (!user) return;

    // Checked here for a useful message, and again on the server, which is what
    // actually enforces it.
    if (file.size > HERO_IMAGE_MAX_BYTES) {
      toast.error(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${
          HERO_IMAGE_MAX_BYTES / 1024 / 1024
        }MB.`
      );
      return;
    }

    setUploading(true);
    try {
      const token = await user.getIdToken();
      const body = new FormData();
      body.set("file", file);
      body.set("confirmedPublic", "true");

      const res = await fetch(`/api/admin/demand-sources/${source.id}/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      toast.success("Hero image uploaded — it is now publicly visible");
      // Re-armed for the next upload: a second image is a second decision.
      setConfirmedPublic(false);
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeImage() {
    if (!user) return;
    setUploading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/demand-sources/${source.id}/image`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove");
      toast.success(
        "Image removed. Previews already cached elsewhere may still show it for a while."
      );
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setUploading(false);
    }
  }

  const labelClass = "block text-xs font-medium text-foreground mb-1.5";

  return (
    <div className="border-t border-border/60 pt-4 space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Waitlist page</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {WAITLIST_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "text-left rounded-lg border px-3 py-2.5 transition-colors",
                mode === m.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              <span className="block text-sm font-medium text-foreground">
                {m.label}
              </span>
              <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
                {m.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      {mode === "community" && (
        <div>
          <label className={labelClass}>Topic imagery</label>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            <button
              type="button"
              onClick={() => setTopicArtId("")}
              title="No artwork — use the Operator brand mark"
              className={cn(
                "aspect-[4/3] rounded-lg border text-[10px] text-muted-foreground flex items-center justify-center",
                topicArtId === ""
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/40"
              )}
            >
              Brand
            </button>
            {TOPIC_ART.map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => setTopicArtId(art.id)}
                title={art.label}
                className={cn(
                  "aspect-[4/3] rounded-lg border overflow-hidden",
                  topicArtId === art.id
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/40"
                )}
              >
                <img
                  src={topicArtDataUri(art.id)}
                  alt={art.label}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            A fixed set, so nothing on a public page depends on who owns a
            picture. The heading is the source&apos;s topic
            {source.topicName ? (
              <>
                {" — currently "}
                <span className="text-foreground">{source.topicName}</span>.
              </>
            ) : (
              ", which is not set on this source yet."
            )}
          </p>
        </div>
      )}

      {mode === "family" && (
        <div className="space-y-4">
          <div>
            <label htmlFor={`family-${source.id}`} className={labelClass}>
              Family name
            </label>
            <input
              id={`family-${source.id}`}
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g. the Okonkwo family"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              The page heading, the browser title and the link preview title.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 p-3.5 space-y-3">
            <p className="text-xs font-medium text-foreground">
              Hero image (optional)
            </p>

            {source.heroImageUrl ? (
              <div className="flex flex-wrap items-start gap-3">
                <img
                  src={source.heroImageUrl}
                  alt="Current hero"
                  className="w-40 aspect-[16/9] object-cover rounded-lg border border-border"
                />
                <div className="text-xs text-muted-foreground space-y-2">
                  <p>
                    Live on the page and in the link preview. Anyone with the
                    link can see it.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => void removeImage()}
                  >
                    {uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No image. The page uses the Operator brand mark.
              </p>
            )}

            {/* The warning comes before the file picker, not after it. Someone
                choosing a family photograph should read this while they still
                have the choice. */}
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <AlertTriangle
                  className="w-4 h-4 text-destructive shrink-0"
                  aria-hidden="true"
                />
                {HERO_IMAGE_WARNING_HEADLINE}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {HERO_IMAGE_WARNING_BODY}
              </p>
              <p className="text-xs text-foreground leading-relaxed">
                {HERO_IMAGE_WARNING_ADVICE}
              </p>
              <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={confirmedPublic}
                  onChange={(e) => setConfirmedPublic(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 rounded border-border accent-primary"
                />
                {HERO_IMAGE_CONFIRM_LABEL}
              </label>
            </div>

            <input
              ref={fileInput}
              type="file"
              accept={HERO_IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              // Unchecking re-locks the picker: the confirmation is a gate, not
              // a formality that stays satisfied once ticked.
              disabled={!confirmedPublic || uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {source.heroImageUrl ? "Replace image" : "Choose image"}
            </Button>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG or WebP, up to {HERO_IMAGE_MAX_BYTES / 1024 / 1024}MB.
            </p>
          </div>
        </div>
      )}

      {/* Preview — the page and the link preview, from the same object */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-3 pt-2.5">
            Top of the page
          </p>
          <div className="p-3 space-y-2">
            <img
              src={preview.hero.src}
              alt=""
              className={cn(
                "object-cover rounded-md border border-border/60",
                preview.hero.kind === "brand"
                  ? "w-10 h-10"
                  : "w-full aspect-[16/9]"
              )}
            />
            {preview.eyebrow && (
              <p className="text-xs font-semibold text-primary">
                {preview.eyebrow}
              </p>
            )}
            <p className="font-heading font-bold text-base text-foreground leading-snug">
              {preview.heading}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {preview.lead}
            </p>
            {preview.independenceNote && (
              <p className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-primary/40 pl-2">
                {preview.independenceNote}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 overflow-hidden bg-background">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-3 pt-2.5">
            Link preview
          </p>
          <div className="p-3">
            <div className="rounded-md border border-border overflow-hidden">
              <img
                src={preview.hero.src}
                alt=""
                className="w-full aspect-[1.91/1] object-cover bg-muted"
              />
              <div className="p-2.5">
                <p className="text-xs font-semibold text-foreground leading-snug">
                  {preview.og.title}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                  {preview.og.description}
                </p>
              </div>
            </div>
            {mode === "community" && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {canNameSourcePublicly(source.relationshipStatus)
                  ? `Named because this source is marked “${
                      RELATIONSHIP_STATUSES.find(
                        (r) => r.id === source.relationshipStatus
                      )?.label ?? source.relationshipStatus
                    }”.`
                  : "The community is not named — the relationship status does not support it. Change the status if that is wrong, rather than the wording."}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save waitlist page
        </Button>
        {dirty && (
          <span className="text-xs text-muted-foreground">
            Unsaved — the live page still shows the previous version.
          </span>
        )}
      </div>
    </div>
  );
}
