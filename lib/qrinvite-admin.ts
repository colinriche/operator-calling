/**
 * Server-only helper that resolves a QR-invite token to its Firestore document.
 *
 * Not imported by client components (pulls in firebase-admin).
 */

import type { Firestore, DocumentReference, DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { resolveTokenDocId } from "@/lib/qrinvite-server";

export interface ResolvedToken {
  /** Firestore handle — use it for all follow-up reads/writes. */
  db: Firestore;
  /** The qr_tokens document id (decoded from the JWT payload when present). */
  docId: string;
  /** Reference to the qr_tokens doc, for updates. */
  ref: DocumentReference;
  /** The already-fetched snapshot (avoids a second read). */
  snap: DocumentSnapshot;
}

/**
 * Look up `qr_tokens/{docId}` and return it together with the db handle, or
 * null if it does not exist. Logs the miss so a bad token is obvious in the
 * logs.
 */
export async function resolveTokenProject(token: string): Promise<ResolvedToken | null> {
  const docId = resolveTokenDocId(token);

  let db: Firestore;
  try {
    db = getAdminDb();
  } catch (err) {
    console.error("[qrinvite] Firestore unavailable:", (err as Error).message);
    return null;
  }

  const ref = db.collection("qr_tokens").doc(docId);
  const snap = await ref.get();
  if (snap.exists) {
    return { db, docId, ref, snap };
  }

  console.warn(`[qrinvite] token doc "${docId}" not found`);
  return null;
}
