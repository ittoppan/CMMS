"use client";

import * as React from "react";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export interface NotificationItem {
  id: string | number;
  title: string;
  body?: string;
  time: string | Date;
  read?: boolean;
  icon?: React.ReactNode;
}

export interface NotificationCenterProps {
  items: NotificationItem[];
  onMarkRead?: (id: NotificationItem["id"]) => void;
  onMarkAllRead?: () => void;
  emptyLabel?: string;
  className?: string;
}

function dayBucket(t: string | Date): "today" | "yesterday" | "older" {
  const d = t instanceof Date ? t : new Date(t);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = startOfDay(now) - startOfDay(d);
  if (diff <= 0) return "today";
  if (diff <= 86400000) return "yesterday";
  return "older";
}

const BUCKET_LABEL: Record<string, string> = {
  today: "วันนี้",
  yesterday: "เมื่อวาน",
  older: "ก่อนหน้า",
};

function formatTime(t: string | Date): string {
  const d = t instanceof Date ? t : new Date(t);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export function NotificationCenter({
  items,
  onMarkRead,
  onMarkAllRead,
  emptyLabel = "ไม่มีการแจ้งเตือน",
  className,
}: NotificationCenterProps) {
  const unreadCount = items.filter((i) => !i.read).length;

  const grouped = React.useMemo(() => {
    const buckets: Record<string, NotificationItem[]> = { today: [], yesterday: [], older: [] };
    for (const item of items) buckets[dayBucket(item.time)].push(item);
    return buckets;
  }, [items]);

  if (items.length === 0) {
    return (
      <div className={cn("w-full max-w-sm", className)}>
        <EmptyState icon={<Bell size={20} />} title={emptyLabel} />
      </div>
    );
  }

  return (
    <section
      aria-label="ศูนย์แจ้งเตือน"
      className={cn("w-full max-w-sm overflow-hidden rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)]", className)}
    >
      <header className="flex items-center justify-between border-b border-[var(--cmms-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--cmms-text-primary)]">การแจ้งเตือน</h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-[var(--cmms-primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        {onMarkAllRead && unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
            <CheckCheck size={14} aria-hidden="true" />
            อ่านทั้งหมด
          </Button>
        )}
      </header>
      <div className="max-h-[70vh] overflow-y-auto">
        {(["today", "yesterday", "older"] as const).map((bucket) => {
          const list = grouped[bucket];
          if (list.length === 0) return null;
          return (
            <div key={bucket}>
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--cmms-text-muted)]">
                {BUCKET_LABEL[bucket]}
              </div>
              <ul>
                {list.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onMarkRead?.(item.id)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--cmms-bg-muted)]",
                        !item.read && "bg-[var(--cmms-bg-muted)]/60"
                      )}
                    >
                      <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--cmms-text-secondary)]">
                        {item.icon ?? <Bell size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {!item.read && (
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cmms-primary)]"
                            />
                          )}
                          <span className="truncate text-sm font-semibold text-[var(--cmms-text-primary)]">
                            {item.title}
                          </span>
                        </div>
                        {item.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--cmms-text-secondary)]">
                            {item.body}
                          </p>
                        )}
                        <span className="mt-1 block text-[10px] tabular-nums text-[var(--cmms-text-muted)]">
                          {formatTime(item.time)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Convenience trigger button for top nav
export function NotificationBell({ count = 0, onClick }: { count?: number; onClick?: () => void }) {
  const capped = count > 99 ? "99+" : count;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`การแจ้งเตือน${count > 0 ? ` ${count} รายการใหม่` : ""}`}
      className="relative flex h-10 w-10 items-center justify-center rounded-[var(--cmms-radius-sm)] text-[var(--cmms-text-secondary)] transition-colors hover:bg-[var(--cmms-bg-muted)] hover:text-[var(--cmms-text-primary)]"
    >
      <Bell size={18} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--cmms-danger)] px-1 text-[9px] font-bold text-white">
          {capped}
        </span>
      )}
    </button>
  );
}