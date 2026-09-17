"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useWaitlistLibrary } from "@/hooks/useWaitlistLibrary";
import { cn } from "@/lib/utils";
import { BUILTIN_IMAGES, FALLBACK_DEFAULT_IMAGE_CHOICE, builtinImage } from "@/lib/waitlist/builtin-images";
import { HERO_IMAGE_MAX_BYTES, HERO_IMAGE_TYPES } from "@/lib/waitlist/constants";
import {
  LIBRARY_IMAGE_CATEGORIES,
  parseImageChoice,
  type LibraryImageRow,
  type WaitlistLibraryPayload,
} from "@/lib/waitlist/library";
import { BRAND_ART_DATA_URI, TOPIC_ART, topicArtDataUri, topicArtLabel } from "@/lib/waitlist/topic-art";

// ─── Choosing a waitlist page's picture ──────────────────────────────────────
//
// One picker for every place a picture is chosen — the outreach panel, a
// spreadsheet row, and the default itself — over one library: the built-in
// pictures, uploaded images, the curated artwork and the brand mark, plus the
// library default and a family's own photograph where those make sense.
//
// Presentational apart from uploading. It reports a choice and stores nothing;
// the caller decides whether that is a draft (the panel) or a write (the row).
// An upload is different because the new image has to exist before it can be
// chosen, so the picker makes it and then reports it as the choice.

/* eslint-disable @next/next/no-img-element */

export interface ImageChoiceSummary {
  src: string;
  label: string;
  /** Contain rather than crop in a thumbnail: portrait or cut-off pictures. */
  contain: boolean;
}

/** A thumbnail and a name for any choice, or null when it points at nothing. */
export function describeImageChoice(
  choice: string,
  library: WaitlistLibraryPayload,
  ownImageUrl: string | null = null
): ImageChoiceSummary | null {
  const parsed = parseImageChoice(choice);
  if (!parsed) return null;
  switch (parsed.type) {
    case "default": {
      const inner = describeImageChoice(
        library.defaults.imageChoice || FALLBACK_DEFAULT_IMAGE_CHOICE,
        library
      );
      return inner ? { ...inner, label: `Default (${inner.label})` } : null;
    }
    case "builtin": {
      const image = builtinImage(parsed.id);
      return image ? { src: image.pageSrc, label: image.label, contain: true } : null;
    }
    case "art":
      return { src: topicArtDataUri(parsed.id), label: topicArtLabel(parsed.id), contain: false };
    case "library": {
      const image = library.images.find((i) => i.id === parsed.id);
      return image ? { src: image.url, label: image.label, contain: false } : null;
    }
    case "own":
      return ownImageUrl
        ? { src: ownImageUrl, label: "This family's photograph", contain: false }
        : null;
    case "brand":
      return { src: BRAND_ART_DATA_URI, label: "Brand mark", contain: true };
  }
}

interface Props {
  /** The effective choice — see effectiveImageChoice. */
  value: string;
  onChange: (choice: string) => void;
  disabled?: boolean;
  /** Offer the "Default" tile. Off when choosing the default itself. */
  allowDefault?: boolean;
  /** A family's own photograph, offered only on that family's page. */
  ownImageUrl?: string | null;
  /** Category preselected for new uploads and the filter. */
  suggestedCategory?: string;
}

function Tile({
  selected,
  disabled,
  onClick,
  label,
  src,
  contain,
  dark,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  src: string;
  contain?: boolean;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "group relative text-left rounded-lg border overflow-hidden disabled:opacity-50",
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/40"
      )}
    >
      <div className={cn("aspect-[4/3]", dark ? "bg-[#020202]" : "bg-muted")}>
        <img
          src={src}
          alt=""
          className={cn("w-full h-full", contain ? "object-contain" : "object-cover")}
        />
      </div>
      <span className="block px-1.5 py-1 text-[10px] leading-tight text-muted-foreground truncate">
        {label}
      </span>
      {selected && (
        <span className="absolute top-1 right-1 rounded-full bg-primary text-primary-foreground p-0.5">
          <Check className="w-3 h-3" />
        </span>
      )}
    </button>
  );
}

