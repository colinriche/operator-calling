export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { AuthForm } from "@/components/shared/AuthForm";
import { sanitizeGroupId, sanitizeInviteRef, sanitizeNextPath } from "@/lib/deep-link-params";

export const metadata: Metadata = { title: "Create account" };

interface Props {
  searchParams: Promise<{ ref?: string; gid?: string; next?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const ref = sanitizeInviteRef(params.ref);
  const gid = sanitizeGroupId(params.gid);
  const nextPath = sanitizeNextPath(params.next);
  return (
    <AuthForm
      mode="signup"
      inviteRef={ref}
      inviteGid={gid}
      nextPath={nextPath}
    />
  );
}
