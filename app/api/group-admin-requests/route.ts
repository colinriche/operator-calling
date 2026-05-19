import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const {
    requesterName,
    requesterEmail,
    groupName,
    description,
    location,
    memberEmails,
  } = body as Record<string, unknown>;

  if (
    typeof requesterName !== "string" || !requesterName.trim() ||
    typeof requesterEmail !== "string" || !EMAIL_RE.test(requesterEmail.trim()) ||
    typeof groupName !== "string" || !groupName.trim()
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const safeMemberEmails = Array.isArray(memberEmails)
    ? (memberEmails as unknown[]).filter((e): e is string => typeof e === "string" && EMAIL_RE.test(e))
    : [];

  const { db } = getAdminServices();
  await db.collection("group_admin_requests").add({
    requesterName: requesterName.trim(),
    requesterEmail: requesterEmail.trim().toLowerCase(),
    groupName: groupName.trim(),
    description: typeof description === "string" ? description.trim() : "",
    location: typeof location === "string" && location.trim() ? location.trim() : "global",
    memberEmails: safeMemberEmails,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
