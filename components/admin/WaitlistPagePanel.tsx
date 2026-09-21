"use client";

import { useMemo, useState } from "react";
import { Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useWaitlistLibrary } from "@/hooks/useWaitlistLibrary";
import { cn } from "@/lib/utils";
import {
  canNameSourcePublicly,
  CONNECTION_TYPES,
  DEFAULT_CONNECTION_TYPE,
  RELATIONSHIP_STATUSES,
  WAITLIST_MODES,
  type ConnectionType,
  type WaitlistMode,
} from "@/lib/waitlist/constants";
import { builtinImage } from "@/lib/waitlist/builtin-images";
import {
  sameSocialImages,
  sameWording,
  wordingVariantFor,
  type SocialImages,
  type WaitlistWording,
} from "@/lib/waitlist/library";
import {
  demandSourcePresentation,
  effectiveImageChoice,
} from "@/lib/waitlist/presentation";
import { HeroImageEditor } from "@/components/admin/HeroImageEditor";
import { SocialImageOverrides } from "@/components/admin/SocialImageOverrides";
import { WaitlistImagePicker } from "@/components/admin/WaitlistImagePicker";
import { WaitlistWordingEditor } from "@/components/admin/WaitlistWordingEditor";
import type { DemandSourceRow, WaitlistHero } from "@/lib/waitlist/types";

// ─── What this source's waitlist page looks like ─────────────────────────────
//
// Mode, picture, wording and family name, plus a preview.
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

/** Thumbnail treatment for a hero, matching how the page itself frames it. */
export function heroThumbClass(hero: WaitlistHero): string {
  if (hero.kind === "builtin") {
    return builtinImage(hero.builtinId)?.display === "dark"
      ? "object-contain bg-[#020202]"
      : "object-contain bg-[#FBF7EF]";
  }
  // Uploads can be any shape; a thumbnail shows them whole, as the page does.
  return hero.kind === "image" ? "object-contain" : "object-cover";
}

