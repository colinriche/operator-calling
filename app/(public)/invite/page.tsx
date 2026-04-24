import type { Metadata } from "next";
import Link from "next/link";
import { Phone } from "lucide-react";
import { sanitizeGroupId, sanitizeInviteRef } from "@/lib/deep-link-params";

export const metadata: Metadata = { title: "You've been invited — The Operator" };

interface Props {
  searchParams: Promise<{ ref?: string; gid?: string }>;
}

export default async function InvitePage({ searchParams }: Props) {
  const params = await searchParams;
  const ref = sanitizeInviteRef(params.ref);
  const gid = sanitizeGroupId(params.gid);

  const signupHref =
    ref || gid
      ? `/signup?ref=${encodeURIComponent(ref)}&gid=${encodeURIComponent(gid)}`
      : "/signup";

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <span className="w-16 h-16 rounded-full gradient-gold flex items-center justify-center shadow-lg">
            <Phone className="w-7 h-7 text-primary-foreground" />
          </span>
        </div>

        <div className="space-y-3">
          <h1 className="font-heading font-bold text-3xl text-foreground">
            You&apos;ve been invited to The Operator
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            The Operator is a voice-first communication app — real calls, no
            endless messaging. Create a free account to connect with the person
            who invited you.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href={signupHref}
            className="block w-full gradient-gold text-primary-foreground font-semibold text-base py-3 px-6 rounded-lg text-center transition-opacity hover:opacity-90"
          >
            Create your free account
          </Link>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