export function WaitlistImagePicker({
  value,
  onChange,
  disabled = false,
  allowDefault = true,
  ownImageUrl = null,
  suggestedCategory = "all",
}: Props) {
  const { user } = useAuth();
  const { library, loaded, error, reload } = useWaitlistLibrary();
  const [filter, setFilter] = useState<string>(suggestedCategory);
  const [uploadOpen, setUploadOpen] = useState(false);

  const visibleImages = useMemo(
    () =>
      library.images.filter(
        (image: LibraryImageRow) =>
          (!image.archived || value === `library:${image.id}`) &&
          (filter === "all" || image.category === filter)
      ),
    [library.images, filter, value]
  );

  const defaultSummary = describeImageChoice("default", library);
  const gridClass = "grid grid-cols-3 sm:grid-cols-5 gap-2";
  const headingClass = "text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5";

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive">{error}</p>}

      {(allowDefault || ownImageUrl) && (
        <div>
          <p className={headingClass}>For this page</p>
          <div className={gridClass}>
            {allowDefault && defaultSummary && (
              <Tile
                selected={value === "default"}
                disabled={disabled}
                onClick={() => onChange("default")}
                label={defaultSummary.label}
                src={defaultSummary.src}
                contain={defaultSummary.contain}
              />
            )}
            {ownImageUrl && (
              <Tile
                selected={value === "own"}
                disabled={disabled}
                onClick={() => onChange("own")}
                label="This family's photograph"
                src={ownImageUrl}
              />
            )}
          </div>
        </div>
      )}

      <div>
        <p className={headingClass}>Built in</p>
        <div className={gridClass}>
          {BUILTIN_IMAGES.map((image) => (
            <Tile
              key={image.id}
              selected={value === `builtin:${image.id}`}
              disabled={disabled}
              onClick={() => onChange(`builtin:${image.id}`)}
              label={image.label}
              src={image.pageSrc}
              contain
              dark={image.display === "dark"}
            />
          ))}
          <Tile
            selected={value === "brand"}
            disabled={disabled}
            onClick={() => onChange("brand")}
            label="Brand mark (small)"
            src={BRAND_ART_DATA_URI}
            contain
          />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <p className={cn(headingClass, "mb-0")}>Uploaded</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setUploadOpen((open) => !open)}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload new
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2">
          {[{ id: "all", label: "All" }, ...LIBRARY_IMAGE_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                filter === c.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {uploadOpen && (
          <LibraryUploadForm
            defaultCategory={filter === "all" ? "general" : filter}
            onUploaded={async (image) => {
              setUploadOpen(false);
              await reload();
              onChange(`library:${image.id}`);
            }}
            getToken={async () => (user ? user.getIdToken() : null)}
          />
        )}

        {!loaded ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading the library…
          </p>
        ) : visibleImages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing uploaded{filter === "all" ? "" : " in this category"} yet.
          </p>
        ) : (
          <div className={gridClass}>
            {visibleImages.map((image) => (
              <Tile
                key={image.id}
                selected={value === `library:${image.id}`}
                disabled={disabled}
                onClick={() => onChange(`library:${image.id}`)}
                label={image.archived ? `${image.label} (archived)` : image.label}
                src={image.url}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <p className={headingClass}>Illustrations</p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {TOPIC_ART.map((art) => (
            <Tile
              key={art.id}
              selected={value === `art:${art.id}`}
              disabled={disabled}
              onClick={() => onChange(`art:${art.id}`)}
              label={art.label}
              src={topicArtDataUri(art.id)}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Illustrations show as a small mark beside the heading; photographs and
          built-in pictures show as a banner.
        </p>
      </div>
    </div>
  );
}

// ─── Upload ──────────────────────────────────────────────────────────────────

function LibraryUploadForm({
  defaultCategory,
  onUploaded,
  getToken,
}: {
  defaultCategory: string;
  onUploaded: (image: LibraryImageRow) => Promise<void>;
  getToken: () => Promise<string | null>;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.size > HERO_IMAGE_MAX_BYTES) {
      toast.error(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${
          HERO_IMAGE_MAX_BYTES / 1024 / 1024
        }MB.`
      );
      return;
    }
    const token = await getToken();
    if (!token) return;

    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("label", label);
      body.set("category", category);
      body.set("confirmedPublic", "true");
      const res = await fetch("/api/admin/waitlist-library/images", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success("Added to the library");
      await onUploaded(data.image as LibraryImageRow);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const fieldClass =
    "h-8 px-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="rounded-lg border border-border/60 p-3 mb-3 space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name, e.g. Tennis court"
          className={cn(fieldClass, "flex-1 min-w-40")}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={fieldClass}
          aria-label="Category"
        >
          {LIBRARY_IMAGE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Before the file picker, while there is still a choice to make. */}
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 space-y-1.5">
        <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
          Library images are public and reusable
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Any waitlist page can use this image, including pages posted to public
          forums, and it is copied into link previews that can stay cached after
          it is archived. Only upload pictures you have the right to use publicly.
        </p>
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 rounded border-border accent-primary"
          />
          I have the right to use this image publicly, and understand anyone can see it.
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
        type="button"
        size="sm"
        disabled={!confirmed || uploading}
        onClick={() => fileInput.current?.click()}
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Choose image
      </Button>
      <span className="text-xs text-muted-foreground ml-2">
        JPEG, PNG or WebP, up to {HERO_IMAGE_MAX_BYTES / 1024 / 1024}MB.
      </span>
    </div>
  );
}
