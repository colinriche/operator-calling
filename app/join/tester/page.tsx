import type { Metadata } from "next";
import { TesterJoin } from "@/components/waitlist/TesterJoin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join early access",
  robots: { index: false, follow: false },
};

export default async function TesterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.t;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <TesterJoin token={token ?? ""} />
    </div>
  );
}
