export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { ProfileEditor } from "@/components/dashboard/ProfileEditor";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return <ProfileEditor />;
}
