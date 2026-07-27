/**
 * Server-only helpers that resolve which Firebase project a QR-invite token
 * lives in. The token itself carries no environment field, so we look it up in
 * each configured project and use whichever one contains it.
 *
 * Not imported by client components (pulls in firebase-admin).
 */

import type { Firestore, DocumentReference, DocumentSnapshot } from "firebase-admin/firestore";
import { getProjectDb, getConfiguredProjectKeys, type ProjectKey } from "@/lib/firebase-admin";
import { resolveTokenDocId } from "@/lib/qrinvite-server";

export interface ResolvedToken {
  /** Which project the token doc was found in. */
  project: ProjectKey;
  /** Firestore handle for that project — use it for all follow-up reads/writes. */
  db: Firestore;
  /** The qr_tokens document id (decoded from the JWT payload when present). */
  docId: string;
  /** Reference to the qr_tokens doc, for updates. */
  ref: DocumentReference;
  /** The already-fetched snapshot (avoids a second read). */
  snap: DocumentSnapshot;
}

/**
 * Look up `qr_tokens/{docId}` across every configured project (primary first,
 * then staging) and return the first match together with that project's db
 * handle, or null if no project contains it.
 *
 * On a miss it logs which projects were tried, so an env misconfiguration is
 * obvious in the logs.
 */
export async function resolveTokenProject(token: string): Promise<ResolvedToken | null> {
  const docId = resolveTokenDocId(token);
  const tried: ProjectKey[] = [];

  for (const key of getConfiguredProjectKeys()) {
    let db: Firestore;
    try {
      db = getProjectDb(key);
    } catch (err) {
      // Missing/invalid credentials for this project — skip, but keep looking.
      console.error(`[qrinvite] skipping "${key}" project:`, (err as Error).message);
      continue;
    }

    tried.push(key);
    const ref = db.collection("qr_tokens").doc(docId);
    const snap = await ref.get();
    if (snap.exists) {
      return { project: key, db, docId, ref, snap };
    }
  }

  console.warn(
    `[qrinvite] token doc "${docId}" not found in any Firebase project (tried: ${
      tried.join(", ") || "none"
    }). If this token is from the staging app, verify FIREBASE_*_STAGING env vars are set.`
  );
  return null;
}
