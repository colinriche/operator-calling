"use client";

import {
  Timestamp,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface SeedDashboardInput {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

interface SeedDashboardResult {
  users: number;
  groups: number;
  memberships: number;
  schedules: number;
  callbacks: number;
  notifications: number;
}

export async function seedDashboardStarterData(
  input: SeedDashboardInput
): Promise<SeedDashboardResult> {
  const { uid, email, displayName } = input;
  const batch = writeBatch(db);
  const now = new Date();
  const plusHours = (hours: number) => Timestamp.fromDate(new Date(now.getTime() + hours * 60 * 60 * 1000));
  const minusHours = (hours: number) => Timestamp.fromDate(new Date(now.getTime() - hours * 60 * 60 * 1000));
  const minusDays = (days: number) => Timestamp.fromDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));

  const currentUserName = (displayName?.trim() || "You");
  const currentUserEmail = email?.trim() || `${uid.slice(0, 6)}@operator.local`;

  const users = [
    {
      id: uid,
      data: {
        uid,
        email: currentUserEmail,
        displayName: currentUserName,
        role: "admin",
        updatedAt: serverTimestamp(),
      },
    },
    {
      id: `seed-sarah-${uid}`,
      data: {
        uid: `seed-sarah-${uid}`,
        email: "sarah@example.com",
        displayName: "Sarah K.",
        role: "user",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
    {
      id: `seed-marcus-${uid}`,
      data: {
        uid: `seed-marcus-${uid}`,
        email: "marcus@example.com",
        displayName: "Marcus T.",
        role: "user",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
    {
      id: `seed-priya-${uid}`,
      data: {
        uid: `seed-priya-${uid}`,
        email: "priya@example.com",
        displayName: "Priya N.",
        role: "user",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
  ];

  const groups = [
    {
      id: `seed-group-runners-${uid}`,
      data: {
        name: "Morning Runners",
        description: "Weekly accountability and check-in calls.",
        adminId: uid,
        memberCount: 3,
        isPrivate: false,
        createdAt: serverTimestamp(),
      },
    },
    {
      id: `seed-group-product-${uid}`,
      data: {
        name: "Remote Product Team",
        description: "Async-first product team sync calls.",
        adminId: uid,
        memberCount: 2,
        isPrivate: true,
        createdAt: serverTimestamp(),
      },
    },
  ];

  const memberships = [
    {
      id: `seed-membership-${uid}-runners`,
      data: {
        userId: uid,
        groupId: `seed-group-runners-${uid}`,
        role: "admin",
        status: "active",
        joinedAt: serverTimestamp(),
      },
    },
    {
      id: `seed-membership-${uid}-product`,
      data: {
        userId: uid,
        groupId: `seed-group-product-${uid}`,
        role: "admin",
        status: "active",
        joinedAt: serverTimestamp(),
      },
    },
  ];

  const schedules = [
    {
      id: `seed-schedule-upcoming-${uid}`,
      data: {
        initiatorId: uid,
        recipientId: `seed-sarah-${uid}`,
        scheduledAt: plusHours(2),
        status: "confirmed",
      },
    },
    {
      id: `seed-schedule-group-${uid}`,
      data: {
        initiatorId: uid,
        recipientId: `seed-marcus-${uid}`,
        groupId: `seed-group-runners-${uid}`,
        scheduledAt: plusHours(22),
        status: "confirmed",
      },
    },
    {
      id: `seed-schedule-completed-${uid}`,
      data: {
        initiatorId: `seed-priya-${uid}`,
        recipientId: uid,
        scheduledAt: minusHours(28),
        status: "completed",
        durationMinutes: 12,
      },
    },
  ];

  const callbacks = [
    {
      id: `seed-callback-pending-${uid}`,
      data: {
        requesterId: `seed-marcus-${uid}`,
        targetId: uid,
        requestedAt: minusHours(3),
        expiresAt: plusHours(9),
        status: "pending",
      },
    },
    {
      id: `seed-callback-answered-${uid}`,
      data: {
        requesterId: `seed-sarah-${uid}`,
        targetId: uid,
        requestedAt: minusDays(2),
        expiresAt: minusDays(1),
        status: "answered",
      },
    },
  ];

  const notifications = [
    {
      id: `seed-notification-callback-${uid}`,
      data: {
        userId: uid,
        type: "callback_request",
        title: "Callback accepted",
        message: "Priya N. accepted your callback request.",
        read: false,
        createdAt: minusHours(2),
      },
    },
    {
      id: `seed-notification-scheduled-${uid}`,
      data: {
        userId: uid,
        type: "call_scheduled",
        title: "Call reminder",
        message: "Your call with Sarah K. starts in about 2 hours.",
        read: false,
        createdAt: minusHours(1),
      },
    },
    {
      id: `seed-notification-group-${uid}`,
      data: {
        userId: uid,
        type: "system",
        title: "Group activity",
        message: "New member joined Morning Runners.",
        read: true,
        createdAt: minusDays(1),
      },
    },
  ];

  for (const user of users) {
    batch.set(doc(db, "user", user.id), user.data, { merge: true });
  }
  for (const group of groups) {
    batch.set(doc(db, "groups", group.id), group.data, { merge: true });
  }
  for (const membership of memberships) {
    batch.set(doc(db, "memberships", membership.id), membership.data, { merge: true });
  }
  for (const schedule of schedules) {
    batch.set(doc(db, "schedules", schedule.id), schedule.data, { merge: true });
  }
  for (const callback of callbacks) {
    batch.set(doc(db, "callbacks", callback.id), callback.data, { merge: true });
  }
  for (const notification of notifications) {
    batch.set(doc(db, "notifications", notification.id), notification.data, { merge: true });
  }

  await batch.commit();

  return {
    users: users.length,
    groups: groups.length,
    memberships: memberships.length,
    schedules: schedules.length,
    callbacks: callbacks.length,
    notifications: notifications.length,
  };
}
