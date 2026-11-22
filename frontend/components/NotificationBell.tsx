"use client";

// NotificationBell — กระดิ่งแจ้งเตือน (desktop popover + mobile link)
// ตัวเลข unread จาก /api/v1/notifications.php (poll + focus + event)

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { NotificationCenter } from "@/components/ui/notification-center";
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
  unreadCount,
}: {
  variant?: "popover" | "link";
  className?: string;
  /** เลข unread จาก layout (shared poller) — ว่าง = poll เองใน component นี้ */
  unreadCount?: number;
}) {
  const polledUnread = useUnreadCount(60000, unreadCount === undefined);
  const unread = unreadCount ?? polledUnread;
  const router = useRouter();
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
        {loading ? (
          <div className="py-6 text-center">
            <Spinner size={16} label="กำลังโหลด..." />
          </div>
        ) : (
          <NotificationCenter
            items={items.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.message ? n.message.replace(/\n/g, " · ") : undefined,
              time: n.created_at,
              read: !!n.read_at,
            }))}
            onMarkRead={(id) => {
              const target = items.find((n) => n.id === id);
              if (target?.url) router.push(target.url);
              setOpen(false);
            }}
            onMarkAllRead={() => {
              void markAllRead().then(() => refresh());
            }}
          />
        )}
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