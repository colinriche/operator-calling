import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";

function normalizePhoneNumber(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function isLinkedProfile(data: DocumentData) {
  return Boolean(data.systemName || data.linkedSystemName || data.linkedWebUid || data.linkedWebUids);
}

function isUsefulDirectProfile(data: DocumentData) {
  return Boolean(
    data.systemName ||
    data.linkedSystemName ||
    data.linkedWebUid ||
    data.linkedWebUids ||
    data.role ||
    data.displayName ||
    data.name ||
    data.phoneNumber
  );
}

async function queryFirst(
  db: ReturnType<typeof getAdminServices>["db"],
  field: string,
  operator: FirebaseFirestore.WhereFilterOp,
  value: string
) {
  if (!value) return null;
  const snap = await db.collection("user").where(field, operator, value).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function rememberWebUid(
  doc: QueryDocumentSnapshot<DocumentData>,
  webUid: string,
  phoneNumber: string
) {
  const data = doc.data();
  const update: Record<string, unknown> = {
    linkedWebUids: FieldValue.arrayUnion(webUid),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!data.linkedWebUid) {
    update.linkedWebUid = webUid;
  }
  if (phoneNumber && !data.phoneNumber) {
    update.phoneNumber = phoneNumber;
  }

  await doc.ref.set(update, { merge: true });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ status: "error", message: "Unauthenticated" }, { status: 401 });
  }

  const { db, adminAuth } = getAdminServices();

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid token" }, { status: 401 });
  }

  const webUid = decoded.uid;
  const phoneNumber = normalizePhoneNumber(decoded.phone_number);

  const directSnap = await db.collection("user").doc(webUid).get();
  if (directSnap.exists) {
    const directData = directSnap.data()!;
    if (isUsefulDirectProfile(directData)) {
      return NextResponse.json({
        status: isLinkedProfile(directData) ? "linked" : "direct",
        profileDocId: directSnap.id,
        isLinked: isLinkedProfile(directData),
      });
    }
  }

  const linkedByArray = await queryFirst(db, "linkedWebUids", "array-contains", webUid);
  const linkedByScalar = linkedByArray ?? await queryFirst(db, "linkedWebUid", "==", webUid);
  if (linkedByScalar) {
    await rememberWebUid(linkedByScalar, webUid, phoneNumber);
    return NextResponse.json({
      status: "linked",
      profileDocId: linkedByScalar.id,
      isLinked: true,
    });
  }

  const linkedByPhone = phoneNumber ? await queryFirst(db, "phoneNumber", "==", phoneNumber) : null;
  if (linkedByPhone) {
    await rememberWebUid(linkedByPhone, webUid, phoneNumber);
    return NextResponse.json({
      status: isLinkedProfile(linkedByPhone.data()) ? "linked" : "direct",
      profileDocId: linkedByPhone.id,
      isLinked: isLinkedProfile(linkedByPhone.data()),
    });
  }

  return NextResponse.json({
    status: "unresolved",
    profileDocId: directSnap.exists ? directSnap.id : null,
    isLinked: false,
  });
}
