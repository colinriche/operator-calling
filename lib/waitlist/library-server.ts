import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "./constants";
import {
  isSocialNetwork,
  isWordingVariant,
  parseImageChoice,
  sanitiseWording,
  type LibraryImageRow,
  type SocialImages,
  type SocialImageUrls,
  type WordingTemplateRow,
} from "./library";
import { toIso } from "./server";

// Server-only: the library's Firestore reads and the one validation that needs
// a read — whether an image choice points at something that exists.

export function libraryImageRow(doc: DocumentSnapshot): LibraryImageRow | null {
  const data = doc.data();
  if (!data || typeof data.url !== "string") return null;
  return {
    id: doc.id,
    label: typeof data.label === "string" ? data.label : "",
    category: typeof data.category === "string" ? data.category : "general",
    url: data.url,
    createdAt: toIso(data.createdAt),
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    archived: data.archived === true,
  };
}

export function wordingTemplateRow(doc: DocumentSnapshot): WordingTemplateRow | null {
  const data = doc.data();
  const wording = sanitiseWording(data?.wording);
  if (!data || !wording || !isWordingVariant(data.variant)) return null;
  return {
    id: doc.id,
    label: typeof data.label === "string" ? data.label : "",
    variant: data.variant,
    wording,
    createdAt: toIso(data.createdAt),
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    updatedAt: toIso(data.updatedAt),
  };
}

export type ResolvedImageChoice =
  | { ok: true; imageChoice: string; imageChoiceUrl: string | null }
  | { ok: false; error: string };

/**
 * Validate an image choice and resolve a library image to its URL.
 *
 * The URL is looked up here and copied onto the record, never accepted from
 * the request: a URL a caller could supply is a way to put any picture on a
 * public page without the upload's public-visibility confirmation.
 */
export async function resolveImageChoice(
  db: Firestore,
  raw: unknown,
  { allowUnset }: { allowUnset: boolean }
): Promise<ResolvedImageChoice> {
  if (raw === "" && allowUnset) return { ok: true, imageChoice: "", imageChoiceUrl: null };

  const choice = parseImageChoice(raw);
  if (!choice) return { ok: false, error: "Unrecognised image choice" };

  if (choice.type === "library") {
    const snap = await db.collection(COLLECTIONS.waitlistImages).doc(choice.id).get();
    const row = snap.exists ? libraryImageRow(snap) : null;
    if (!row) return { ok: false, error: "That library image no longer exists" };
    return { ok: true, imageChoice: `library:${row.id}`, imageChoiceUrl: row.url };
  }

  return { ok: true, imageChoice: String(raw).trim(), imageChoiceUrl: null };
}

export type ResolvedSocialImages =
  | { ok: true; socialImages: SocialImages; socialImageUrls: SocialImageUrls }
  | { ok: false; error: string };

/**
 * Validate a whole { network: imageChoice } map, resolving library images to
 * their URLs the same way a single choice is. An empty choice drops that
 * network, so it goes back to the page's picture.
 */
export async function resolveSocialImages(
  db: Firestore,
  raw: unknown,
  { forDefaults }: { forDefaults: boolean }
): Promise<ResolvedSocialImages> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Expected a picture per network" };
  }

  const socialImages: SocialImages = {};
  const socialImageUrls: SocialImageUrls = {};
  for (const [network, choice] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSocialNetwork(network)) {
      return { ok: false, error: `Unknown network: ${network}` };
    }
    if (choice === "" || choice === null) continue;
    if (forDefaults && (choice === "default" || choice === "own")) {
      return { ok: false, error: "Choose a specific image for each network" };
    }
    const resolved = await resolveImageChoice(db, choice, { allowUnset: false });
    if (!resolved.ok) return resolved;
    socialImages[network] = resolved.imageChoice;
    if (resolved.imageChoiceUrl) socialImageUrls[network] = resolved.imageChoiceUrl;
  }
  return { ok: true, socialImages, socialImageUrls };
}
