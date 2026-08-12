"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
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
              title: `⚠️ อะไหล่ต่ำกว่าเกณฑ์ Min Stock: ${p.code}`,
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
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>🔔 ศูนย์แจ้งเตือนระบบ</Heading>
            {unreadCount > 0 && <Badge label={`${unreadCount} ข้อความใหม่`} variant="error" />}
          </HStack>
          <Text type="body" color="secondary">แจ้งเตือนจากข้อมูลจริง: งานซ่อมด่วน อะไหล่ใกล้หมด แผน PM และการสอบเทียบ</Text>
        </VStack>
        <HStack gap={2}>
          <Button label="รีเฟรช" variant="secondary" icon={<Icon icon={ArrowPathIcon} size="sm" />} onClick={fetchNotifications} />
          <Button label="อ่านแล้วทั้งหมด" variant="primary" icon={<Icon icon={ArrowPathIcon} size="sm" />} onClick={markAllRead} />
        </HStack>
      </HStack>

      {/* KPI Cards */}
      <Grid columns={4} gap={4}>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-danger)" }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">แจ้งซ่อมด่วน / สำคัญ</Text>
            <Heading level={3}>{counts.repair} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
          </VStack>
        </Card>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-warning)" }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">เตือนอะไหล่ใกล้หมด</Text>
            <Heading level={3}>{counts.stock} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
          </VStack>
        </Card>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-info)" }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">แผนงาน PM</Text>
            <Heading level={3}>{counts.pm} <span style={{ fontSize: 14 }}>แผนงาน</span></Heading>
          </VStack>
        </Card>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-success)" }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">การสอบเทียบ</Text>
            <Heading level={3}>{counts.calibration} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
          </VStack>
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
                { value: "repair", label: "🔧 งานซ่อมบำรุง" },
                { value: "stock", label: "📦 สต็อกอะไหล่" },
                { value: "pm", label: "📅 แผน PM" },
                { value: "calibration", label: "🔧 การสอบเทียบ" },
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
                      <Icon icon={typeIcons[item.type]} size="md" />
                    </div>
                    <VStack gap={1}>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="body" weight="bold" style={{ fontSize: "1rem" }}>{item.title}</Text>
                        {!isRead && <Badge label="ใหม่" variant="error" />}
                        <Badge label={item.priority.toUpperCase()} variant={item.priority === "critical" ? "error" : item.priority === "high" ? "warning" : item.priority === "medium" ? "info" : "neutral"} />
                      </HStack>
                      <Text type="body" color="secondary">{item.detail}</Text>
                      <Text type="body" size="sm" color="disabled">{item.time}</Text>
                    </VStack>
                  </HStack>
                  <HStack gap={2}>
                    {!isRead && (
                      <Button label="อ่านแล้ว" variant="secondary" size="sm" onClick={() => markRead(item.id)} />
                    )}
                    <Button label="ดูรายละเอียด" variant="primary" size="sm" onClick={() => router.push(item.link)} />
                  </HStack>
                </HStack>
              </Card>
            );
          })
        )}
      </VStack>

      {/* ═══════ ประวัติการส่งแจ้งเตือน (จาก notification_logs จริง) ═══════ */}
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center">
          <VStack gap={1}>
            <Heading level={3}>📤 ประวัติการส่งแจ้งเตือน</Heading>
            <Text type="body" size="sm" color="secondary">บันทึกการส่งจริงจากระบบ (LINE / Web Push) — จากตาราง notification_logs</Text>
          </VStack>
          <Button label="รีเฟรช" variant="secondary" size="sm" icon={<Icon icon={ArrowPathIcon} size="sm" />} onClick={fetchDeliveryLog} />
        </HStack>

        <Grid columns={4} gap={4}>
          <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-info)" }}>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ส่งทั้งหมด</Text>
              <Heading level={3}>{deliveryStats.total} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
            </VStack>
          </Card>
          <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-success)" }}>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ส่งสำเร็จ (SENT)</Text>
              <Heading level={3}>{deliveryStats.sent} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
            </VStack>
          </Card>
          <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-danger)" }}>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ล้มเหลว / ไม่มีผู้รับ</Text>
              <Heading level={3}>{deliveryStats.failed} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
            </VStack>
          </Card>
          <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-warning)" }}>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ส่งวันนี้</Text>
              <Heading level={3}>{deliveryStats.today} <span style={{ fontSize: 14 }}>ครั้ง</span></Heading>
            </VStack>
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
                          <Badge label={String(log.channel || "-")} variant={log.channel === "LINE" ? "info" : "accent"} />
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <Badge label={String(log.status || "-")} variant={ok ? "success" : "error"} />
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
