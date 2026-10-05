export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { ProfileEditor } from "@/components/dashboard/ProfileEditor";
import { SignInMethods } from "@/components/dashboard/SignInMethods";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <SignInMethods />
      <ProfileEditor />
    </>
  );
}
