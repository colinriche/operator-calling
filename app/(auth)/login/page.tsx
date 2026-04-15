export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { LoginTabs } from "@/components/auth/LoginTabs";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <LoginTabs />;
}
