// ─── Role System ─────────────────────────────────────────────────────────────

export type UserRole = "user" | "admin" | "super_admin" | "group_admin";

// ─── User & Profile ───────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phoneNumber?: string;
  role: UserRole;
  banned?: boolean;
  archived?: boolean;
  /** Set by the mobile app at registration — presence means account is linked */
  systemName?: string;
  /** Populated when a web-first user links by entering their system name */
  linkedSystemName?: string;
  createdAt: Date;
  updatedAt: Date;

  // Call preferences
  callPreferences: {
    availableHours: { start: string; end: string }; // "09:00" / "22:00"
    timezone: string;
    allowUnknownCalls: boolean;
    maxDailyCallMinutes?: number;
  };

  // Privacy
  privacy: {
    showOnlineStatus: boolean;
    allowGroupDiscovery: boolean;
    blockedUsers: string[];
  };

  // Profile completeness
  interests: string[];
  bio?: string;
  completeness: number; // 0–100

  // Notification settings
  notifications: {
    email: boolean;
    push: boolean;
    upcomingCallReminder: boolean;
  };
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export interface Group {
  id: string;
  name: string;
  description: string;
  adminId: string;
  createdAt: Date;
  memberCount: number;
  isPrivate: boolean;
  tags: string[];
  scheduleSettings?: {
    allowedDays: number[]; // 0=Sun … 6=Sat
    allowedHours: { start: string; end: string };
  };
}

export interface GroupMembership {
  userId: string;
  groupId: string;
  role: "member" | "moderator" | "admin";
  joinedAt: Date;
  status: "active" | "pending" | "banned";
}

// ─── Calls ────────────────────────────────────────────────────────────────────

export interface ScheduledCall {
  id: string;
  initiatorId: string;
  recipientId: string;
  groupId?: string;
  scheduledAt: Date;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "missed";
  durationMinutes?: number;
}

export interface Callback {
  id: string;
  requesterId: string;
  targetId: string;
  requestedAt: Date;
  status: "pending" | "answered" | "expired";
  expiresAt: Date;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  type:
    | "incoming_call"
    | "call_scheduled"
    | "callback_request"
    | "group_invite"
    | "system";
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  data?: Record<string, string>;
}

// ─── Mobile Destination Payloads ──────────────────────────────────────────────

export type MobileDestinationType =
  | "invite"
  | "operator_call"
  | "auto_call_invite"
  | "auto_call_paired"
  | "observer_call"
  | "group_call_invite"
  | "group_call_scheduled"
  | "contact_joined"
  | "friend_request_accepted"
  | "group_request_accepted";

export interface MobileDeepLinkPayload {
  destination: MobileDestinationType;
  token?: string; // invite bearer token
  type?: string; // invite type enum value
  callId?: string;
  sessionId?: string;
  webrtcRoomId?: string;
  groupId?: string;
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export interface Invite {
  id: string;
  groupId: string;
  invitedEmail: string;
  invitedBy: string;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "accepted" | "declined" | "expired";
}
