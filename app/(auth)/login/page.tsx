export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { LoginTabs } from "@/components/auth/LoginTabs";
import { sanitizeMethod, sanitizeNextPath } from "@/lib/deep-link-params";

export const metadata: Metadata = { title: "Sign in" };

interface Props {
  searchParams: Promise<{ method?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const method = sanitizeMethod(params.method);
  const nextPath = sanitizeNextPath(params.next);
  return <LoginTabs initialMethod={method} nextPath={nextPath} />;
}
