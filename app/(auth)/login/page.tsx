export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { SignInChoices } from "@/components/auth/SignInChoices";
import { sanitizeGroupId, sanitizeInviteRef, sanitizeNextPath } from "@/lib/deep-link-params";

export const metadata: Metadata = { title: "Sign in" };

interface Props {
  searchParams: Promise<{ ref?: string; gid?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  return (
    <SignInChoices
      mode="login"
      inviteRef={sanitizeInviteRef(params.ref)}
      inviteGid={sanitizeGroupId(params.gid)}
      nextPath={nextPath}
    />
  );
}
