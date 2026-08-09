import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminServices } from "@/lib/firebase-admin";
import { deleteArchivePermanently } from "@/lib/user-archive";

interface ArchiveRow {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  status: string;
  matchedDocumentCount: number;
  archivedAt: string | null;
  deletedAt: string | null;
  completedAt: string | null;
  archivedBy: string | null;
  deletedBy: string | null;
  deletionReason: string;
  deletionType: string;
}

// Was a local copy that only looked at user/{auth.uid}. A Firestore `user`
// document does not reliably live there — phone auth mints a fresh uid, so a
// linked account's profile stays under its original document id. That made this
// route 403 real admins whose browser showed them as admins, exactly as it did
// on the outreach panel. lib/admin-auth.ts resolves a profile the same way
// hooks/useAuth.ts does.
async function requireArchiveAccess(
  req: NextRequest,
  superAdminOnly = false
): Promise<{ db: FirebaseFirestore.Firestore } | null> {
  const caller = await requireAdmin(req, { superAdminOnly });
  if (!caller) return null;
  return { db: getAdminServices().db };
}

function toIso(value: unknown): string | null {
  const date =
    (value as { toDate?: () => Date } | null)?.toDate?.() ??
    (value instanceof Date ? value : null);
  return date ? date.toISOString() : null;
}

export async function GET(req: NextRequest) {
  try {
    const services = await requireArchiveAccess(req);
    if (!services) {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    const snap = await services.db
      .collection("Archive")
      .orderBy("archivedAt", "desc")
      .limit(50)
      .get();

    const archives: ArchiveRow[] = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      const userData = (data.userData ?? {}) as Record<string, unknown>;
      return {
        id: docSnap.id,
        userId: String(data.userId ?? ""),
        displayName: String(
          userData.displayName ?? userData.name ?? userData.username ?? "Archived user"
        ),
        email: String(userData.email ?? ""),
        status: String(data.status ?? "unknown"),
        matchedDocumentCount:
          typeof data.matchedDocumentCount === "number" ? data.matchedDocumentCount : 0,
        archivedAt: toIso(data.archivedAt),
        deletedAt: toIso(data.deletedAt),
        completedAt: toIso(data.completedAt),
        archivedBy: typeof data.archivedBy === "string" ? data.archivedBy : null,
        deletedBy: typeof data.deletedBy === "string" ? data.deletedBy : null,
        deletionReason:
          typeof data.deletionReason === "string" ? data.deletionReason : "Not recorded",
        deletionType: typeof data.deletionType === "string" ? data.deletionType : "unknown",
      };
    });

    return NextResponse.json({ archives });
  } catch (err) {
    console.error("[admin/archive]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const services = await requireArchiveAccess(req, true);
    if (!services) {
      return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
    }

    let body: { archiveId?: string; writtenRequestReference?: string };
    try {
      body = (await req.json()) as { archiveId?: string; writtenRequestReference?: string };
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    if (!body.archiveId) {
      return NextResponse.json({ error: "archiveId is required" }, { status: 400 });
    }
    if (!body.writtenRequestReference?.trim()) {
      return NextResponse.json(
        { error: "Written request reference is required before removing an archive" },
        { status: 400 }
      );
    }

    await deleteArchivePermanently(services.db, body.archiveId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/archive DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
