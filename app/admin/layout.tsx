import Link from "next/link";
import { Phone, LayoutDashboard, Users, Calendar, Settings, Shield, BarChart3 } from "lucide-react";

const adminNav = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/members", icon: Users, label: "Members" },
  { href: "/admin/schedules", icon: Calendar, label: "Schedules" },
  { href: "/admin/moderation", icon: Shield, label: "Moderation" },
  { href: "/admin/settings", icon: Settings, label: "Group settings" },
  { href: "/admin/super", icon: BarChart3, label: "Super admin", superOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-card min-h-screen sticky top-0 h-screen">
        <div className="p-5 border-b border-border">
          <Link href="/" className="flex items-center gap-2 font-heading font-bold text-base text-foreground">
            <span className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center">
              <Phone className="w-3.5 h-3.5 text-primary-foreground" />
            </span>
            Admin
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-0.5">
          {adminNav.map(({ href, icon: Icon, label, superOnly }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted ${superOnly ? "mt-4 border-t border-border pt-4" : ""}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to dashboard
          </Link>
        </div>
      </aside>

      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
