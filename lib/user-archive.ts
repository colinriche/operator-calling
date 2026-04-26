import {
  FieldValue,
  Firestore,
  type CollectionReference,
  type DocumentReference,
  type Query,
  type SetOptions,
} from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";

export interface ArchiveDeleteOptions {
  userIds: string[];
  deletedBy: string;
  deletionType: "admin_delete" | "self_delete";
  reason: string;
  authUserIds?: string[];
}

function containsUserReference(value: unknown, userIds: Set<string>): boolean {
  if (typeof value === "string" && userIds.has(value)) return true;
  if (Array.isArray(value)) {
    return value.some((entry) => containsUserReference(entry, userIds));
  }
  if (value && typeof value === "object") {
    if (typeof (value as { toDate?: unknown }).toDate === "function") return false;
    return Object.values(value as Record<string, unknown>).some((entry) =>
      containsUserReference(entry, userIds)
    );
  }
  return false;
}

function archiveDocumentId(path: string) {
  return path.replace(/[^A-Za-z0-9_-]/g, "__").slice(0, 140);
}

async function commitBatch(
  db: Firestore,
  entries: Array<{ ref: DocumentReference; data: Record<string, unknown>; options?: SetOptions }>
) {
  if (entries.length === 0) return;
  const batch = db.batch();
  for (const entry of entries) {
    batch.set(entry.ref, entry.data, entry.options ?? {});
  }
  await batch.commit();
}

async function archiveCollectionReferences(
  db: Firestore,
  collectionRef: CollectionReference,
  userIds: Set<string>,
  archiveRef: DocumentReference,
  writes: Array<{ ref: DocumentReference; data: Record<string, unknown> }>
): Promise<number> {
  const snapshot = await collectionRef.get();
  let count = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const isMatch = userIds.has(docSnap.id) || containsUserReference(data, userIds);
    if (isMatch) {
      writes.push({
        ref: archiveRef.collection("documents").doc(archiveDocumentId(docSnap.ref.path)),
        data: {
          path: docSnap.ref.path,
          collectionId: docSnap.ref.parent.id,
          docId: docSnap.id,
          data,
          archivedAt: FieldValue.serverTimestamp(),
        },
      });
      count += 1;
      if (writes.length >= 450) {
        await commitBatch(db, writes.splice(0, writes.length));
      }
    }

    const subcollections = await docSnap.ref.listCollections();
    for (const subcollection of subcollections) {
      count += await archiveCollectionReferences(db, subcollection, userIds, archiveRef, writes);
    }
  }

  return count;
}

async function cleanUserReferences(db: Firestore, userId: string) {
  const writes: Array<{
    ref: DocumentReference;
    data: Record<string, unknown>;
    options?: SetOptions;
  }> = [];

  async function updateQuery(
    query: Query,
    buildData: () => Record<string, unknown>
  ) {
    const snapshot = await query.get();
    for (const docSnap of snapshot.docs) {
      writes.push({ ref: docSnap.ref, data: buildData(), options: { merge: true } });
      if (writes.length >= 450) {
        await commitBatch(db, writes.splice(0, writes.length));
      }
    }
  }

  await updateQuery(db.collection("user").where("contactIds", "array-contains", userId), () => ({
    contactIds: FieldValue.arrayRemove(userId),
  }));
  await updateQuery(db.collection("user").where("favouriteIds", "array-contains", userId), () => ({
    favouriteIds: FieldValue.arrayRemove(userId),
  }));
  await updateQuery(db.collection("user").where("ignoredIds", "array-contains", userId), () => ({
    ignoredIds: FieldValue.arrayRemove(userId),
  }));
  await updateQuery(db.collection("groups").where("memberIds", "array-contains", userId), () => ({
    memberIds: FieldValue.arrayRemove(userId),
    [`members.${userId}`]: FieldValue.delete(),
  }));

  await commitBatch(db, writes);
}

export async function archiveAndDeleteUsers(
  db: Firestore,
  adminAuth: Auth,
  options: ArchiveDeleteOptions
) {
  const userIds = Array.from(new Set(options.userIds.filter(Boolean)));
  const authUserIds = Array.from(new Set([...(options.authUserIds ?? []), ...userIds].filter(Boolean)));
  if (userIds.length === 0) {
    throw new Error("No user ids supplied");
  }

  const archiveRef = db.collection("Archive").doc(`${userIds[0]}_${Date.now()}`);
  const userSnaps = await Promise.all(userIds.map((id) => db.collection("user").doc(id).get()));
  const userDataById = Object.fromEntries(
    userSnaps.map((snap, index) => [userIds[index], snap.exists ? snap.data() ?? null : null])
  );

  await archiveRef.set({
    userId: userIds[0],
    userIds,
    authUserIds,
    userData: userDataById[userIds[0]],
    userDataById,
    archivedBy: options.deletedBy,
    deletedBy: options.deletedBy,
    deletionType: options.deletionType,
    deletionReason: options.reason,
    deletedAt: FieldValue.serverTimestamp(),
    archivedAt: FieldValue.serverTimestamp(),
    retentionNote:
      "Archive retained for legal/privacy audit. Permanent removal requires written user request and super admin approval.",
    status: "processing",
  });

  for (const userId of userIds) {
    const userRef = db.collection("user").doc(userId);
    await userRef.set(
      {
        banned: true,
        archived: true,
        archivedAt: FieldValue.serverTimestamp(),
        archivedBy: options.deletedBy,
        deletedAt: FieldValue.serverTimestamp(),
        deletionReason: options.reason,
        deletionType: options.deletionType,
        fcmToken: null,
        voipToken: null,
        forceLogoutAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const writes: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [];
  let matchedDocumentCount = 0;
  const collections = await db.listCollections();
  const userIdSet = new Set(userIds);
  for (const collectionRef of collections) {
    if (collectionRef.id === "Archive") continue;
    matchedDocumentCount += await archiveCollectionReferences(
      db,
      collectionRef,
      userIdSet,
      archiveRef,
      writes
    );
  }
  await commitBatch(db, writes);

  for (const userId of userIds) {
    await cleanUserReferences(db, userId);
  }

  await Promise.all(
    authUserIds.map(async (authUserId) => {
      try {
        await adminAuth.revokeRefreshTokens(authUserId);
      } catch {}
      try {
        await adminAuth.deleteUser(authUserId);
      } catch (err) {
        if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      }
    })
  );

  await Promise.all(userIds.map((userId) => db.collection("user").doc(userId).delete()));
  await archiveRef.set(
    {
      matchedDocumentCount,
      completedAt: FieldValue.serverTimestamp(),
      status: "completed",
    },
    { merge: true }
  );

  return { archiveId: archiveRef.id, matchedDocumentCount };
}

export async function deleteArchivePermanently(db: Firestore, archiveId: string) {
  const archiveRef = db.collection("Archive").doc(archiveId);
  const documentsSnap = await archiveRef.collection("documents").get();
  let batch = db.batch();
  let count = 0;
  for (const docSnap of documentsSnap.docs) {
    batch.delete(docSnap.ref);
    count += 1;
    if (count >= 450) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  batch.delete(archiveRef);
  await batch.commit();
}
