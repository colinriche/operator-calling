import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  DELETION_REQUESTS,
  RESTORE_WINDOW_DAYS,
  resolveAccount,
  toDeletionRequestView,
  type DeletionRequestType,
} from "@/lib/account-deletion";

// GET  /api/account/deletion - the signed-in person's deletion request, if any.
// POST /api/account/deletion - { action: "delete" | "permanent" | "restore" }
//
// Never deletes anything. "delete" and "permanent" file a request for the super
// admin to process by hand; "restore" withdraws it inside the 30 day window.

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(err: unknown) {
  console.error("[account/deletion]", err);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const profileDocId = req.nextUrl.searchParams.get("profileDocId") ?? undefined;
    const account = await resolveAccount(req, profileDocId);
    if ("error" in account) {
      return NextResponse.json({ error: account.error }, { status: account.status });
    }
    const snap = await account.db.collection(DELETION_REQUESTS).doc(account.primaryId).get();
    return NextResponse.json({
      request: snap.exists ? toDeletionRequestView(snap.id, snap.data() ?? {}) : null,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  let body: { action?: string; profileDocId?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const account = await resolveAccount(req, body.profileDocId);
    if ("error" in account) {
      return NextResponse.json({ error: account.error }, { status: account.status });
    }

    const ref = account.db.collection(DELETION_REQUESTS).doc(account.primaryId);
    const existing = await ref.get();
    const current = existing.exists ? existing.data() ?? {} : null;
    const pending = current?.status === "pending";

    if (body.action === "restore") {
      const until = (current?.restoreUntil as Timestamp | undefined)?.toMillis();
      if (!pending) {
        return NextResponse.json({ error: "There is no deletion request to restore." }, { status: 404 });
      }
      if (until === undefined || until < Date.now()) {
        return NextResponse.json(
          { error: "The 30 day restore window has ended. Please contact support." },
          { status: 409 }
        );
      }
      await ref.set(
        { status: "restored", restoredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return NextResponse.json({
        request: toDeletionRequestView(ref.id, (await ref.get()).data() ?? {}),
      });
    }

    if (body.action !== "delete" && body.action !== "permanent") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    const requestType: DeletionRequestType =
      body.action === "permanent" ? "permanent_deletion" : "account_deletion";
    const reason = (body.reason ?? "").trim().slice(0, 500);

    if (pending) {
      // Already requested. Asking again can only escalate to a permanent request;
      // the original date and restore deadline stay, so repeating it cannot push
      // the window out.
      if (requestType === "permanent_deletion" && current?.requestType !== "permanent_deletion") {
        await ref.set(
          {
            requestType,
            ...(reason ? { reason } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    } else {
      await ref.set({
        userId: account.primaryId,
        userIds: account.userIds,
        authUid: account.uid,
        email: account.email,
        displayName: account.displayName,
        requestType,
        status: "pending",
        reason: reason || "No reason given",
        requestedAt: FieldValue.serverTimestamp(),
        restoreUntil: Timestamp.fromMillis(Date.now() + RESTORE_WINDOW_DAYS * DAY_MS),
        restoredAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({
      request: toDeletionRequestView(ref.id, (await ref.get()).data() ?? {}),
    });
  } catch (err) {
    return fail(err);
  }
}
