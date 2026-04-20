"use client";

import {
  type FirestoreError,
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
  failures: Array<{ collection: string; code?: string; message: string }>;
}

export async function seedDashboardStarterData(
  input: SeedDashboardInput
): Promise<SeedDashboardResult> {
  const { uid, email, displayName } = input;
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
  ];

  const groups = [
    {
      id: `seed-group-runners-${uid}`,
      data: {
        name: "Morning Runners",
        description: "Weekly accountability and check-in calls.",
        adminId: uid,
        createdBy: uid,
        memberCount: 3,
        isPrivate: false,
        memberIds: [uid],
        members: {
          [uid]: true,
        },
        createdAt: serverTimestamp(),
      },
    },
    {
      id: `seed-group-product-${uid}`,
      data: {
        name: "Remote Product Team",
        description: "Async-first product team sync calls.",
        adminId: uid,
        createdBy: uid,
        memberCount: 2,
        isPrivate: true,
        memberIds: [uid],
        members: {
          [uid]: true,
        },
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
        recipientId: uid,
        scheduledAt: plusHours(2),
        status: "confirmed",
      },
    },
    {
      id: `seed-schedule-group-${uid}`,
      data: {
        initiatorId: uid,
        recipientId: uid,
        groupId: `seed-group-runners-${uid}`,
        scheduledAt: plusHours(22),
        status: "confirmed",
      },
    },
    {
      id: `seed-schedule-completed-${uid}`,
      data: {
        initiatorId: uid,
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
        requesterId: uid,
        targetId: uid,
        requestedAt: minusHours(3),
        expiresAt: plusHours(9),
        status: "pending",
      },
    },
    {
      id: `seed-callback-answered-${uid}`,
      data: {
        requesterId: uid,
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
        title: "Callback update",
        message: "You have an active callback request.",
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
        message: "One of your seeded calls starts in about 2 hours.",
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
        message: "Morning Runners has new activity.",
        read: true,
        createdAt: minusDays(1),
      },
    },
  ];

  const failures: Array<{ collection: string; code?: string; message: string }> = [];

  const usersCount = await writeCollectionBatch("user", users, failures);
  const groupsCount = await writeCollectionBatch("groups", groups, failures);
  const membershipsCount = await writeCollectionBatch("memberships", memberships, failures);
  const schedulesCount = await writeCollectionBatch("schedules", schedules, failures);
  const callbacksCount = await writeCollectionBatch("callbacks", callbacks, failures);
  const notificationsCount = await writeCollectionBatch("notifications", notifications, failures);

  return {
    users: usersCount,
    groups: groupsCount,
    memberships: membershipsCount,
    schedules: schedulesCount,
    callbacks: callbacksCount,
    notifications: notificationsCount,
    failures,
  };
}

async function writeCollectionBatch<T extends { id: string; data: object }>(
  collectionName: string,
  records: T[],
  failures: Array<{ collection: string; code?: string; message: string }>
): Promise<number> {
  if (records.length === 0) return 0;

  const batch = writeBatch(db);
  for (const record of records) {
    batch.set(doc(db, collectionName, record.id), record.data, { merge: true });
  }

  try {
    await batch.commit();
    return records.length;
  } catch (error) {
    const firestoreError = error as FirestoreError;
    failures.push({
      collection: collectionName,
      code: firestoreError.code,
      message: firestoreError.message || "Unknown Firestore error",
    });
    return 0;
  }
}
