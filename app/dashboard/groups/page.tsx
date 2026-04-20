import type { Metadata } from "next";
import { GroupsPageContent } from "@/components/dashboard/GroupsPageContent";

export const metadata: Metadata = { title: "Groups" };

export default function GroupsPage() {
  return <GroupsPageContent />;
}
