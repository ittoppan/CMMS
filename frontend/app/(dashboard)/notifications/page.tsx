"use client";

// notifications — Phase 16 Notification Center
// ข้อมูลจริงจาก /api/v1/notifications.php (ตาราง notifications ผ่าน NotificationCenterService)
// + tabs all/unread/read + กรองประเภท + ค้นหา + mark read/all read (บันทึกจริง)
// + ประวัติการส่งแจ้งเตือน (notification_logs)

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import {
  Wrench,
  Package,
  CalendarDays,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  BellRing,
  Siren,
  Timer,
  ClipboardList,
  Server,
  CheckCheck,
} from "lucide-react";
import {
  fetchNotifications,
  markRead,
  markAllRead,
  fetchMeta,
  type NotifItem,
  type NotifCounts,
  type NotifMeta,
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

const typeIconMap: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  work_order: Wrench,
  priority: Siren,
  sla: Timer,
  pm: CalendarDays,
  inspection: ClipboardList,
  spare_part: Package,
  request: ClipboardList,
  system: Server,
  calibration: Wrench,
  maintenance: ClipboardList,
};

const badgeVariant: Record<string, "danger" | "warning" | "primary" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "primary",
  low: "neutral",
  info: "neutral",
};

const deliveryColumns: SimpleColumn<any>[] = [
  {
    key: "channel",
    header: "ช่องทาง",
    renderCell: (log) => <Badge variant="info">{String(log.channel || "-")}</Badge>,
  },
  {
    key: "status",
    header: "สถานะ",
    renderCell: (log) => {
      const ok = log.status === "SENT";
      return <Badge variant={ok ? "success" : "danger"}>{String(log.status || "-")}</Badge>;
    },
  },
  {
    key: "content",
    header: "ข้อความ",
    renderCell: (log) => (
      <div className="line-clamp-2 max-w-[420px] whitespace-pre-line text-sm text-muted-foreground">
        {String(log.content || "")}
      </div>
    ),
  },
  {
    key: "created_at",
    header: "เวลา",
    align: "right",
    renderCell: (log) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {String(log.created_at || "-").replace("T", " ").slice(0, 16)}
      </span>
    ),
  },
];

