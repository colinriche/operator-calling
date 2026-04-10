export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QRInviteFlow } from "@/components/qrinvite/QRInviteFlow";
import type { InviteType } from "@/lib/qrinvite";

export const metadata: Metadata = {
  title: "You've been invited",
  description: "Open this link to connect on The Operator.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string; type?: string }>;
}

export default async function QRInvitePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token?.trim();
  const rawType = params.type?.trim();

  // Basic guard: missing or obviously malformed token → redirect home
  if (!token || token.length < 8 || token.length > 256) {
    redirect("/");
  }

  const type: InviteType =
    rawType === "group" || rawType === "personal" ? rawType : "personal";

  return <QRInviteFlow token={token} type={type} />;
}
