import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Column on mobile so the nav bar sits above the content, row on desktop so
    // the sidebar sits beside it. AdminNav emits both and each hides itself at
    // the other breakpoint.
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <AdminNav />
      <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
