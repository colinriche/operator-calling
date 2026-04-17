export const dynamic = "force-dynamic";

import type { Metadata } from "next";
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

  const VALID_TYPES: InviteType[] = [
    "personal", "family", "work", "sport", "social", "event", "group", "other",
  ];
  const type: InviteType =
    VALID_TYPES.includes(rawType as InviteType) ? (rawType as InviteType) : "personal";

  // Pass invalid state directly to the flow — never silently redirect.
  // The user scanned a QR code and deserves to know what went wrong.
  if (!token || token.length < 8) {
    return <QRInviteFlow token="" type={type} invalidReason="missing" />;
  }
  if (token.length > 2048) {
    return <QRInviteFlow token="" type={type} invalidReason="malformed" />;
  }

  return <QRInviteFlow token={token} type={type} />;
}
