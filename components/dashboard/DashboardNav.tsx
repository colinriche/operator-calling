"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Phone, LayoutDashboard, User, Users, Bell, Settings, LogOut, Calendar, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/calls", icon: PhoneCall, label: "Calls" },
  { href: "/dashboard/schedule", icon: Calendar, label: "Schedule" },
  { href: "/dashboard/groups", icon: Users, label: "Groups" },
  { href: "/dashboard/notifications", icon: Bell, label: "Notifications" },
  { href: "/dashboard/profile", icon: User, label: "Profile" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  async function handleSignOut() {
    await signOut(auth);
    router.push("/");
  }

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-card min-h-screen sticky top-0 h-screen">
      <div className="p-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2 font-heading font-bold text-base text-foreground">
          <span className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center">
            <Phone className="w-3.5 h-3.5 text-primary-foreground" />
          </span>
          The Operator
        </Link>
        {!loading && user && (
          <div className="mt-3 pt-3 border-t border-border/60">
            <p className="text-sm font-semibold text-foreground truncate">
              {profile?.displayName ?? user.displayName ?? user.email}
            </p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">
              {profile?.role ?? "user"}
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => (
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
      </nav>

      <div className="p-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground gap-3"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
