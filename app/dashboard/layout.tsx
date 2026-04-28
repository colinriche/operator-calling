import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { LinkAccountBanner } from "@/components/shared/LinkAccountBanner";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardNav />
      <main className="flex-1 overflow-auto">
        <div className="flex justify-end px-6 lg:px-8 pt-4">
          <ThemeToggle />
        </div>
        <div className="px-6 lg:px-8 pb-8">
          <LinkAccountBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
