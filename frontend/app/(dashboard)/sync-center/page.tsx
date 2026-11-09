"use client";

/**
 * /sync-center — ศูนย์ซิงก์ Offline (Phase 19)
 *
 * ภาพรวมสถานะออนไลน์, คิวซิงก์ (PENDING/SYNCING/SUCCESS/FAILED/CONFLICT),
 * พื้นที่เก็บรูป offline และปุ่ม "ซิงก์เดี๋ยวนี้"
 */
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { t } from "@/lib/i18n";
import { useConnectivity } from "@/lib/offline/connectivity";
import { syncEngine, RETRY_SCHEDULE_MS } from "@/lib/offline/engine";
import { idbGetAll, idbEstimateBytes, estimateTotalStorage } from "@/lib/offline/idb";
import type { OfflineAttachmentRecord, SyncQueueItem, SyncStatusType } from "@/lib/offline/types";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
  CircleCheckBig,
  TriangleAlert,
  Clock3,
  Trash2,
  HardDrive,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "sync.st.in_pending",
  SYNCING: "sync.st.syncing",
  SUCCESS: "sync.st.success",
  FAILED: "sync.st.failed",
  CONFLICT: "sync.st.conflict",
};

const STATUS_TONE: Record<SyncStatusType, string> = {
  PENDING: "border-blue-400/40 bg-blue-400/10 text-blue-600 dark:text-blue-300",
  SYNCING: "border-blue-400/50 bg-blue-400/15 text-blue-600 dark:text-blue-300",
  SUCCESS: "border-emerald-400/40 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300",
  FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
  CONFLICT: "border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-300",
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return t("sync.never");
  try {
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function SyncCenterPage() {
  const { net, syncing, stats, syncNow } = useConnectivity();
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [showSucceeded, setShowSucceeded] = useState(false);
  const [attCount, setAttCount] = useState(0);
  const [attBytes, setAttBytes] = useState(0);
  const [storageUsed, setStorageUsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const refresh = useCallback(() => {
    setItems(syncEngine.unstable_items().filter((it) => it.status !== "SUCCESS"));
    try {
      const { succeededToday } = syncEngine.stats();
      void succeededToday;
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void syncEngine.ensureLoaded().then(refresh);
    const handler = () => refresh();
    window.addEventListener("cmms:sync-changed", handler);
    window.addEventListener("cmms:synced", handler);
    window.addEventListener("cmms:offline-queued", handler);
    const t1 = window.setTimeout(() => {
      void idbGetAll<OfflineAttachmentRecord>("attachments").then((rows) => {
        setAttCount(rows.length);
        void idbEstimateBytes("attachments", "estBytes").then(setAttBytes);
      });
      void estimateTotalStorage().then(setStorageUsed);
    }, 50);
    return () => {
      window.removeEventListener("cmms:sync-changed", handler);
      window.removeEventListener("cmms:synced", handler);
      window.removeEventListener("cmms:offline-queued", handler);
      window.clearTimeout(t1);
    };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t2 = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(t2);
  }, [toast]);

  const handleSync = async () => {
    setBusy(true);
    try {
      await syncNow();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async (id: string) => {
    await syncEngine.retry(id);
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const handleRemove = async (id: string) => {
    await syncEngine.remove(id);
    refresh();
  };

  const visible = showSucceeded
    ? syncEngine.unstable_items().filter((it) => it.status === "SUCCESS")
    : items;
  const showList = showSucceeded ? visible.length > 0 : items.length > 0;
  const offline = net === "OFFLINE";

  return (
    <PageShell
      title={t("sync.menu")}
      description={t("sync.status.offline")}
      eyebrow={<p className="cmms-eyebrow">SYNC CENTER · CMMS-TOPPAN</p>}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {/* สถานะเครือข่าย */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("sync.menu")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {offline ? (
                <WifiOff size={26} className="text-destructive" aria-hidden="true" />
              ) : syncing ? (
                <Loader2 size={26} className="animate-spin text-blue-500" aria-hidden="true" />
              ) : stats.failed > 0 || stats.conflict > 0 ? (
                <TriangleAlert size={26} className="text-amber-500" aria-hidden="true" />
              ) : (
                <Wifi size={26} className="text-emerald-500" aria-hidden="true" />
              )}
              <div>
                <div className="text-sm font-semibold">
                  {offline
                    ? t("sync.status.offline")
                    : syncing
                      ? t("sync.status.syncing")
                      : stats.failed > 0 || stats.conflict > 0
                        ? t("sync.status.sync_error")
                        : t("sync.status.online")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("sync.last_run")}: {fmtTime(stats.lastRunAt)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-secondary/40 px-3 py-2">
                <div className="text-xs text-muted-foreground">{t("sync.stat.pending")}</div>
                <div className="text-lg font-bold">{stats.pending}</div>
              </div>
              <div className="rounded-lg bg-secondary/40 px-3 py-2">
                <div className="text-xs text-muted-foreground">{t("sync.stat.sent_today")}</div>
                <div className="text-lg font-bold">{stats.succeededToday}</div>
              </div>
              <div className="rounded-lg bg-secondary/40 px-3 py-2">
                <div className="text-xs text-muted-foreground">{t("sync.stat.failed")}</div>
                <div className="text-lg font-bold text-destructive">{stats.failed}</div>
              </div>
              <div className="rounded-lg bg-secondary/40 px-3 py-2">
                <div className="text-xs text-muted-foreground">{t("sync.stat.conflict")}</div>
                <div className="text-lg font-bold text-amber-500">{stats.conflict}</div>
              </div>
            </div>
            <Button variant="primary" onClick={handleSync} disabled={busy || syncing || offline}>
              {busy || syncing ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  {t("sync.status.syncing")}
                </>
              ) : (
                <>
                  <RefreshCw size={16} aria-hidden="true" />
                  {t("sync.now")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* พื้นที่จัดเก็บ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive size={16} aria-hidden="true" />
              {t("sync.attachments_stored")
                .replace("{n}", String(attCount))
                .replace("{mb}", (attBytes / (1024 * 1024)).toFixed(1))}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p className="text-xs">{t("sync.saved_offline_note")}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (attBytes / (120 * 1024 * 1024)) * 100)}%` }}
              />
            </div>
            <div className="text-xs">
              {t("sync.browser_cache").replace("{mb}", ((storageUsed || attBytes) / (1024 * 1024)).toFixed(1))}
            </div>
          </CardContent>
        </Card>

        {/* คิวซิงก์ */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t("sync.queue.title").replace("{n}", String(items.length))}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!showList ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleCheckBig size={18} className="text-emerald-500" aria-hidden="true" />
                {t("sync.queue.empty")}
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showSucceeded}
                    onChange={(e) => setShowSucceeded(e.target.checked)}
                    className="size-3.5"
                  />
                  {t("sync.st.success")} ({visible.filter((x) => x.status === "SUCCESS").length})
                </label>
                {visible.slice(0, 12).map((it) => (
                  <div
                    key={it.local_action_id}
                    className="rounded-lg border border-border bg-card p-2.5 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{it.label}</div>
                        <div className="truncate font-mono text-[0.65rem] text-muted-foreground">
                          {it.endpoint}
                        </div>
                      </div>
                      <Badge className={STATUS_TONE[it.status] || ""}>
                        {t(STATUS_LABEL[it.status] || "sync.st.in_pending")}
                      </Badge>
                    </div>
                    {it.status === "CONFLICT" && (
                      <div className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <TriangleAlert size={12} className="mr-1 inline" aria-hidden="true" />
                        {t("sync.conflict_hint")}
                      </div>
                    )}
                    {it.status === "FAILED" && (
                      <div className="mt-1.5 text-xs text-destructive">{it.last_error}</div>
                    )}
                    {(it.status === "FAILED" || it.status === "CONFLICT" || it.status === "PENDING") && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleRetry(it.local_action_id)} disabled={syncing || offline}>
                          <RefreshCw size={13} aria-hidden="true" />
                          {t("sync.retry_item")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRemove(it.local_action_id)}>
                          <Trash2 size={13} aria-hidden="true" />
                          {t("sync.remove_item")}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {visible.length > 12 && (
                  <div className="text-xs text-muted-foreground">
                    {t("sync.more_items").replace("{n}", String(visible.length - 12))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {toast && (
        <div className="fixed right-4 top-4 z-50">
          <Alert variant="info">{toast}</Alert>
        </div>
      )}
      <div className="mt-4 text-xs text-muted-foreground">
        <Clock3 size={12} className="mr-1 inline" aria-hidden="true" />
        {offline ? t("sync.status.offline") : t("sync.retrying_in").replace("{s}", String(Math.round(RETRY_SCHEDULE_MS[0] / 1000)))}
      </div>
    </PageShell>
  );
}