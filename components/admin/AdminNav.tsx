"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Phone,
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  Shield,
  BarChart3,
  Megaphone,
  Flag,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import { useAdminRole } from "@/hooks/useAdminRole";

// ─── Admin navigation ────────────────────────────────────────────────────────
//
// Lifted out of app/admin/layout.tsx so the desktop sidebar and the mobile
// drawer are built from one list. It also has to be a client component: the
// drawer needs open state, and the icons are component references, which cannot
// be passed from a server component as props.

interface NavItem {
  href: string;
  icon: typeof Phone;
  label: string;
  superOnly?: boolean;
  /** Hidden unless the caller is a super admin. */
  requiresSuper?: boolean;
  /** Show the unresolved-reports count beside the label. */
  badge?: boolean;
  /** Highlight for any path under href, not only an exact match. */
  prefix?: boolean;
}

const adminNav: NavItem[] = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/members", icon: Users, label: "Members" },
  { href: "/admin/schedules", icon: Calendar, label: "Schedules" },
  { href: "/admin/moderation", icon: Shield, label: "Moderation" },
  { href: "/admin/settings", icon: Settings, label: "Group settings" },
  { href: "/admin/outreach", icon: Megaphone, label: "Outreach" },
  // Moderation queue. Shown to super admins only (it lives inside Super Admin
  // and every route behind it re-checks), with the unresolved count as a badge.
  { href: "/admin/super/reports", icon: Flag, label: "Reports", requiresSuper: true, badge: true, prefix: true },
  { href: "/admin/super", icon: BarChart3, label: "Super admin", superOnly: true },
];

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { isSuperAdmin } = useAdminRole();
  const adminFetch = useAdminFetch();
  const [unresolved, setUnresolved] = useState<number | null>(null);

  // The badge: reports still New or Reviewing. Refreshed on navigation, so
  // resolving one and going back to the queue shows the new number.
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    adminFetch<{ counts: { unresolved: number } }>("/api/admin/reports?status=new")
      .then((d) => {
        if (!cancelled) setUnresolved(d.counts.unresolved);
      })
      .catch(() => {
        if (!cancelled) setUnresolved(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, adminFetch, pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function items() {
    return adminNav
      .filter((item) => !item.requiresSuper || isSuperAdmin)
      .map(({ href, icon: Icon, label, superOnly, badge, prefix }) => {
        const active = prefix ? pathname.startsWith(href) : pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
              // Exact match, not startsWith, unless asked: /admin is a prefix of
              // every other entry and would otherwise light up on all of them.
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
              superOnly ? "mt-4 border-t border-border pt-4 rounded-t-none" : ""
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {badge && unresolved !== null && unresolved > 0 && (
              <span
                aria-label={`${unresolved} unresolved reports`}
                className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-xs font-semibold text-destructive-foreground"
              >
                {unresolved}
              </span>
            )}
          </Link>
        );
      });
  }

  const footerLinks = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
      <Link
        href="/admin-login"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors block"
      >
        Admin login
      </Link>
      <Link
        href="/dashboard"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors block"
      >
        ← Back to dashboard
      </Link>
    </>
  );

  return (
    <>
      {/* Mobile bar. Replaces a horizontally-scrolling strip of seven links,
          which hid its own right-hand end on a narrow screen. */}
      <div className="md:hidden sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -ml-2 rounded-lg text-foreground hover:bg-muted transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 font-heading font-bold text-sm text-foreground"
        >
          <span className="w-6 h-6 rounded-full gradient-gold flex items-center justify-center">
            <Phone className="w-3 h-3 text-primary-foreground" />
          </span>
          Admin
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        {/* Width left to SheetContent's own responsive classes - see the note
            in DashboardNav about why overriding it here is unreliable. */}
        <SheetContent side="left" className="gap-0 p-0">
          <div className="p-5 border-b border-border">
            <SheetTitle className="flex items-center gap-2 font-heading font-bold text-base text-foreground">
              <span className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center">
                <Phone className="w-3.5 h-3.5 text-primary-foreground" />
              </span>
              Admin
            </SheetTitle>
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-0.5">
            {items()}
          </nav>

          <div className="p-4 border-t border-border space-y-2">{footerLinks}</div>
        </SheetContent>
      </Sheet>

      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-card sticky top-0 h-screen">
        <div className="p-5 border-b border-border">
          <Link
            href="/"
            className="flex items-center gap-2 font-heading font-bold text-base text-foreground"
          >
            <span className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center">
              <Phone className="w-3.5 h-3.5 text-primary-foreground" />
            </span>
            Admin
          </Link>
        </div>

        {/* min-h-0 lets this actually scroll. Without it the flex child keeps
            its content height, and the footer below is pushed out of reach. */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-0.5">
          {items()}
        </nav>

        <div className="p-4 border-t border-border space-y-2">{footerLinks}</div>
      </aside>
    </>
  );
}
