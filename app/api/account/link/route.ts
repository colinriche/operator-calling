import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminServices() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return { db: getFirestore(), adminAuth: getAuth() };
}

// ─── POST /api/account/link ───────────────────────────────────────────────────
//
// Merges a web account into a mobile app account using a Support Code
// (systemName). The app account is the primary account — its UID, role, and
// document ID are retained. The web account document is deleted after a
// successful merge.
//
// The endpoint is called repeatedly as the user progresses through steps:
//
//   Step 1 — enter support code:
//     body: { supportCode }
//     → { status: "email_required" }      phone user must verify app email
//     → { status: "name_conflict", webName, appName }  user must pick a name
//     → { status: "linked" }              merge complete
//     → { status: "email_mismatch", message }
//     → { status: "not_found" | "multiple_matches" | "already_linked" | "error", message }
//
//   Step 2 (phone users) — verify email ownership:
//     body: { supportCode, emailVerification }
//     → { status: "name_conflict" | "linked" | "email_mismatch" | "error" }
//
//   Step 3 (name conflict) — choose a name:
//     body: { supportCode, emailVerification?, preferredName }
//     → { status: "linked" | "error" }

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ status: "error", message: "Unauthenticated" }, { status: 401 });
  }

  let body: {
    supportCode?: string;
    emailVerification?: string;
    preferredName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid body" }, { status: 400 });
  }

  const { supportCode, emailVerification, preferredName } = body;
  if (!supportCode?.trim()) {
    return NextResponse.json({ status: "error", message: "supportCode is required" }, { status: 400 });
  }

  const { db, adminAuth } = getAdminServices();

  // ── Verify caller ───────────────────────────────────────────────────────────
  let webUid: string;
  let webEmail: string | null;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    webUid = decoded.uid;
    // email is present for Google/email-password users; null for phone-only users
    webEmail = decoded.email ?? null;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid token" }, { status: 401 });
  }

  const normalizedCode = supportCode.trim().toLowerCase();

  // ── Look up app account by systemName ───────────────────────────────────────
  // Fetch up to 2 to detect duplicates without reading more docs than necessary.
  let appQuery;
  try {
    appQuery = await db.collection("user")
      .where("systemName", "==", normalizedCode)
      .limit(2)
      .get();
  } catch (err) {
    console.error("[account/link] systemName lookup failed", err);
    return NextResponse.json({ status: "error", message: "Server error during lookup" }, { status: 500 });
  }

  if (appQuery.empty) {
    return NextResponse.json({
      status: "not_found",
      message: "Support code not found. Check your app settings and try again.",
    });
  }
  if (appQuery.size > 1) {
    return NextResponse.json({
      status: "multiple_matches",
      message: "More than one account matches this code. Please contact support.",
    });
  }

  const appDoc = appQuery.docs[0];
  const appDocId = appDoc.id;
  const appData = appDoc.data();

  // ── Guard: not already linked ───────────────────────────────────────────────
  if (appData.linkedWebUid === webUid) {
    return NextResponse.json({
      status: "already_linked",
      message: "Your accounts are already linked.",
    });
  }
  if (appData.linkedWebUid && appData.linkedWebUid !== webUid) {
    return NextResponse.json({
      status: "already_linked",
      message: "This app account is already linked to a different web account.",
    });
  }

  // ── Guard: don't link an app account to itself ──────────────────────────────
  if (appDocId === webUid) {
    return NextResponse.json({
      status: "already_linked",
      message: "Your accounts are already linked.",
    });
  }

  // ── Email validation ────────────────────────────────────────────────────────
  const appEmail = (appData.email as string | undefined)?.trim().toLowerCase() ?? null;

  if (webEmail) {
    // Google / email-password: auto-check email against app account
    if (!appEmail || webEmail.toLowerCase() !== appEmail) {
      return NextResponse.json({
        status: "email_mismatch",
        message: `Your sign-in email (${webEmail}) doesn't match the email on your app account. ` +
          `Open the app, go to Settings and correct your email to ${webEmail}, then try linking again.`,
      });
    }
  } else {
    // Phone-only auth: require the user to enter the app account email to verify ownership
    if (!emailVerification?.trim()) {
      return NextResponse.json({
        status: "email_required",
        message: "Enter the email address on your app account to confirm you own it.",
      });
    }
    const enteredEmail = emailVerification.trim().toLowerCase();
    if (!appEmail || enteredEmail !== appEmail) {
      return NextResponse.json({
        status: "email_mismatch",
        message: "That email doesn't match the one on your app account. " +
          "Open the app, check your email in Settings, and try again.",
      });
    }
  }

  // ── Read web account doc ────────────────────────────────────────────────────
  const webRef = db.collection("user").doc(webUid);
  const webDocSnap = await webRef.get();
  const webData = webDocSnap.exists ? webDocSnap.data()! : {};

  // ── Name conflict check ─────────────────────────────────────────────────────
  const webName = ((webData.displayName as string | undefined) ?? (webData.name as string | undefined) ?? "").trim();
  const appName = ((appData.displayName as string | undefined) ?? (appData.name as string | undefined) ?? "").trim();
  const namesConflict = webName && appName && webName.toLowerCase() !== appName.toLowerCase();

  if (namesConflict && !preferredName?.trim()) {
    return NextResponse.json({
      status: "name_conflict",
      webName,
      appName,
    });
  }

  const finalName = preferredName?.trim() || appName || webName;

  // ── Execute merge in a Firestore transaction ────────────────────────────────
  try {
    await db.runTransaction(async (t) => {
      const appRef = db.collection("user").doc(appDocId);

      // Re-read both docs inside the transaction for consistency
      const [appDocTx, webDocTx] = await Promise.all([
        t.get(appRef),
        t.get(webRef),
      ]);

      if (!appDocTx.exists) {
        throw new Error("App account document no longer exists — it may have been deleted.");
      }

      const appDataTx = appDocTx.data()!;

      // Safety: verify the systemName still matches (guards against concurrent changes)
      const storedCode = (appDataTx.systemName as string | undefined) ?? "";
      if (storedCode.toLowerCase() !== normalizedCode) {
        throw new Error("App account data changed during linking. Please try again.");
      }

      const webDataTx = webDocTx.exists ? webDocTx.data()! : {};

      // Build merged data. App account fields take priority; web fields fill gaps.
      const mergedUpdate: Record<string, unknown> = {
        // Identity — app always wins
        uid: appDocId,
        role: appDataTx.role ?? "user",
        systemName: appDataTx.systemName,

        // Chosen name
        displayName: finalName,
        name: finalName,

        // Email: keep app email (used for the user's login in the app)
        // web email stored separately so future web logins can find this doc
        email: appDataTx.email ?? webDataTx.email ?? webEmail,
        linkedWebEmail: webEmail,

        // Web UID stored for post-link fallback lookups in useAuth
        linkedWebUid: webUid,

        // Profile photo: prefer app's existing photo; fall back to web (Google) photo
        ...(appDataTx.photoURL
          ? {}
          : { photoURL: (webDataTx.photoURL as string | undefined) ?? null }),

        // Bio: prefer app's, fill from web if missing
        bio: (appDataTx.bio as string | undefined) ?? (webDataTx.bio as string | undefined) ?? null,

        // Interests: merge and deduplicate, cap at 10
        interests: mergeArrays(
          appDataTx.interests as string[] | undefined,
          webDataTx.interests as string[] | undefined,
        ),

        // Call preferences: keep app's complete set; fall back to web's
        callPreferences: appDataTx.callPreferences ?? webDataTx.callPreferences ?? {
          availableHours: { start: "09:00", end: "22:00" },
          timezone: "Europe/London",
          allowUnknownCalls: false,
        },

        // Privacy: keep app's
        privacy: appDataTx.privacy ?? webDataTx.privacy ?? {
          showOnlineStatus: true,
          allowGroupDiscovery: true,
          blockedUsers: [],
        },

        // Notifications: keep app's
        notifications: appDataTx.notifications ?? webDataTx.notifications ?? {
          email: true,
          push: true,
          upcomingCallReminder: true,
        },

        // Profile completeness: take the higher of the two
        completeness: Math.max(
          (appDataTx.completeness as number | undefined) ?? 0,
          (webDataTx.completeness as number | undefined) ?? 0,
        ),

        updatedAt: FieldValue.serverTimestamp(),
      };

      // Update the app account doc
      t.update(appRef, mergedUpdate);

      // Delete the web account doc only after the update is staged
      // (Firestore commits the whole transaction atomically)
      if (webDocTx.exists) {
        t.delete(webRef);
      }
    });

    return NextResponse.json({ status: "linked" });
  } catch (err) {
    console.error("[account/link] transaction failed:", err);
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "Linking failed. Please try again.",
      },
      { status: 500 },
    );
  }
}

function mergeArrays(a: string[] | undefined, b: string[] | undefined): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])].slice(0, 10);
}
