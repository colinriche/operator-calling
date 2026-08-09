import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { checkRateLimit, WAITLIST_LIMITS } from "@/lib/rate-limit";
import { COLLECTIONS } from "@/lib/waitlist/constants";
import { groupsDb } from "@/lib/waitlist/group-linking";
import { nextGlobalCall } from "@/lib/waitlist/global-schedule";
import { nextOccurrenceUtc, type WeeklyWindow } from "@/lib/waitlist/schedule";
import { waitlistDb } from "@/lib/waitlist/server";
import { visitorHashFrom } from "@/lib/waitlist/source-code";
import { SCHEDULE_ZONE, isValidTimezone } from "@/lib/waitlist/timezone";

// Self-service management for a registration, with no account required.
//
// The manage token is a bearer credential — holding it is authorisation. That
// is a deliberate trade: someone who registered interest with an email address
// has no other way to prove who they are, and forcing an account to leave a
// list they never needed an account to join would be worse.
//
// Consequences are bounded accordingly: this can change preferences and
// participation, and can never read the full email address, see anyone else's
// data, or take an action that costs money.

export const runtime = "nodejs";

async function findByToken(token: string) {
  const snap = await waitlistDb()
    .collection(COLLECTIONS.waitlistEntries)
    .where("manageToken", "==", token)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}${"•".repeat(4)}@${domain}`;
}

// ─── GET — everything the manage page renders ────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const doc = await findByToken(token);
    if (!doc) {
      return NextResponse.json({ error: "Link not recognised" }, { status: 404 });
    }

    const data = doc.data();
    const timezone = (data.timezone as string) || SCHEDULE_ZONE;

    // Upcoming window, resolved from the group's stored local definition rather
    // than a cached instant, so it stays correct across a DST change.
    let nextCall: string | null = null;
    let scheduleLabel: string | null = null;
    let groupCallsEnabled = false;
    if (data.groupId) {
      try {
        const groupSnap = await groupsDb()
          .collection("groups")
          .doc(data.groupId)
          .get();
        const group = groupSnap.data();
        groupCallsEnabled = group?.callsEnabled === true;
        // Only advertise a time when calls are actually running. Telling a
        // member "next call Sunday 7pm" for a paused group is worse than saying
        // nothing — they would turn up to silence.
        if (group?.scheduleLocalTime && groupCallsEnabled) {
          const window: WeeklyWindow = {
            weekday: group.scheduleWeekday ?? 0,
            localTime: group.scheduleLocalTime,
            zone: group.scheduleZone ?? SCHEDULE_ZONE,
          };
          nextCall = nextOccurrenceUtc(window).toISOString();
          scheduleLabel = `${window.localTime} ${window.zone.replace(/_/g, " ")}, weekly`;
        }
      } catch (err) {
        console.error("[waitlist/manage] schedule lookup failed:", err);
      }
    }

    // Early access runs on the global pool's own windows, which are unrelated
    // to any community group's schedule.
    let nextTesterCall: string | null = null;
    if (data.testerStatus === "active") {
      try {
        const next = await nextGlobalCall();
        nextTesterCall = next ? next.instant.toISOString() : null;
      } catch (err) {
        console.error("[waitlist/manage] global schedule lookup failed:", err);
      }
    }

    return NextResponse.json({
      nextTesterCall,
      maskedEmail: maskEmail((data.email as string) ?? ""),
      audienceLabel: data.publicAudienceLabel ?? null,
      communityInterest: data.communityInterest !== false,
      communityInterestStatus: data.communityInterestStatus ?? "active",
      groupId: data.groupId ?? null,
      groupMembership: data.groupMembership ?? "none",
      testerStatus: data.testerStatus ?? "none",
      timezone,
      timezoneSource: data.timezoneSource ?? "detected",
      nextCall,
      scheduleLabel,
      groupCallsEnabled,
    });
  } catch (err) {
    console.error("[waitlist/manage GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── PATCH — act on it ───────────────────────────────────────────────────────

type Action =
  | "set_timezone"
  | "community_pause"
  | "community_resume"
  | "community_withdraw"
  | "group_pause"
  | "group_resume"
  | "group_leave"
  | "tester_pause"
  | "tester_resume"
  | "tester_leave";

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const action = body.action as Action;
  if (!token || !action) {
    return NextResponse.json({ error: "Missing token or action" }, { status: 400 });
  }

  try {
    const db = waitlistDb();
    const limit = await checkRateLimit(db, COLLECTIONS.rateLimits, {
      scope: "waitlist_manage",
      identifier: visitorHashFrom(req.headers),
      ...WAITLIST_LIMITS.register,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many changes. Please try again shortly." },
        { status: 429 }
      );
    }

    const doc = await findByToken(token);
    if (!doc) {
      return NextResponse.json({ error: "Link not recognised" }, { status: 404 });
    }
    const data = doc.data();

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    let removeFromGroup = false;

    switch (action) {
      case "set_timezone": {
        if (!isValidTimezone(body.timezone)) {
          return NextResponse.json({ error: "Unknown time zone" }, { status: 400 });
        }
        update.timezone = body.timezone;
        update.timezoneSource = "user_selected";
        break;
      }

      // Community interest — whether they still want to hear about this
      // community. Never touches the group, and never deletes the attribution
      // their registration contributed to the demand record.
      case "community_pause":
        update.communityInterestStatus = "paused";
        break;
      case "community_resume":
        update.communityInterestStatus = "active";
        break;
      case "community_withdraw":
        update.communityInterestStatus = "withdrawn";
        update.communityWithdrawnAt = FieldValue.serverTimestamp();
        break;

      // Group participation — separate from the above. Leaving removes them
      // from the group but keeps the registration, its source attribution and
      // the demand it counted towards.
      case "group_pause":
        update.groupMembership = "paused";
        break;
      case "group_resume":
        update.groupMembership = "member";
        break;
      case "group_leave":
        update.groupMembership = "left";
        update.groupLeftAt = FieldValue.serverTimestamp();
        removeFromGroup = true;
        break;

      // Tester programme — independent of everything above. Rejoining needs an
      // account, so it is handled by /api/waitlist/tester, not here.
      case "tester_pause":
        update.testerStatus = "paused";
        break;
      case "tester_resume":
        update.testerStatus = "active";
        break;
      case "tester_leave":
        update.testerStatus = "left";
        update.testerLeftAt = FieldValue.serverTimestamp();
        break;

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await doc.ref.set(update, { merge: true });

    if (removeFromGroup && data.groupId) {
      const uid = (data.groupJoinedUid as string) ?? (data.testerUid as string);
      if (uid) {
        try {
          await groupsDb()
            .collection("groups")
            .doc(data.groupId)
            .set(
              {
                memberIds: FieldValue.arrayRemove(uid),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
        } catch (err) {
          console.error("[waitlist/manage] group removal failed:", err);
        }
      }

      if (data.demandSourceId && data.demandSourceId !== "_general") {
        // The demand record itself is untouched — only the live member tally
        // moves, so historical counts stay honest.
        await db
          .collection(COLLECTIONS.demandSources)
          .doc(data.demandSourceId)
          .set({ activeMemberCount: FieldValue.increment(-1) }, { merge: true });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[waitlist/manage PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
