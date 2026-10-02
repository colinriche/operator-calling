import type { Metadata } from "next";
import { UserModerationPanel } from "@/components/admin/UserModerationPanel";

export const metadata: Metadata = { title: "User moderation" };

export default async function UserModerationPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <UserModerationPanel uid={uid} />;
}
