import { SuperAdminGate } from "@/components/admin/SuperAdminGate";

// Every page under /admin/super is super-admin only. The API routes behind them
// check the role themselves; this keeps a plain admin from landing on a page of
// errors.
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminGate>{children}</SuperAdminGate>;
}
