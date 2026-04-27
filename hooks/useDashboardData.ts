"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

export interface DashboardStats {
  callsThisWeek: number;
  hoursTalking: number;
  groups: number;
  pendingCallbacks: number;
}

export interface DashboardCallView {
  id: string;
  name: string;
  dateLabel: string;
  durationLabel: string | null;
  type: "Scheduled" | "Callback request" | "Group";
  status: "upcoming" | "pending" | "completed" | "missed" | "cancelled";
  sortAt: Date;
}

export interface DashboardNotificationView {
  id: string;
  text: string;
  timeLabel: string;
  read: boolean;
  icon: string;
  createdAt: Date;
}

export interface DashboardGroupView {
  id: string;
  name: string;
  members: number;
  role: "Admin" | "Moderator" | "Member";
  status: "active" | "pending" | "banned";
}

interface ScheduledCallDoc {
  initiatorId: string;
  recipientId: string;
  groupId?: string;
  scheduledAt: unknown;
  status?: string;
  durationMinutes?: number;
}

interface CallbackDoc {
  requesterId: string;
  requestedAt: unknown;
  status?: string;
}

interface NotificationDoc {
  title?: string;
  message?: string;
  read?: boolean;
  createdAt?: unknown;
  type?: string;
}

interface MembershipDoc {
  groupId: string;
  role?: string;
  status?: "active" | "pending" | "banned";
}

interface GroupDoc {
  name?: string;
  memberCount?: number;
}

interface UserDoc {
  displayName?: string;
  email?: string;
}

interface DashboardDataState {
  loading: boolean;
  error: string | null;
  stats: DashboardStats;
  upcomingCalls: DashboardCallView[];
  allCalls: DashboardCallView[];
  notifications: DashboardNotificationView[];
  groups: DashboardGroupView[];
}

const INITIAL_STATS: DashboardStats = {
  callsThisWeek: 0,
  hoursTalking: 0,
  groups: 0,
  pendingCallbacks: 0,
};

const INITIAL_STATE: DashboardDataState = {
  loading: true,
  error: null,
  stats: INITIAL_STATS,
  upcomingCalls: [],
  allCalls: [],
  notifications: [],
  groups: [],
};

export function useDashboardData(): DashboardDataState {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<DashboardDataState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData(uid: string) {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const [initiatedSnap, receivedSnap, callbacksSnap, notificationsSnap, membershipsSnap] =
          await Promise.all([
            getDocs(query(collection(db, "schedules"), where("initiatorId", "==", uid))),
            getDocs(query(collection(db, "schedules"), where("recipientId", "==", uid))),
            getDocs(query(collection(db, "callbacks"), where("targetId", "==", uid))),
            getDocs(query(collection(db, "notifications"), where("userId", "==", uid))),
            getDocs(query(collection(db, "memberships"), where("userId", "==", uid))),
          ]);

        const initiatedCalls = initiatedSnap.docs as QueryDocumentSnapshot<ScheduledCallDoc>[];
        const receivedCalls = receivedSnap.docs as QueryDocumentSnapshot<ScheduledCallDoc>[];
        const scheduledCalls = mergeUniqueSnapshots<ScheduledCallDoc>([initiatedCalls, receivedCalls]);
        const callbacks = callbacksSnap.docs as QueryDocumentSnapshot<CallbackDoc>[];
        const notifications = notificationsSnap.docs as QueryDocumentSnapshot<NotificationDoc>[];
        const memberships = membershipsSnap.docs as QueryDocumentSnapshot<MembershipDoc>[];

        const userIds = new Set<string>();
        const groupIds = new Set<string>();

        for (const call of scheduledCalls) {
          const data = call.data();
          userIds.add(data.initiatorId);
          userIds.add(data.recipientId);
          if (data.groupId) groupIds.add(data.groupId);
        }

        for (const cb of callbacks) {
          userIds.add(cb.data().requesterId);
        }

        for (const membership of memberships) {
          groupIds.add(membership.data().groupId);
        }

        const [userMap, groupMap] = await Promise.all([
          fetchDocsById<UserDoc>("user", [...userIds]),
          fetchDocsById<GroupDoc>("groups", [...groupIds]),
        ]);

        const allCalls = buildAllCallViews({
          uid,
          scheduledCalls,
          callbacks,
          userMap,
          groupMap,
        });

        const upcomingCalls = allCalls
          .filter((call) => call.status === "upcoming" || call.status === "pending")
          .sort((a, b) => a.sortAt.getTime() - b.sortAt.getTime())
          .slice(0, 6);

        const notificationViews = notifications
          .map((docSnap) => {
            const data = docSnap.data();
            const createdAt = toDate(data.createdAt) ?? new Date(0);
            const title = data.title?.trim();
            const message = data.message?.trim();
            const text = [title, message].filter(Boolean).join(" - ") || "Notification";

            return {
              id: docSnap.id,
              text,
              read: !!data.read,
              createdAt,
              timeLabel: formatRelativeTime(createdAt),
              icon: notificationIcon(data.type),
            } satisfies DashboardNotificationView;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        const groupViews = memberships
          .map((docSnap) => {
            const membership = docSnap.data();
            const group = groupMap.get(membership.groupId);

            return {
              id: membership.groupId,
              name: group?.name?.trim() || "Unnamed group",
              members: group?.memberCount ?? 0,
              role: normalizeGroupRole(membership.role),
              status: membership.status ?? "active",
            } satisfies DashboardGroupView;
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        const stats = buildStats(allCalls, groupViews);

        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          stats,
          upcomingCalls,
          allCalls,
          notifications: notificationViews,
          groups: groupViews,
        });
      } catch (err) {
        if (cancelled) return;
        const code = (err as { code?: string }).code ?? "";
        // Silently fall back to empty data on permission-denied.
        // This happens when Firestore rules haven't been configured for these
        // collections yet — show an empty dashboard rather than an error.
        if (code === "permission-denied") {
          setState({ ...INITIAL_STATE, loading: false });
          return;
        }
        setState({
          ...INITIAL_STATE,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load dashboard data.",
        });
      }
    }

    if (authLoading) {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setState({ ...INITIAL_STATE, loading: false });
      return () => {
        cancelled = true;
      };
    }

    void loadDashboardData(user.uid);

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  return useMemo(
    () => ({
      ...state,
      stats: {
        ...INITIAL_STATS,
        ...state.stats,
      },
    }),
    [state]
  );
}

function mergeUniqueSnapshots<T>(snapGroups: QueryDocumentSnapshot<T>[][]): QueryDocumentSnapshot<T>[] {
  const seen = new Map<string, QueryDocumentSnapshot<T>>();
  for (const docs of snapGroups) {
    for (const docSnap of docs) {
      seen.set(docSnap.id, docSnap);
    }
  }
  return [...seen.values()];
}

async function fetchDocsById<T>(collectionName: string, ids: string[]): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  if (ids.length === 0) return result;

  const chunks = chunk(ids, 10);
  await Promise.all(
    chunks.map(async (idsChunk) => {
      const snap = await getDocs(
        query(collection(db, collectionName), where(documentId(), "in", idsChunk))
      );
      for (const docSnap of snap.docs) {
        result.set(docSnap.id, docSnap.data() as T);
      }
    })
  );

  return result;
}