export default function NotificationCenterPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [counts, setCounts] = useState<NotifCounts | null>(null);
  const [meta, setMeta] = useState<NotifMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deliveryLogs, setDeliveryLogs] = useState<any[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<any>({ total: 0, sent: 0, failed: 0, today: 0, by_channel: {}, by_status: {} });
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async (refreshCounts = true) => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchNotifications({ tab, type: typeFilter, search, limit: 100 });
      setItems(list.items);
      if (refreshCounts) setCounts(list.counts);
    } catch {
      setError("ไม่สามารถโหลดการแจ้งเตือนได้");
    }
    setLoading(false);
  }, [tab, typeFilter, search]);

  useEffect(() => {
    load();
    fetchMeta().then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดซ้ำเมื่อเปลี่ยน tab/type/search
  }, [tab, typeFilter, search]);

  const fetchDeliveryLog = async () => {
    try {
      const res = await fetch("/api/v1/notifications_log.php");
      const json = await res.json();
      if (json.status === "success") {
        setDeliveryLogs(json.data || []);
        setDeliveryStats(json.stats || {});
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchDeliveryLog();
  }, []);

  useEffect(() => {
    const refresh = () => {
      const pending = Number(localStorage.getItem("cmms:repair_request_pending") || "0");
      setPendingCount(pending);
    };
    refresh();
    window.addEventListener("cmms:offline-queued", refresh);
    return () => window.removeEventListener("cmms:offline-queued", refresh);
  }, []);

  const handleMarkRead = async (id: number) => {
    await markRead([id]).catch(() => {});
    load();
  };

  const handleMarkAllRead = async () => {
    await markAllRead().catch(() => {});
    load();
  };

  const unread = counts?.unread ?? 0;
  const total = counts?.total ?? 0;

  const kpiTiles = [
    { label: "ยังไม่อ่าน", value: unread, unit: "รายการ", Icon: BellRing, tile: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)]" },
    { label: "ทั้งหมดในกล่อง", value: total, unit: "รายการ", Icon: BellRing, tile: "bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)]" },
    { label: "งานซ่อม (WO)", value: counts?.by_type?.work_order ?? 0, unit: "ใบ", Icon: Wrench, tile: "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]" },
    { label: "คำขอแจ้งซ่อม", value: counts?.by_type?.request ?? 0, unit: "รายการ", Icon: ClipboardList, tile: "bg-[var(--cmms-info-light)] text-[var(--cmms-info)]" },
  ];

  const deliveryKpis = [
    { label: "ส่งทั้งหมด", value: deliveryStats.total, unit: "ครั้ง", Icon: RefreshCw, tile: "bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)]" },
    { label: "ส่งสำเร็จ (SENT)", value: deliveryStats.sent, unit: "ครั้ง", Icon: CheckCircle2, tile: "bg-[var(--cmms-success-light)] text-[var(--cmms-success)]" },
    { label: "ล้มเหลว / ไม่มีผู้รับ", value: deliveryStats.failed, unit: "ครั้ง", Icon: XCircle, tile: "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]" },
    { label: "ส่งวันนี้", value: deliveryStats.today, unit: "ครั้ง", Icon: Clock, tile: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)]" },
  ];

  const typeOptions = useMemo(() => {
    if (!meta) return [];
    return Object.entries(meta.type_labels).map(([key, label]) => ({ key, label: label.th }));
  }, [meta]);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">NOTIFICATIONS · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "ศูนย์แจ้งเตือน" }]}
      title={
        <span className="inline-flex flex-wrap items-center gap-3">
          ศูนย์แจ้งเตือนระบบ
          {unread > 0 && (
            <Badge variant="danger" dot className="font-medium normal-case tracking-normal">
              {unread} รายการยังไม่อ่าน
            </Badge>
          )}
        </span>
      }
      description="ศูนย์กลางการแจ้งเตือนจากระบบ: งานซ่อม คำขอ SLA UML ตรวจเช็ค อะไหล่ และกระบวนการอัตโนมัติ"
      actions={
        <>
          <Button variant="outline" onClick={() => load()}>
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
          <Button onClick={() => handleMarkAllRead()}>
            <CheckCheck size={16} strokeWidth={1.75} aria-hidden="true" />
            อ่านแล้วทั้งหมด
          </Button>
        </>
      }
    >
      <div className="space-y-6 pb-24 lg:pb-8">
        {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

        {/* KPI */}
        <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
          {kpiTiles.map((k) => (
            <Card key={k.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${k.tile}`}>
                  <k.Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {k.value ?? 0} <span className="text-sm font-normal"> {k.unit}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </Grid>

        {/* Tabs + Filters */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v)}>
              <TabsList>
                <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
                <TabsTrigger value="unread">
                  ยังไม่อ่าน
                  {unread > 0 && <span className="ml-1.5">({unread})</span>}
                </TabsTrigger>
                <TabsTrigger value="read">อ่านแล้ว</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  label="ค้นหา"
                  isLabelHidden
                  placeholder="ค้นหาข้อความแจ้งเตือน..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="w-full sm:w-[220px]">
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
                  <SelectTrigger aria-label="ประเภท">
                    <SelectValue placeholder="ทุกประเภทแจ้งเตือน" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกประเภท</SelectItem>
                    {typeOptions.map((o) => (
                      <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Items List */}
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16">
            <Spinner size={20} label="กำลังโหลดการแจ้งเตือน..." />
          </div>
        ) : (
          <div className="space-y-3">
            {items.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  ไม่พบรายการแจ้งเตือน
                </CardContent>
              </Card>
            ) : (
              items.map((item) => {
                const IconComp = typeIconMap[item.type] ?? BellRing;
                const isRead = Boolean(item.read_at);
                const p = (item.priority || "info") as string;
                return (
                  <Card
                    key={item.id}
                    className={`transition-colors ${!isRead ? "bg-[var(--cmms-primary-light)]" : ""}`}
                    style={{
                      borderLeftWidth: 4,
                      borderLeftColor:
                        p === "critical" ? "var(--cmms-danger)" :
                        p === "high" ? "var(--cmms-warning)" :
                        p === "medium" ? "var(--cmms-info)" : "var(--cmms-border)",
                    }}
                  >
                    <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: p === "critical" ? "var(--cmms-danger-light)" : "var(--cmms-bg-muted)",
                            color: p === "critical" ? "var(--cmms-danger)" : "var(--cmms-text-primary)",
                          }}
                        >
                          <IconComp size={20} strokeWidth={1.75} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-foreground">{item.title}</p>
                            {!isRead && <Badge variant="info" dot>ใหม่</Badge>}
                            <Badge variant={badgeVariant[p] ?? "neutral"}>{p.toUpperCase()}</Badge>
                            {meta?.type_labels[item.type] && (
                              <Badge variant="neutral">{meta.type_labels[item.type].th}</Badge>
                            )}
                          </div>
                          {item.message && (
                            <p className="whitespace-pre-line text-sm text-muted-foreground">{item.message}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!isRead && (
                          <Button variant="secondary" size="sm" onClick={() => handleMarkRead(item.id)}>
                            <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                            อ่านแล้ว
                          </Button>
                        )}
                        <Button size="sm" onClick={() => router.push(item.url || "/notifications")}>
                          ดูรายละเอียด
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* ═══════ ประวัติการส่งแจ้งเตือน (จาก notification_logs จริง) ═══════ */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">ประวัติการส่งแจ้งเตือน</h2>
              <p className="text-xs text-muted-foreground">
                บันทึกการส่งจริงจากระบบ (LINE / Web Push) — จากตาราง notification_logs
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={fetchDeliveryLog}>
              <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
              รีเฟรช
            </Button>
          </div>

          <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
            {deliveryKpis.map((k) => (
              <Card key={k.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${k.tile}`}>
                    <k.Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm text-muted-foreground">{k.label}</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {k.value ?? 0} <span className="text-sm font-normal"> {k.unit}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </Grid>

          <SimpleDataTable
            columns={deliveryColumns}
            data={deliveryLogs}
            idKey="id"
            pageSize={10}
            emptyTitle="ยังไม่มีประวัติการส่งแจ้งเตือน"
          />
        </section>
      </div>
    </PageShell>
  );
}