"use client";

/**
 * ConnectivityStatus — ป้ายสถานะออนไลน์/ออฟไลน์/ซิงก์ (Phase 19)
 *
 * chip  : แสดงข้อความ + จำนวนค้างส่ง (desktop topbar)
 * icon  : จุด/ไอคอนเล็ก + badge (mobile app bar)
 * คลิกไป /sync-center
 */
import { useConnectivity } from "../lib/offline/connectivity";
import { t } from "../lib/i18n";
import Link from "next/link";
import { Wifi, WifiOff, RefreshCw, Loader2, TriangleAlert } from "lucide-react";

export function ConnectivityStatus({ variant = "chip" }: { variant?: "chip" | "icon" }) {
  const { net, syncing, stats, hasSyncError } = useConnectivity();
  const pending = stats.pending;

  const offline = net === "OFFLINE";
  const reconnecting = net === "RECONNECTING";

  let label = t("sync.status.online");
  if (offline) label = t("sync.status.offline");
  else if (reconnecting) label = t("sync.status.reconnecting");
  else if (syncing && pending > 0) label = t("sync.status.syncing");
  else if (hasSyncError && pending > 0) label = t("sync.status.sync_error");

  const Icon = offline ? WifiOff : reconnecting ? RefreshCw : syncing ? Loader2 : hasSyncError ? TriangleAlert : Wifi;
  const badge = pending > 0 ? t("sync.badge.tooltip").replace("{n}", String(pending)) : "";

  const base =
    "inline-flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition-colors";
  const tone = offline
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : hasSyncError && pending > 0
      ? "border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-400"
      : syncing
        ? "border-blue-400/40 bg-blue-400/10 text-blue-600 dark:text-blue-300"
        : "border-border bg-secondary/60 text-muted-foreground";

  if (variant === "icon") {
    return (
      <Link
        href="/sync-center"
        className="cmms-mobile-app-bar-btn"
        aria-label={label}
        title={badge || label}
        style={{ textDecoration: "none" }}
      >
        <span className="cmms-mobile-nav-icon-wrap">
          <Icon
            size={19}
            strokeWidth={1.75}
            aria-hidden="true"
            className={syncing ? "animate-spin" : reconnecting ? "animate-pulse" : offline ? "text-destructive" : ""}
          />
          {pending > 0 && (
            <span className="cmms-mobile-nav-badge" title={badge}>
              {pending > 99 ? "99+" : pending}
            </span>
          )}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/sync-center"
      className={[base, tone].join(" ")}
      style={{ textDecoration: "none" }}
      title={badge || label}
    >
      <Icon
        size={13}
        strokeWidth={2}
        aria-hidden="true"
        className={syncing ? "animate-spin" : reconnecting ? "animate-pulse" : ""}
      />
      <span>{label}</span>
      {pending > 0 && (
        <span className="rounded-full bg-foreground/10 px-1.5 text-[0.65rem] font-bold">{pending}</span>
      )}
    </Link>
  );
}