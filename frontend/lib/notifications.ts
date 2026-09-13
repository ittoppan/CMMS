"use client";

// lib/notifications.ts — Phase 16 Notification Center + Alert Engine client
// ใช้ API /api/v1/notifications.php (backend: src/services/NotificationCenterService.php)

import { useEffect, useState } from "react";
import { apiJson } from "./api";

export type NotifType =
  | "work_order"
  | "priority"
  | "sla"
  | "pm"
  | "inspection"
  | "spare_part"
  | "request"
  | "system"
  | "calibration"
  | "maintenance";

export type NotifPriority = "critical" | "high" | "medium" | "low" | "info";
export type NotifChannel = "app" | "line" | "email" | "telegram" | "push";

export interface NotifItem {
  id: number;
  user_id: number;
  type: string;
  module: string;
  event: string;
  title: string;
  message: string;
  priority: string;
  ref_type: string;
  ref_id: number;
  url: string;
  payload: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotifCounts {
  unread: number;
  total: number;
  by_type: Record<string, number>;
  by_module: Record<string, number>;
}

export interface NotifList {
  items: NotifItem[];
  counts: NotifCounts;
}

export interface NotifFilters {
  tab?: string;
  type?: string;
  module?: string;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface NotifMeta {
  types: string[];
  channels: NotifChannel[];
  priorities: NotifPriority[];
  type_labels: Record<string, { th: string; en: string }>;
  priority_labels: Record<string, { th: string; en: string }>;
  roles: { id: number; name: string }[];
}

export interface NotifRule {
  id?: number;
  name?: string;
  module?: string;
  event?: string;
  priority?: string;
  reference?: unknown;
  recipients_role?: number[] | string;
  recipients_user?: number[] | string;
  channels?: NotifChannel[] | string;
  delay_minutes?: number;
  repeat_every_minutes?: number;
  max_repeats?: number;
  dedup_hours?: number;
  notify_creator?: boolean | number;
  enabled?: boolean | number;
  created_by?: number;
  created_at?: string;
}

async function qs(f: NotifFilters): Promise<string> {
  const p = new URLSearchParams({ action: "list", limit: "50" });
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  return `/api/v1/notifications.php?${p.toString()}`;
}

export async function fetchNotifications(f: NotifFilters = {}): Promise<NotifList> {
  return apiJson<NotifList>(await qs(f));
}

export async function fetchUnreadCount(): Promise<number> {
  try {
    const j = await apiJson<{ unread: number }>("/api/v1/notifications.php?action=count");
    return Number(j?.unread ?? 0);
  } catch {
    return 0;
  }
}

export async function markRead(ids: number[] | number): Promise<number> {
  const j = await apiJson<{ updated: number }>("/api/v1/notifications.php?action=mark_read", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: Array.isArray(ids) ? ids : [ids] }),
  });
  dispatchNotificationsChanged();
  return Number(j?.updated ?? 0);
}

export async function markAllRead(): Promise<number> {
  const j = await apiJson<{ updated: number }>("/api/v1/notifications.php?action=mark_all_read", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  dispatchNotificationsChanged();
  return Number(j?.updated ?? 0);
}

export async function fetchPreferences(): Promise<{ types: string[]; channels: string[]; rows: Record<string, Record<string, boolean>> }> {
  return apiJson("/api/v1/notifications.php?action=preferences");
}

export interface PrefRow {
  type: string;
  channel: string;
  enabled: boolean;
}

export async function savePreferences(rows: PrefRow[]): Promise<number> {
  const j = await apiJson<{ updated: number }>("/api/v1/notifications.php?action=preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  return Number(j?.updated ?? 0);
}

export async function fetchRules(): Promise<NotifRule[]> {
  const j = await apiJson<{ items: NotifRule[] }>("/api/v1/notifications.php?action=rules");
  return j?.items ?? [];
}

export async function saveRule(rule: NotifRule): Promise<number> {
  const j = await apiJson<{ id: number }>("/api/v1/notifications.php?action=rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rule }),
  });
  return Number(j?.id ?? 0);
}

export async function deleteRule(id: number): Promise<boolean> {
  const j = await apiJson<{ success: boolean }>(`/api/v1/notifications.php?id=${id}&action=rules`, {
    method: "DELETE",
  });
  return Boolean(j?.success);
}

export async function fetchMeta(): Promise<NotifMeta> {
  return apiJson<NotifMeta>("/api/v1/notifications.php?action=meta");
}

/** event ที่ตัวอื่นฟังเพื่อ refresh unread/bell เมื่ออ่านแล้ว */
export const NOTIFICATIONS_CHANGED = "cmms:notifications-changed";

export function dispatchNotificationsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/** hook ตัวเลข unread — poll + focus/visibility + event การอ่านเอง */
export function useUnreadCount(pollMs = 60000): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetchUnreadCount().then((n) => {
        if (alive) setUnread(n);
      }).catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, pollMs);
    const onEv = () => refresh();
    const onFocus = () => refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED, onEv);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onEv);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pollMs]);

  return unread;
}