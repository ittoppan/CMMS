"use client";

// NotificationBell — กระดิ่งแจ้งเตือน (desktop popover + mobile link)
// ตัวเลข unread จาก /api/v1/notifications.php (poll + focus + event)

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import {
  useUnreadCount,
  fetchNotifications,
  markAllRead,
  type NotifItem,
} from "@/lib/notifications";

function timeAgo(dateStr: string): string {
  if (!dateStr) return "-";
  const t = Date.parse(dateStr.replace(" ", "T"));
  if (isNaN(t)) return dateStr;
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hrs / 24)} วันที่แล้ว`;
}

export function NotificationBell({
  variant = "popover",
  className,
}: {
  variant?: "popover" | "link";
  className?: string;
}) {
  const unread = useUnreadCount(60000);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchNotifications({ limit: 6 });
      setItems(list.items.slice(0, 6));
    } catch {
      /* offline */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const badge = unread > 0 && (
    <span
      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--cmms-danger)] px-1 text-[0.6rem] font-bold leading-none text-white"
      aria-label={`การแจ้งเตือนที่ยังไม่อ่าน ${unread} รายการ`}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );

  if (variant === "link") {
    return (
      <Link
        href="/notifications"
        aria-label={`การแจ้งเตือน${unread > 0 ? ` — ${unread} รายการที่ยังไม่อ่าน` : ""}`}
        title="การแจ้งเตือน"
        className={cn("relative min-w-9", className)}
        style={{ textDecoration: "none" }}
      >
        <Bell size={17} strokeWidth={1.75} aria-hidden="true" />
        {badge}
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="การแจ้งเตือน"
          title="การแจ้งเตือน"
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
            className
          )}
        >
          <Bell size={17} strokeWidth={1.75} aria-hidden="true" />
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">การแจ้งเตือน</span>
            {unread > 0 && <Badge variant="danger" dot className="font-medium normal-case tracking-normal">{unread}</Badge>}
          </div>
          <button
            type="button"
            onClick={() => { void markAllRead(); }}
            disabled={unread === 0}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <CheckCheck size={14} strokeWidth={1.75} aria-hidden="true" />
            อ่านทั้งหมด
          </button>
        </div>
        <div className="max-h-[320px] divide-y divide-border overflow-y-auto">
          {loading && (
            <div className="py-6 text-center">
              <Spinner size={16} label="กำลังโหลด..." />
            </div>
          )}
          {!loading && items.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีการแจ้งเตือน</p>
          )}
          {!loading &&
            items.map((n) => (
              <Link
                key={n.id}
                href={n.url || "/notifications"}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/60",
                  !n.read_at && "bg-[var(--cmms-primary-light)]"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    n.read_at ? "bg-border" : "bg-[var(--cmms-danger)]"
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate text-sm font-medium text-foreground">{n.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {n.message ? n.message.replace(/\n/g, " · ") : ""}
                  </span>
                  <span className="block text-[0.68rem] text-muted-foreground/80">{timeAgo(n.created_at)}</span>
                </span>
              </Link>
            ))}
        </div>
        <div className="border-t border-border p-2">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            เปิดศูนย์การแจ้งเตือน <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}