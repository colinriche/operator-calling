export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { AuthForm } from "@/components/shared/AuthForm";

export const metadata: Metadata = { title: "Create account" };

interface Props {
  searchParams: Promise<{ ref?: string; gid?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="signup"
      inviteRef={params.ref ?? ""}
      inviteGid={params.gid ?? ""}
    />
  );
}
