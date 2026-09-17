"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  HERO_IMAGE_MAX_BYTES,
  HERO_IMAGE_TYPES,
} from "@/lib/waitlist/constants";
import {
  HERO_IMAGE_CONFIRM_LABEL,
  HERO_IMAGE_WARNING_ADVICE,
  HERO_IMAGE_WARNING_BODY,
  HERO_IMAGE_WARNING_HEADLINE,
} from "@/lib/waitlist/copy";
import type { DemandSourceRow } from "@/lib/waitlist/types";

// ─── The hero image, wherever it is edited ───────────────────────────────────
//
// Lifted out of WaitlistPagePanel unchanged so the spreadsheet's row control
// opens the same editor rather than a second one. The public-visibility
// confirmation is the reason this is shared and not reimplemented: an upload
// path that forgot the gate would be an upload path that puts a family
// photograph on a public URL without anybody being told.
//
// The server enforces it too — POST …/image refuses without `confirmedPublic`
// — so this is the explanation, not the enforcement.

/* eslint-disable @next/next/no-img-element */

interface Props {
  source: DemandSourceRow;
  /** Reload the list once something has actually been saved. */
  onSaved: () => Promise<void> | void;
}

export function HeroImageEditor({ source, onSaved }: Props) {
  const { user } = useAuth();
  const [confirmedPublic, setConfirmedPublic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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

  return (
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
              Live on the page and in the link preview. Anyone with the link can
              see it.
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
          No photograph uploaded for this family.
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
  );
}
