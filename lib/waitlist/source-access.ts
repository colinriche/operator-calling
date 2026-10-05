// Server-only. Loads a demand source for a route, enforcing ownership.

import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { canAccessRecord, type OwnershipCaller } from "@/lib/waitlist/ownership";

export type SourceAccess =
  | {
      ok: true;
      ref: FirebaseFirestore.DocumentReference;
      data: FirebaseFirestore.DocumentData;
    }
  | { ok: false; response: NextResponse };

/**
 * The source, if the caller may touch it.
 *
 * A source that does not exist and a source the caller may not access both
 * answer 404, so an ordinary admin cannot probe other admins' ids to learn which
 * exist. The check runs on the document as stored - nothing from the request
 * body decides it.
 */
export async function loadSourceForCaller(
  db: Firestore,
  id: string,
  caller: OwnershipCaller
): Promise<SourceAccess> {
  const ref = db.collection(COLLECTIONS.demandSources).doc(id);
  const snap = await ref.get();
  if (!snap.exists || !canAccessRecord(caller, snap.data())) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { ok: true, ref, data: snap.data() ?? {} };
}
