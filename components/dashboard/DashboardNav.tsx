"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Phone, LayoutDashboard, User, Users, Bell, Settings, LogOut, Calendar, PhoneCall, Lock, Megaphone, Shield, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview", gated: false },
  { href: "/dashboard/calls", icon: PhoneCall, label: "Calls", gated: true },
  { href: "/dashboard/schedule", icon: Calendar, label: "Schedule", gated: true },
  { href: "/dashboard/groups", icon: Users, label: "Groups", gated: true },
  { href: "/dashboard/notifications", icon: Bell, label: "Notifications", gated: false },
  { href: "/dashboard/profile", icon: User, label: "Profile", gated: false },
  { href: "/dashboard/settings", icon: Settings, label: "Settings", gated: false },
];

// Shown only to admins. Nothing else in the app links into /admin, so without
// these the area is reachable only by typing a URL.
const adminItems = [
  { href: "/admin", icon: Shield, label: "Admin area" },
  { href: "/admin/outreach", icon: Megaphone, label: "Outreach" },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, isLinked } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const [open, setOpen] = useState(false);

  // Navigating from inside the drawer has to close it. Without this the panel
  // stays over the page it just moved to, which on a phone looks like the link
  // did nothing.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await signOut(auth);
    document.cookie = "__session=; path=/; SameSite=Lax; max-age=0";
    router.push("/");
  }

  // Rendered into both the desktop sidebar and the mobile drawer. Shared rather
  // than duplicated so the two cannot drift apart — the mobile menu is exactly
  // the desktop menu, including the link gating and the admin section.
  function items() {
    return (
      <>
        {navItems.map(({ href, icon: Icon, label, gated }) => {
          const locked = gated && !isLinked;
          if (locked) {
            return (
              <div
                key={href}
                title="Link your app account to access this"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground/40 cursor-not-allowed select-none"
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                <Lock className="w-3 h-3 ml-auto shrink-0" />
              </div>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        {isAdmin && (
          <div className="mt-4 pt-4 border-t border-border space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Admin
            </p>
            {adminItems.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  pathname === href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </>
    );
  }

  function accountDetails() {
    if (loading || !user) return null;
    return (
      <div className="mt-3 pt-3 border-t border-border/60 space-y-1">
        <p className="text-sm font-semibold text-foreground truncate">
          {profile?.displayName ?? user.displayName ?? user.email}
        </p>
        <p className="text-xs text-muted-foreground capitalize">
          {profile?.role ?? "user"}
        </p>
        {(profile?.systemName ?? profile?.linkedSystemName) && (
          <p className="text-xs text-muted-foreground truncate">
            @{profile?.systemName ?? profile?.linkedSystemName}
          </p>
        )}
        <p className="text-xs text-muted-foreground truncate">
          {profile?.email ?? user.email}
        </p>
        {(profile?.phoneNumber ?? user.phoneNumber) && (
          <p className="text-xs text-muted-foreground truncate">
            {profile?.phoneNumber ?? user.phoneNumber}
          </p>
        )}
      </div>
    );
  }

  const signOutButton = (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground hover:text-foreground gap-3"
      onClick={handleSignOut}
    >
      <LogOut className="w-4 h-4" />
      Sign out
    </Button>
  );

  return (
    <>
      {/* Mobile bar. Below md the sidebar is hidden, and until this existed the
          dashboard had no navigation at all on a phone. */}
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
          href="/dashboard"
          className="flex items-center gap-2 font-heading font-bold text-sm text-foreground"
        >
          <span className="w-6 h-6 rounded-full gradient-gold flex items-center justify-center">
            <Phone className="w-3 h-3 text-primary-foreground" />
          </span>
          The Operator
        </Link>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        {/* Same column structure as the sidebar, so the list scrolls and the
            sign-out button stays put on a short screen. */}
        {/* Width is left to SheetContent's own `w-3/4 sm:max-w-sm`. Overriding
            it with a plain `w-72` does not reliably win: the sheet sets width
            through a `data-[side=left]:` variant, which tailwind-merge does not
            treat as conflicting, so which one applies comes down to stylesheet
            order. */}
        <SheetContent side="left" className="gap-0 p-0">
          <div className="p-5 border-b border-border">
            <SheetTitle className="flex items-center gap-2 font-heading font-bold text-base text-foreground">
              <span className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center">
                <Phone className="w-3.5 h-3.5 text-primary-foreground" />
              </span>
              The Operator
            </SheetTitle>
            {accountDetails()}
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-0.5">
            {items()}
          </nav>

          <div className="p-4 border-t border-border">{signOutButton}</div>
        </SheetContent>
      </Sheet>

      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-card sticky top-0 h-screen">
        <div className="p-5 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2 font-heading font-bold text-base text-foreground">
            <span className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center">
              <Phone className="w-3.5 h-3.5 text-primary-foreground" />
            </span>
            The Operator
          </Link>
          {accountDetails()}
        </div>

        {/* min-h-0 is doing real work here. A flex child defaults to
            min-height:auto, so without it this refuses to shrink below its
            content, overflow-y-auto never engages, and a long list pushes the
            sign-out button off the bottom of the screen unreachably. */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-0.5">
          {items()}
        </nav>

        <div className="p-4 border-t border-border">{signOutButton}</div>
      </aside>
    </>
  );
}
