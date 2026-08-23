"use client";

// notifications — v3 design system (shadcn-style)
// logic ครบเดิม: รวมการแจ้งเตือนจริงจาก repair / spare_parts / pm-plans / calibration
// + ประวัติการส่งแจ้งเตือนจาก notification_logs

import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";

interface NotificationItem {
  id: string;
  type: "repair" | "stock" | "pm" | "calibration";
  title: string;
  detail: string;
  time: string;
  priority: "critical" | "high" | "medium" | "info";
  link: string;
}

const typeIcons = {
  repair: Wrench,
  stock: Package,
  pm: CalendarDays,
  calibration: Wrench,
};

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

const priorityBadgeVariant: Record<string, "danger" | "warning" | "primary" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "primary",
  info: "neutral",
};

const deliveryColumns: SimpleColumn<any>[] = [
  {
    key: "channel",
    header: "ช่องทาง",
    renderCell: (log) => (
      <Badge variant="info">{String(log.channel || "-")}</Badge>
    ),
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
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  // ประวัติการส่งแจ้งเตือนจริงจากตาราง notification_logs
  const [deliveryLogs, setDeliveryLogs] = useState<any[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<any>({ total: 0, sent: 0, failed: 0, today: 0, by_channel: {}, by_status: {} });

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const [woRes, partRes, pmRes, calRes] = await Promise.all([
        fetch("/api/v1/repair.php"),
        fetch("/api/v1/spare_parts.php"),
        fetch("/api/v1/index.php?resource=pm-plans"),
        fetch("/api/v1/calibration.php"),
      ]);
      const woJson = await woRes.json();
      const partJson = await partRes.json();
      const pmJson = await pmRes.json();
      const calJson = await calRes.json();

      // index.php คืน { status, code, count, data } — ขยาย data ถ้าไม่ใช่ array
      const pmList = Array.isArray(pmJson) ? pmJson : (Array.isArray(pmJson?.data) ? pmJson.data : []);

      const notifications: NotificationItem[] = [];

      // 1. งานซ่อม: งานด่วน/วิกฤตที่ยังไม่เสร็จ + งานเปิดค้างนาน
      if (Array.isArray(woJson)) {
        woJson.forEach((w: any) => {
          const notDone = !w.status || !["completed", "closed", "resolved", "cancelled"].includes(w.status);
          if (!notDone) return;
          if (w.priority === "critical" || w.priority === "high") {
            notifications.push({
              id: `wo-${w.id}`,
              type: "repair",
              title: `🚨 แจ้งซ่อม${w.priority === "critical" ? "ด่วน" : ""}: ${w.work_order_no}`,
              detail: `${w.asset_name || "เครื่องจักร"}${w.title ? ` — ${w.title}` : ""}`,
              time: timeAgo(w.created_at),
              priority: w.priority === "critical" ? "critical" : "high",
              link: `/repair/edit?id=${w.id}`,
            });
          }
        });
      }

      // 2. อะไหล่ต่ำกว่า Min Stock
      if (Array.isArray(partJson)) {
        partJson
          .filter((p: any) => parseFloat(p.min_stock) > 0 && parseFloat(p.stock_qty) <= parseFloat(p.min_stock))
          .slice(0, 10)
          .forEach((p: any) => {
            notifications.push({
              id: `sp-${p.id}`,
              type: "stock",
              title: `⚠ อะไหล่ต่ำกว่าเกณฑ์ Min Stock: ${p.code}`,
              detail: `${p.name} เหลือในคลัง ${p.stock_qty} ${p.unit} (Min: ${p.min_stock})`,
              time: timeAgo(p.last_synced_at || p.updated_at),
              priority: "high",
              link: "/spare_parts",
            });
          });
      }

      // 3. แผน PM ครบกำหนด / เลยกำหนด
      if (Array.isArray(pmList)) {
        pmList
          .filter((p: any) => p.status === "pending" || p.status === "overdue" || p.status === "in_progress")
          .forEach((p: any) => {
            const overdue = p.due_date && p.due_date < new Date().toISOString().slice(0, 10);
            notifications.push({
              id: `pm-${p.id}`,
              type: "pm",
              title: overdue ? `⏰ แผน PM เลยกำหนด: ${p.title}` : `📅 แผน PM ครบกำหนด: ${p.title}`,
              detail: overdue
                ? `ครบกำหนด ${p.due_date} — ยังไม่ดำเนินการ`
                : `ครบกำหนด ${p.due_date} — ต้องดำเนินการ`,
              time: p.due_date ? `ครบกำหนด ${p.due_date}` : "-",
              priority: overdue ? "critical" : "medium",
              link: "/pm_am/checksheet",
            });
          });
      }

      // 4. สอบเทียบใกล้ครบกำหนด
      if (Array.isArray(calJson)) {
        calJson
          .filter((c: any) => c.status === "pending" || c.status === "scheduled" || c.status === "in_progress")
          .slice(0, 10)
          .forEach((c: any) => {
            const nextDue = c.next_calibration_date || "-";
            notifications.push({
              id: `cal-${c.id}`,
              type: "calibration",
              title: `🔧 เครื่องมือวัดต้องสอบเทียบ: ${c.asset_name || `#${c.id}`}`,
              detail: `รอบสอบเทียบถัดไป: ${nextDue}`,
              time: `ครบกำหนด ${nextDue}`,
              priority: "medium",
              link: "/calibration",
            });
          });
      }

      // จำกัดจำนวนต่อประเภทเพื่อให้ทุกหมวดแสดง (แล้วค่อย sort รวม)
      const limitByType = (list: NotificationItem[], max: number) => list.slice(0, max);
      const balanced = [
        ...limitByType(notifications.filter((n) => n.type === "repair"), 12),
        ...limitByType(notifications.filter((n) => n.type === "stock"), 8),
        ...limitByType(notifications.filter((n) => n.type === "pm"), 8),
        ...limitByType(notifications.filter((n) => n.type === "calibration"), 5),
      ];

      // เรียงตามความสำคัญก่อน แล้วตามเวลา
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, info: 3 };
      balanced.sort((a, b) => order[a.priority] - order[b.priority]);
      setItems(balanced);
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดการแจ้งเตือนได้");
    }
    setLoading(false);
  };

  const fetchDeliveryLog = async () => {
    try {
      const res = await fetch("/api/v1/notifications_log.php");
      const json = await res.json();
      if (json.status === "success") {
        setDeliveryLogs(json.data || []);
        setDeliveryStats(json.stats || {});
      }
    } catch (e) {
      console.error("Fetch delivery log error", e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchDeliveryLog();
  }, []);

  const markAllRead = () => {
    setReadIds(new Set(items.map((i) => i.id)));
  };

  const markRead = (id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
  };

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const q = search.toLowerCase();
      const matchSearch = !q || item.title.toLowerCase().includes(q) || item.detail.toLowerCase().includes(q);
      const matchType = typeFilter === "all" || item.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [search, typeFilter, items]);

  const unreadCount = items.filter((i) => !readIds.has(i.id)).length;

  const counts = useMemo(() => ({
    repair: items.filter((i) => i.type === "repair").length,
    stock: items.filter((i) => i.type === "stock").length,
    pm: items.filter((i) => i.type === "pm").length,
    calibration: items.filter((i) => i.type === "calibration").length,
  }), [items]);

  if (loading) {
    return (
      <PageShell
        eyebrow={<p className="cmms-eyebrow">NOTIFICATIONS · CMMS-TOPPAN</p>}
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "ศูนย์แจ้งเตือน" }]}
        title="ศูนย์แจ้งเตือนระบบ"
        description="แจ้งเตือนจากข้อมูลจริง: งานซ่อมด่วน อะไหล่ใกล้หมด แผน PM และการสอบเทียบ"
      >
        <div className="flex items-center justify-center gap-2 py-16">
          <Spinner size={20} label="กำลังโหลดการแจ้งเตือน..." />
        </div>
      </PageShell>
    );
  }

  const kpiTiles = [
    { label: "แจ้งซ่อมด่วน / สำคัญ", value: counts.repair, unit: "รายการ", Icon: Wrench, tile: "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]" },
    { label: "เตือนอะไหล่ใกล้หมด", value: counts.stock, unit: "รายการ", Icon: Package, tile: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)]" },
    { label: "แผนงาน PM", value: counts.pm, unit: "แผนงาน", Icon: CalendarDays, tile: "bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)]" },
    { label: "การสอบเทียบ", value: counts.calibration, unit: "รายการ", Icon: Wrench, tile: "bg-[var(--cmms-success-light)] text-[var(--cmms-success)]" },
  ];

  const deliveryKpis = [
    { label: "ส่งทั้งหมด", value: deliveryStats.total, unit: "ครั้ง", Icon: RefreshCw, tile: "bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)]" },
    { label: "ส่งสำเร็จ (SENT)", value: deliveryStats.sent, unit: "ครั้ง", Icon: CheckCircle2, tile: "bg-[var(--cmms-success-light)] text-[var(--cmms-success)]" },
    { label: "ล้มเหลว / ไม่มีผู้รับ", value: deliveryStats.failed, unit: "ครั้ง", Icon: XCircle, tile: "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]" },
    { label: "ส่งวันนี้", value: deliveryStats.today, unit: "ครั้ง", Icon: Clock, tile: "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)]" },
  ];

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "ศูนย์แจ้งเตือน" }]}
      title={
        <span className="inline-flex flex-wrap items-center gap-3">
          ศูนย์แจ้งเตือนระบบ
          {unreadCount > 0 && (
            <Badge variant="danger" dot className="font-medium normal-case tracking-normal">
              {unreadCount} ข้อความใหม่
            </Badge>
          )}
        </span>
      }
      description="แจ้งเตือนจากข้อมูลจริง: งานซ่อมด่วน อะไหล่ใกล้หมด แผน PM และการสอบเทียบ"
      actions={
        <>
          <Button variant="outline" onClick={fetchNotifications}>
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
          <Button onClick={markAllRead}>
            <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
            อ่านแล้วทั้งหมด
          </Button>
        </>
      }
    >
      <div className="space-y-6 pb-24 lg:pb-8">
        {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

        {/* KPI Cards */}
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

        {/* Filter */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
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
                  <SelectItem value="repair">งานซ่อมบำรุง</SelectItem>
                  <SelectItem value="stock">สต็อกอะไหล่</SelectItem>
                  <SelectItem value="pm">แผน PM</SelectItem>
                  <SelectItem value="calibration">การสอบเทียบ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notification Items List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                ไม่พบรายการแจ้งเตือน
              </CardContent>
            </Card>
          ) : (
            filtered.map((item) => {
              const isRead = readIds.has(item.id);
              const IconComp = typeIcons[item.type];
              return (
                <Card
                  key={item.id}
                  className="transition-colors"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor:
                      item.priority === "critical" ? "var(--cmms-danger)" :
                      item.priority === "high" ? "var(--cmms-warning)" :
                      item.priority === "medium" ? "var(--cmms-info)" : "var(--cmms-border)",
                    background: isRead ? undefined : "var(--cmms-primary-light)",
                  }}
                >
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          background: item.priority === "critical" ? "var(--cmms-danger-light)" : "var(--cmms-bg-muted)",
                          color: item.priority === "critical" ? "var(--cmms-danger)" : "var(--cmms-text-primary)",
                        }}
                      >
                        <IconComp size={20} strokeWidth={1.75} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold">{item.title}</p>
                          {!isRead && <Badge variant="info" dot>ใหม่</Badge>}
                          <Badge variant={priorityBadgeVariant[item.priority] ?? "neutral"}>
                            {item.priority.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.detail}</p>
                        <p className="text-xs text-muted-foreground">{item.time}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!isRead && (
                        <Button variant="secondary" size="sm" onClick={() => markRead(item.id)}>
                          <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                          อ่านแล้ว
                        </Button>
                      )}
                      <Button size="sm" onClick={() => router.push(item.link)}>
                        ดูรายละเอียด
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

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
