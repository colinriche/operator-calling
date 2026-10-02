import type { AccountStatus, ReportOutcome, ReportStatus } from "@/lib/moderation-model";

export const STATUS_LABEL: Record<ReportStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  resolved: "Resolved",
};

export const OUTCOME_LABEL: Record<ReportOutcome, string> = {
  dismissed: "Dismissed",
  warned: "Warned",
  suspended: "Suspended",
  banned: "Banned",
  auto_calls_disabled: "Auto calls disabled",
};

export const ACCOUNT_LABEL: Record<AccountStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  banned: "Banned",
};

export const STATUS_TONE: Record<ReportStatus, string> = {
  new: "border-amber-400 text-amber-700 bg-amber-50",
  reviewing: "border-blue-400 text-blue-700 bg-blue-50",
  resolved: "border-border text-muted-foreground bg-muted/50",
};

export const ACCOUNT_TONE: Record<AccountStatus, string> = {
  active: "border-green-500/40 text-green-700 bg-green-50",
  suspended: "border-amber-400 text-amber-700 bg-amber-50",
  banned: "border-destructive/40 text-destructive bg-destructive/5",
};

/** "2 Oct" this year, "2 Oct 2025" otherwise. */
export function shortDate(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function dateTime(iso: string | null): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ACTION_LABEL: Record<string, string> = {
  start_review: "Started review",
  dismiss: "Dismissed",
  warn: "Warned",
  suspend: "Suspended",
  ban: "Banned",
  unban: "Unbanned",
  unsuspend: "Suspension lifted",
  disable_auto_calls: "Disabled auto calls",
  enable_auto_calls: "Enabled auto calls",
  note: "Added a note",
};
