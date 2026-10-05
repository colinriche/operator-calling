import { NextResponse } from "next/server";

// Retired. This route used to archive and delete the signed-in person's account
// on the spot. Accounts are no longer deleted automatically: the website files a
// request through /api/account/deletion and the super admin processes it by
// hand after the 30 day restore window.

export async function POST() {
  return NextResponse.json(
    { error: "Accounts are no longer deleted automatically. Use the deletion request on your profile page." },
    { status: 410 }
  );
}
