export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { AuthForm } from "@/components/shared/AuthForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
