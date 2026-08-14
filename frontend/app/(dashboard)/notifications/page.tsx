"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Grid } from "@astryxdesign/core/Grid";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";
import {
  WrenchScrewdriverIcon,
  CubeIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

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
  repair: WrenchScrewdriverIcon,
  stock: CubeIcon,
  pm: CalendarDaysIcon,
  calibration: WrenchScrewdriverIcon,
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
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดการแจ้งเตือน...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>NOTIFICATION CENTER · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ศูนย์แจ้งเตือนระบบ</Heading>
            {unreadCount > 0 && (
              <span className="cmms-andon-chip" style={{ background: "rgba(239,68,68,0.2)", color: "#FCA5A5" }}>
                <span className="cmms-status-dot" /> {unreadCount} ข้อความใหม่
              </span>
            )}
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แจ้งเตือนจากข้อมูลจริง: งานซ่อมด่วน อะไหล่ใกล้หมด แผน PM และการสอบเทียบ
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <button
            type="button"
            onClick={fetchNotifications}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            <ArrowPathIcon className="w-4 h-4" />
            รีเฟรช
          </button>
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300"
          >
            <CheckCircleIcon className="w-4 h-4" />
            อ่านแล้วทั้งหมด
          </button>
        </HStack>
      </div>

      {/* KPI Cards */}
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shadow-md shrink-0">
              <WrenchScrewdriverIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">แจ้งซ่อมด่วน / สำคัญ</Text>
              <Heading level={3}>{counts.repair} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
              <CubeIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เตือนอะไหล่ใกล้หมด</Text>
              <Heading level={3}>{counts.stock} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
              <CalendarDaysIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">แผนงาน PM</Text>
              <Heading level={3}>{counts.pm} <span style={{ fontSize: 14 }}>แผนงาน</span></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-white flex items-center justify-center shadow-md shrink-0">
              <WrenchScrewdriverIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">การสอบเทียบ</Text>
              <Heading level={3}>{counts.calibration} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      {/* Toolbar Filter */}
      <Toolbar
        label="ตัวกรองการแจ้งเตือน"
        startContent={
          <>
            <TextInput
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาข้อความแจ้งเตือน..."
              startIcon={MagnifyingGlassIcon}
              value={search}
              onChange={setSearch}
            />
            <Selector
              label="ประเภท"
              isLabelHidden
              placeholder="ทุกประเภทแจ้งเตือน"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: "ทุกประเภท" },
                { value: "repair", label: "งานซ่อมบำรุง" },
                { value: "stock", label: "สต็อกอะไหล่" },
                { value: "pm", label: "แผน PM" },
                { value: "calibration", label: "การสอบเทียบ" },
              ]}
            />
          </>
        }
      />

      {/* Notification Items List */}
      <VStack gap={3}>
        {filtered.length === 0 ? (
          <Card padding={6}>
            <Text type="body" color="secondary" style={{ textAlign: "center" }}>ไม่พบรายการแจ้งเตือน</Text>
          </Card>
        ) : (
          filtered.map((item) => {
            const isRead = readIds.has(item.id);
            return (
              <Card
                key={item.id}
                padding={4}
                style={{
                  borderLeft: `4px solid ${
                    item.priority === "critical" ? "var(--cmms-danger)" :
                    item.priority === "high" ? "var(--cmms-warning)" :
                    item.priority === "medium" ? "var(--cmms-info)" : "var(--cmms-border)"
                  }`,
                  background: isRead ? "var(--cmms-bg-card)" : "var(--cmms-primary-wash)",
                  transition: "all 0.2s",
                }}
              >
                <HStack hAlign="between" vAlign="start" wrap="wrap" gap={3}>
                  <HStack gap={3} vAlign="start">
                    <div style={{ padding: 10, borderRadius: 8, background: item.priority === "critical" ? "var(--cmms-danger-light)" : "var(--cmms-bg-muted)", color: item.priority === "critical" ? "var(--cmms-danger)" : "var(--cmms-text-primary)" }}>
                      {(() => { const IconComp = typeIcons[item.type]; return <IconComp className="w-6 h-6" />; })()}
                    </div>
                    <VStack gap={1}>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="body" weight="bold" style={{ fontSize: "1rem" }}>{item.title}</Text>
                        {!isRead && <span className="cmms-status down"><span className="cmms-status-dot" />ใหม่</span>}
                        <span
                          className="cmms-andon-chip"
                          style={{
                            background: item.priority === "critical" ? "rgba(239,68,68,0.12)" : item.priority === "high" ? "rgba(245,158,11,0.12)" : item.priority === "medium" ? "rgba(30,136,229,0.12)" : "rgba(100,116,139,0.12)",
                            color: item.priority === "critical" ? "#dc2626" : item.priority === "high" ? "#d97706" : item.priority === "medium" ? "#1E88E5" : "#64748B",
                            fontSize: "0.7rem",
                            padding: "3px 9px",
                          }}
                        >
                          {item.priority.toUpperCase()}
                        </span>
                      </HStack>
                      <Text type="body" color="secondary">{item.detail}</Text>
                      <Text type="body" size="sm" color="disabled">{item.time}</Text>
                    </VStack>
                  </HStack>
                  <HStack gap={2} wrap="wrap">
                    {!isRead && (
                      <button
                        type="button"
                        onClick={() => markRead(item.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                      >
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        อ่านแล้ว
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => router.push(item.link)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-md hover:brightness-110 transition-all duration-300"
                    >
                      ดูรายละเอียด
                    </button>
                  </HStack>
                </HStack>
              </Card>
            );
          })
        )}
      </VStack>

      {/* ═══════ ประวัติการส่งแจ้งเตือน (จาก notification_logs จริง) ═══════ */}
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
          <VStack gap={1}>
            <Heading level={3}>ประวัติการส่งแจ้งเตือน</Heading>
            <Text type="body" size="sm" color="secondary">บันทึกการส่งจริงจากระบบ (LINE / Web Push) — จากตาราง notification_logs</Text>
          </VStack>
          <button
            type="button"
            onClick={fetchDeliveryLog}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            รีเฟรช
          </button>
        </HStack>

        <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
          <Card padding={4} className="cmms-kpi-card">
            <HStack gap={3} vAlign="center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
                <ArrowPathIcon className="w-6 h-6" />
              </div>
              <VStack gap={1}>
                <Text type="supporting" color="secondary">ส่งทั้งหมด</Text>
                <Heading level={3}>{deliveryStats.total} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
              </VStack>
            </HStack>
          </Card>
          <Card padding={4} className="cmms-kpi-card">
            <HStack gap={3} vAlign="center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-white flex items-center justify-center shadow-md shrink-0">
                <CheckCircleIcon className="w-6 h-6" />
              </div>
              <VStack gap={1}>
                <Text type="supporting" color="secondary">ส่งสำเร็จ (SENT)</Text>
                <Heading level={3}>{deliveryStats.sent} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
              </VStack>
            </HStack>
          </Card>
          <Card padding={4} className="cmms-kpi-card">
            <HStack gap={3} vAlign="center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shadow-md shrink-0">
                <XCircleIcon className="w-6 h-6" />
              </div>
              <VStack gap={1}>
                <Text type="supporting" color="secondary">ล้มเหลว / ไม่มีผู้รับ</Text>
                <Heading level={3}>{deliveryStats.failed} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
              </VStack>
            </HStack>
          </Card>
          <Card padding={4} className="cmms-kpi-card">
            <HStack gap={3} vAlign="center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
                <ClockIcon className="w-6 h-6" />
              </div>
              <VStack gap={1}>
                <Text type="supporting" color="secondary">ส่งวันนี้</Text>
                <Heading level={3}>{deliveryStats.today} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
              </VStack>
            </HStack>
          </Card>
        </Grid>

        <Card padding={0} style={{ overflow: "hidden" }}>
          {deliveryLogs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <Text type="body" color="secondary">ยังไม่มีประวัติการส่งแจ้งเตือน</Text>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--cmms-border)", color: "var(--cmms-text-secondary)" }}>
                    <th style={{ padding: "10px 14px" }}>ช่องทาง</th>
                    <th style={{ padding: "10px 14px" }}>สถานะ</th>
                    <th style={{ padding: "10px 14px" }}>ข้อความ</th>
                    <th style={{ padding: "10px 14px" }}>เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryLogs.map((log: any) => {
                    const ok = log.status === "SENT";
                    return (
                      <tr key={log.id} style={{ borderBottom: "1px solid var(--cmms-border)" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <span className="cmms-andon-chip" style={{ background: log.channel === "LINE" ? "rgba(30,136,229,0.12)" : "rgba(124,58,237,0.12)", color: log.channel === "LINE" ? "#1E88E5" : "#7C3AED", fontSize: "0.7rem", padding: "3px 9px" }}>{String(log.channel || "-")}</span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span className="cmms-andon-chip" style={{ background: ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: ok ? "#059669" : "#dc2626", fontSize: "0.7rem", padding: "3px 9px" }}>{String(log.status || "-")}</span>
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--cmms-text-secondary)", maxWidth: 420 }}>
                          <div style={{ whiteSpace: "pre-line", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {String(log.content || "")}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--cmms-text-muted)" }}>
                          {String(log.created_at || "-").replace("T", " ").slice(0, 16)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </VStack>
    </VStack>
  );
}