function buildAllCallViews({
  uid,
  scheduledCalls,
  callbacks,
  userMap,
  groupMap,
}: {
  uid: string;
  scheduledCalls: QueryDocumentSnapshot<ScheduledCallDoc>[];
  callbacks: QueryDocumentSnapshot<CallbackDoc>[];
  userMap: Map<string, UserDoc>;
  groupMap: Map<string, GroupDoc>;
}): DashboardCallView[] {
  const now = new Date();
  const calls: DashboardCallView[] = [];

  for (const callDoc of scheduledCalls) {
    const call = callDoc.data();
    const scheduledAt = toDate(call.scheduledAt) ?? new Date(0);
    const effectiveStatus = normalizeCallStatus(call.status, scheduledAt, now);
    const isGroupCall = !!call.groupId;
    const counterpartId = call.initiatorId === uid ? call.recipientId : call.initiatorId;
    const counterpart = userMap.get(counterpartId);
    const group = call.groupId ? groupMap.get(call.groupId) : null;

    calls.push({
      id: callDoc.id,
      name: isGroupCall
        ? group?.name?.trim() || "Group call"
        : counterpart?.displayName?.trim() || counterpart?.email?.trim() || "Contact",
      dateLabel: formatCallDate(scheduledAt),
      durationLabel: call.durationMinutes ? `${call.durationMinutes} min` : null,
      type: isGroupCall ? "Group" : "Scheduled",
      status: effectiveStatus,
      sortAt: scheduledAt,
    });
  }

  for (const callbackDoc of callbacks) {
    const callback = callbackDoc.data();
    const requestedAt = toDate(callback.requestedAt) ?? new Date();
    const requester = userMap.get(callback.requesterId);
    const status = callback.status === "answered" ? "completed" : "pending";

    calls.push({
      id: `callback-${callbackDoc.id}`,
      name: requester?.displayName?.trim() || requester?.email?.trim() || "Callback request",
      dateLabel: formatCallDate(requestedAt),
      durationLabel: null,
      type: "Callback request",
      status,
      sortAt: requestedAt,
    });
  }

  return calls.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
}

function buildStats(calls: DashboardCallView[], groups: DashboardGroupView[]): DashboardStats {
  const startOfWeek = getStartOfWeek(new Date());
  const callsThisWeek = calls.filter(
    (call) => call.sortAt >= startOfWeek && call.status !== "cancelled"
  ).length;
  const totalDurationMinutes = calls.reduce((sum, call) => {
    if (!call.durationLabel) return sum;
    const value = Number.parseFloat(call.durationLabel);
    return Number.isNaN(value) ? sum : sum + value;
  }, 0);

  return {
    callsThisWeek,
    hoursTalking: totalDurationMinutes / 60,
    groups: groups.filter((group) => group.status === "active").length,
    pendingCallbacks: calls.filter(
      (call) => call.type === "Callback request" && call.status === "pending"
    ).length,
  };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function normalizeCallStatus(
  status: string | undefined,
  scheduledAt: Date,
  now: Date
): DashboardCallView["status"] {
  if (status === "completed") return "completed";
  if (status === "missed") return "missed";
  if (status === "cancelled") return "cancelled";
  if (status === "pending") return scheduledAt > now ? "pending" : "missed";
  if (status === "confirmed") return scheduledAt > now ? "upcoming" : "completed";
  return scheduledAt > now ? "upcoming" : "completed";
}

function normalizeGroupRole(role: string | undefined): DashboardGroupView["role"] {
  if (role === "admin") return "Admin";
  if (role === "moderator") return "Moderator";
  return "Member";
}

function formatCallDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeTime(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 60) return rtf.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
}

function notificationIcon(type: string | undefined): string {
  if (type === "callback_request") return "📞";
  if (type === "call_scheduled") return "🔔";
  if (type === "group_invite") return "👥";
  if (type === "incoming_call") return "☎️";
  return "📣";
}

function getStartOfWeek(now: Date): Date {
  const date = new Date(now);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
