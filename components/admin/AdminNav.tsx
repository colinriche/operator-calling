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
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

// ─── Admin navigation ────────────────────────────────────────────────────────
//
// Lifted out of app/admin/layout.tsx so the desktop sidebar and the mobile
// drawer are built from one list. It also has to be a client component: the
// drawer needs open state, and the icons are component references, which cannot
// be passed from a server component as props.

const adminNav = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/members", icon: Users, label: "Members" },
  { href: "/admin/schedules", icon: Calendar, label: "Schedules" },
  { href: "/admin/moderation", icon: Shield, label: "Moderation" },
  { href: "/admin/settings", icon: Settings, label: "Group settings" },
  { href: "/admin/outreach", icon: Megaphone, label: "Outreach" },
  { href: "/admin/super", icon: BarChart3, label: "Super admin", superOnly: true },
];

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function items() {
    return adminNav.map(({ href, icon: Icon, label, superOnly }) => (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
          // Exact match, not startsWith: /admin is a prefix of every other
          // entry and would otherwise light up on all of them.
          pathname === href
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
          superOnly ? "mt-4 border-t border-border pt-4 rounded-t-none" : ""
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </Link>
    ));
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
        {/* Width left to SheetContent's own responsive classes — see the note
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