export function WaitlistPagePanel({ source, onSaved }: Props) {
  const { user } = useAuth();
  const { library, reload: reloadLibrary } = useWaitlistLibrary();

  const [mode, setMode] = useState<WaitlistMode>(
    (WAITLIST_MODES.find((m) => m.id === source.waitlistMode)?.id ??
      "community") as WaitlistMode
  );
  const [connectionType, setConnectionType] = useState<ConnectionType>(
    (CONNECTION_TYPES.find((c) => c.id === source.connectionType)?.id ??
      DEFAULT_CONNECTION_TYPE) as ConnectionType
  );
  const [familyName, setFamilyName] = useState(source.familyName ?? "");
  const [eyebrow, setEyebrow] = useState(source.publicEyebrow ?? "");

  const savedChoice = effectiveImageChoice(source);
  const [imageChoice, setImageChoice] = useState(savedChoice);
  const [socialImages, setSocialImages] = useState<SocialImages>(source.socialImages);
  const [wording, setWording] = useState<WaitlistWording | null>(source.wording);
  const [templateLabel, setTemplateLabel] = useState<string | null>(
    source.wordingTemplateLabel
  );
  const [saving, setSaving] = useState(false);
  const [addingToLibrary, setAddingToLibrary] = useState(false);

  const imageDirty = imageChoice !== savedChoice;
  const socialDirty = !sameSocialImages(socialImages, source.socialImages);
  const wordingDirty = !sameWording(wording, source.wording);
  const dirty =
    mode !== (source.waitlistMode || "community") ||
    connectionType !== (source.connectionType || DEFAULT_CONNECTION_TYPE) ||
    familyName !== (source.familyName ?? "") ||
    eyebrow !== (source.publicEyebrow ?? "") ||
    imageDirty ||
    socialDirty ||
    wordingDirty;

  // A choice the library can no longer render (an image deleted elsewhere, say)
  // is still previewed, as whatever the page would fall back to.
  const imageChoiceUrl = imageChoice.startsWith("library:")
    ? (library.images.find((i) => `library:${i.id}` === imageChoice)?.url ??
      (imageChoice === source.imageChoice ? source.imageChoiceUrl : null))
    : null;

  // Exactly what the page will render, from exactly the same code — with the
  // unsaved edits applied, which is the whole point of a preview.
  const preview = useMemo(
    () =>
      demandSourcePresentation(
        source,
        {
          waitlistMode: mode,
          connectionType,
          familyName,
          publicEyebrow: eyebrow,
          imageChoice,
          imageChoiceUrl,
          wording,
        },
        library.defaults
      ),
    [source, mode, connectionType, familyName, eyebrow, imageChoice, imageChoiceUrl, wording, library.defaults]
  );

  const variant = wordingVariantFor(mode, mode === "family" ? "existing_connections" : connectionType);

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
        body: JSON.stringify({
          waitlistMode: mode,
          connectionType,
          familyName,
          publicEyebrow: eyebrow,
          ...(imageDirty ? { imageChoice } : {}),
          ...(socialDirty ? { socialImages } : {}),
          ...(wordingDirty ? { wording, wordingTemplateLabel: templateLabel } : {}),
        }),
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

  /** Copies the family's photograph into the shared library, by choice. */
  async function addPhotoToLibrary() {
    if (!user) return;
    setAddingToLibrary(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/waitlist-library/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fromSourceId: source.id,
          label: familyName || source.sourceName,
          category: "family",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add to the library");
      await reloadLibrary();
      toast.success("Copied into the library — other pages can now choose it");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to add to the library");
    } finally {
      setAddingToLibrary(false);
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

      {/* Family mode is existing connections by definition, so the choice is
          only offered where it is actually a choice. */}
      {mode !== "family" && (
        <div>
          <label className={labelClass}>Do these people already know each other?</label>
          <div className="grid sm:grid-cols-2 gap-2">
            {CONNECTION_TYPES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setConnectionType(c.id)}
                className={cn(
                  "text-left rounded-lg border px-3 py-2.5 transition-colors",
                  connectionType === c.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                )}
              >
                <span className="block text-sm font-medium text-foreground">
                  {c.label}
                </span>
                <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
                  {c.hint}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Changes the wording only. Telling former colleagues they&apos;ll be
            matched with &ldquo;others who share an interest&rdquo; describes
            something they did not sign up for.
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
              placeholder="e.g. the Smith family"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              The page heading, the browser title and the link preview title.
            </p>
          </div>

          {/* The family's own photograph stays private to this page. Adding it
              to the library is a separate, deliberate act. */}
          <HeroImageEditor source={source} onSaved={onSaved} />
          {source.heroImageUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={addingToLibrary}
                onClick={() => void addPhotoToLibrary()}
              >
                {addingToLibrary ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Library className="w-3.5 h-3.5" />
                )}
                Add this photograph to the library
              </Button>
              <span className="text-xs text-muted-foreground">
                Only if other pages should be able to use it. It stays private to
                this family otherwise.
              </span>
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor={`eyebrow-${source.id}`} className={labelClass}>
          Line above the heading (optional)
        </label>
        <input
          id={`eyebrow-${source.id}`}
          value={eyebrow}
          maxLength={80}
          onChange={(e) => setEyebrow(e.target.value)}
          placeholder={
            mode === "family" ? "A private calling group" : "e.g. For the Tuesday night league"
          }
          className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Shown above the heading on the page and on the link preview card, and
          added to the preview title. Written by you — the platform a link is
          posted on is never shown publicly.
          {mode === "community" && !canNameSourcePublicly(source.relationshipStatus) && (
            <>
              {" "}
              This source is marked{" "}
              <span className="text-foreground">
                {RELATIONSHIP_STATUSES.find((r) => r.id === source.relationshipStatus)?.label ??
                  source.relationshipStatus}
              </span>
              , so naming the community here would claim more than we can.
            </>
          )}
        </p>
      </div>

      <div>
        <label className={labelClass}>Picture</label>
        <WaitlistImagePicker
          value={imageChoice}
          onChange={setImageChoice}
          ownImageUrl={mode === "family" ? source.heroImageUrl : null}
          suggestedCategory={mode === "family" ? "family" : "all"}
        />
      </div>

      <div>
        <label className={labelClass}>Link preview on each network</label>
        <SocialImageOverrides
          value={socialImages}
          onChange={setSocialImages}
          baseChoice={imageChoice}
          platformId={source.platformId}
          ownImageUrl={mode === "family" ? source.heroImageUrl : null}
        />
      </div>

      <div>
        <label className={labelClass}>Wording</label>
        <WaitlistWordingEditor
          variant={variant}
          scope="source"
          value={wording}
          templateLabel={templateLabel}
          onChange={(next, label) => {
            setWording(next);
            setTemplateLabel(label);
          }}
        />
      </div>

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
                "rounded-md border border-border/60",
                preview.hero.kind === "brand"
                  ? "w-10 h-10 object-cover"
                  : preview.hero.kind === "art"
                    ? "w-14 h-[42px] object-cover"
                    : preview.hero.kind === "image"
                      ? "block w-full h-auto max-h-56 object-contain bg-muted"
                      : cn("w-full aspect-[16/9]", heroThumbClass(preview.hero))
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
                className={cn("w-full aspect-[1.91/1] bg-muted", heroThumbClass(preview.hero))}
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
                The line above the heading is whatever you wrote, so it is worth
                checking it claims no more than this source&apos;s relationship
                status supports.
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
