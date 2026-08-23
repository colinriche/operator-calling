import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { LinkAccountBanner } from "@/components/shared/LinkAccountBanner";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // Column on mobile so the nav bar sits above the content; row on desktop so
    // the sidebar sits beside it. DashboardNav emits the bar and the sidebar as
    // siblings, and each hides itself at the other breakpoint.
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      {/* main drops its old overflow-auto: a nested scroll container inside a
          flex row is the other way this page stops scrolling to the bottom. */}
      <DashboardNav />
      <main className="flex-1 min-w-0">
        <div className="flex justify-end px-4 sm:px-6 lg:px-8 pt-4">
          <ThemeToggle />
        </div>
        <div className="px-4 sm:px-6 lg:px-8 pb-8">
          <LinkAccountBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
