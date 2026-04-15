import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { LinkAccountBanner } from "@/components/shared/LinkAccountBanner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardNav />
      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        <LinkAccountBanner />
        {children}
      </main>
    </div>
  );
}
