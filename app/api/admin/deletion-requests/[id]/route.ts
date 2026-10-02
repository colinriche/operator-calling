import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminDb, firebaseProjectId } from "@/lib/firebase-admin";
import { reviewDeletionRequest, ReviewRefusal } from "@/lib/deletion-review-server";

// POST /api/admin/deletion-requests/[id]  { action: "delete" | "decline", ... }
//
// The ONLY place an account is deleted in response to a request. Super admin
// only. "delete" archives and removes the account through the app's
// archive-and-delete function (30 day recovery in the Archive, the same path as
// the Users tab), then marks the request completed. "decline" closes it with a
// reason, and an optional message the person sees in the app.

export const runtime = "nodejs";

const USER_MANAGEMENT_FUNCTION_URL = () =>
  `https://us-central1-${firebaseProjectId()}.cloudfunctions.net/sendFcmMessage`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin(req, { superAdminOnly: true });
  if (!caller) {
    return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // The deletion runs as the admin who approved it: their own ID token is
  // forwarded, and the function re-checks that they are an admin.
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();

  try {
    const request = await reviewDeletionRequest(
      getAdminDb(),
      id,
      { uid: caller.uid, email: caller.email, name: caller.name },
      body,
      async (userId, reason) => {
        const res = await fetch(USER_MANAGEMENT_FUNCTION_URL(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "deleteUser", userId, reason }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; archiveId?: string };
        if (!res.ok) throw new ReviewRefusal(data.error ?? `Deleting the account failed (${res.status})`, 502);
        return { archiveId: data.archiveId ?? null };
      }
    );
    console.log(
      `[admin/deletion-requests] ${caller.email} ${(body as { action?: string })?.action} request ${id} -> ${request.status}`
    );
    return NextResponse.json({ success: true, request });
  } catch (err) {
    if (err instanceof ReviewRefusal) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/deletion-requests POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
