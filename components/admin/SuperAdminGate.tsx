"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAdminRole } from "@/hooks/useAdminRole";

/**
 * Everything under /admin/super is for super admins. The route handlers behind it
 * enforce that (this is only the front door), so a plain admin who types the
 * address gets a clear page instead of a dashboard full of errors.
 *
 * The role is the one the SERVER resolved from the `admins` collection, and the
 * page shows which email that was, because the usual reason for "I am a super
 * admin but it says I'm not" is a record keyed by a different address than the
 * one this session signed in with.
 */
export function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const { loading, isSuperAdmin, role, email } = useAdminRole();

  if (loading) {
    return <p className="text-sm text-muted-foreground">Checking access…</p>;
  }
  if (isSuperAdmin) return <>{children}</>;

  return (
    <div className="max-w-xl mx-auto bg-card rounded-2xl border border-border/60 p-8 space-y-4">
      <div className="flex items-center gap-2 text-amber-700">
        <ShieldAlert className="w-5 h-5" />
        <h1 className="font-heading font-bold text-xl text-foreground">Super admins only</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        This area is for the <code>super_admin</code> role.
        {role ? (
          <>
            {" "}
            You&apos;re signed in as <strong>{email}</strong> with the <code>{role}</code> role.
          </>
        ) : (
          <> You&apos;re not signed in as an admin on this site.</>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        Roles are set in the <code>admins</code> collection, one document per person, named by their email in
        lowercase. If you are a super admin, check that the document&apos;s name matches the email shown above.
      </p>
      <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>
        Back to admin
      </Link>
    </div>
  );
}
