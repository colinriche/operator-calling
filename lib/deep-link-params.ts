import type { InviteType } from "@/lib/qrinvite";

const VALID_INVITE_TYPES: InviteType[] = [
  "personal",
  "family",
  "work",
  "sport",
  "social",
  "event",
  "group",
  "other",
];

const USERNAME_REGEX = /^[a-z0-9_.-]{2,32}$/i;
const ID_REGEX = /^[a-zA-Z0-9_-]{2,128}$/;

export function sanitizeInviteType(value: string | undefined): InviteType {
  if (!value) return "personal";
  const candidate = value.trim();
  return VALID_INVITE_TYPES.includes(candidate as InviteType) ? (candidate as InviteType) : "personal";
}

export function sanitizeToken(value: string | undefined): string | null {
  if (!value) return null;
  const token = value.trim();
  if (token.length < 8 || token.length > 2048) return null;
  return token;
}

export function sanitizeInviteRef(value: string | undefined): string {
  if (!value) return "";
  const ref = value.trim();
  return USERNAME_REGEX.test(ref) ? ref : "";
}

export function sanitizeGroupId(value: string | undefined): string {
  if (!value) return "";
  const gid = value.trim();
  return ID_REGEX.test(gid) ? gid : "";
}

export function sanitizeMethod(value: string | undefined): "email" | "phone" {
  return value === "phone" ? "phone" : "email";
}

export function sanitizeNextPath(value: string | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  const next = value.trim();
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("://")) return fallback;
  return next;
}
