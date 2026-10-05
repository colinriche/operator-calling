import type { Metadata } from "next";
import { ManagePanel } from "@/components/waitlist/ManagePanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your settings",
  // Manage URLs carry a bearer token; they must never be indexed or referred on.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.t;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <ManagePanel token={token ?? ""} />
    </div>
  );
}
