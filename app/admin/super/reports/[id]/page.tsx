import type { Metadata } from "next";
import { ReportDetail } from "@/components/admin/ReportDetail";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportDetail id={id} />;
}
