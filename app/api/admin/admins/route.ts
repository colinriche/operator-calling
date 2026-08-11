import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAdminManager } from "@/lib/admin-auth";
import {
  adminDocId,
  countSuperAdmins,
  deleteAdmin,
  isAdminRole,
  listAdmins,
  lookupAdmin,
  upsertAdmin,
} from "@/lib/admins";

// ─── /api/admin/admins ───────────────────────────────────────────────────────
//
// The only route that writes the `admins` collection. Reading the list needs
// any admin; changing it needs super_admin.
//
// Two invariants are enforced here rather than left to whoever is clicking:
//
//   • The last super_admin cannot be removed or demoted. Nothing else can
//     restore the permission afterwards — there is no console flow and no
//     bootstrap route — so the collection has to refuse to empty itself.
//   • You cannot demote or delete yourself. It is always a mistake in progress,
//     and a second super_admin can do it for you if it genuinely is not.

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    return NextResponse.json({
      admins: await listAdmins(),
      // Lets the panel hide controls it would only get a 403 from.
      canManage: caller.role === "super_admin",
      you: { email: caller.email, role: caller.role, source: caller.source },
    });
  } catch (err) {
    console.error("[admin/admins GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireAdminManager(req);
  if (!caller) {
    return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? adminDocId(body.email) : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const role = body.role;
  if (!isAdminRole(role)) {
    return NextResponse.json(
      { error: 'Role must be "admin" or "super_admin"' },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const existing = await lookupAdmin(email);

    // Demoting the last super_admin leaves nobody able to promote anyone.
    if (existing?.role === "super_admin" && role !== "super_admin") {
      if (email === caller.email) {
        return NextResponse.json(
          { error: "You cannot remove your own super admin role" },
          { status: 409 }
        );
      }
      if ((await countSuperAdmins()) <= 1) {
        return NextResponse.json(
          { error: "This is the only super admin — promote someone else first" },
          { status: 409 }
        );
      }
    }

    const record = await upsertAdmin({ email, name, role, actorEmail: caller.email });
    console.log(
      `[admin/admins] ${caller.email} ${existing ? "updated" : "created"} ${email} as ${role}`
    );
    return NextResponse.json({ admin: record, created: !existing });
  } catch (err) {
    console.error("[admin/admins POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await requireAdminManager(req);
  if (!caller) {
    return NextResponse.json({ error: "Super admin role required" }, { status: 403 });
  }

  const email = adminDocId(new URL(req.url).searchParams.get("email") ?? "");
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  if (email === caller.email) {
    return NextResponse.json(
      { error: "You cannot remove your own admin access" },
      { status: 409 }
    );
  }

  try {
    const existing = await lookupAdmin(email);
    if (!existing) {
      return NextResponse.json({ error: "No such admin" }, { status: 404 });
    }

    if (existing.role === "super_admin" && (await countSuperAdmins()) <= 1) {
      return NextResponse.json(
        { error: "This is the only super admin — promote someone else first" },
        { status: 409 }
      );
    }

    await deleteAdmin(email);
    console.log(`[admin/admins] ${caller.email} removed ${email}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/admins DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
