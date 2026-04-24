export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { QRInviteFlow } from "@/components/qrinvite/QRInviteFlow";
import { sanitizeGroupId, sanitizeInviteType, sanitizeToken } from "@/lib/deep-link-params";

export const metadata: Metadata = {
  title: "You've been invited",
  description: "Open this link to connect on The Operator.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string; type?: string; groupId?: string; ctx?: string }>;
}

export default async function QRInvitePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = sanitizeToken(params.token);
  const type = sanitizeInviteType(params.type);
  void sanitizeGroupId(params.groupId);
  void params.ctx?.trim();

  // Pass invalid state directly to the flow — never silently redirect.
  // The user scanned a QR code and deserves to know what went wrong.
  if (!token) {
    return <QRInviteFlow token="" type={type} invalidReason="missing" />;
  }

  return <QRInviteFlow token={token} type={type} />;
}
