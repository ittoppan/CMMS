"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Grid } from "@astryxdesign/core/Grid";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import {
  PlusIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserIcon
} from "@heroicons/react/24/outline";

export interface KanbanItem {
  id: string;
  dbId?: number;
  woNumber: string;
  asset: string;
  symptoms: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  assignee: string;
  status: "open" | "in_progress" | "pending" | "completed";
  createdAt: string;
}

const mockKanbanData: KanbanItem[] = [
  { id: "kb-1", woNumber: "EN-2607-001", asset: "Flexo Printing Press #1", symptoms: "มอเตอร์สายพานลำเลียงมีเสียงดังผิดปกติ", priority: "High", assignee: "สมศักดิ์ ช่างซ่อม", status: "open", createdAt: "2026-07-31 09:30" },
  { id: "kb-2", woNumber: "EN-2607-002", asset: "Dry Lamination Machine #3", symptoms: "ชุดควบคุมความร้อนเซนเซอร์เพี้ยน", priority: "Critical", assignee: "สมชาย วิศวกร", status: "in_progress", createdAt: "2026-07-31 10:15" },
  { id: "kb-3", woNumber: "EN-2607-003", asset: "Air Compressor 75kW", symptoms: "วาล์วระบายน้ำอุดตัน รออะไหล่ซีลยาง", priority: "Medium", assignee: "วิชัย ช่างไฟ", status: "pending", createdAt: "2026-07-30 14:00" },
  { id: "kb-4", woNumber: "EN-2607-004", asset: "Chain Conveyor Main Line", symptoms: "ตั้งศูนย์สายพานและเปลี่ยนลูกปืนเรียบร้อย", priority: "Low", assignee: "ประเสริฐ ช่างกล", status: "completed", createdAt: "2026-07-29 16:30" },
  { id: "kb-5", woNumber: "EN-2607-005", asset: "Toyota Forklift 2.5Ton", symptoms: "ระบบไฮดรอลิกรั่วซึม", priority: "High", assignee: "อนันต์ ช่างเครื่อง", status: "in_progress", createdAt: "2026-07-31 11:00" },
];

const priorityColors: Record<KanbanItem["priority"], "error" | "warning" | "info" | "neutral"> = {
  Critical: "error",
  High: "warning",
  Medium: "info",
  Low: "neutral",
};

export default function RepairKanbanPage() {
  const [items, setItems] = useState<KanbanItem[]>(mockKanbanData);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const fetchKanban = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/index.php?resource=work-orders");
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
        const fetched: KanbanItem[] = json.data.map((row: any) => {
          let normalizedStatus: KanbanItem["status"] = "open";
          const rawStatus = String(row.status || "").toLowerCase();
          if (rawStatus.includes("complete") || rawStatus.includes("closed")) {
            normalizedStatus = "completed";
          } else if (rawStatus.includes("progress") || rawStatus.includes("assigned")) {
            normalizedStatus = "in_progress";
          } else if (rawStatus.includes("pending") || rawStatus.includes("wait")) {
            normalizedStatus = "pending";
          } else {
            normalizedStatus = "open";
          }

          let normalizedPriority: KanbanItem["priority"] = "Medium";
          const rawPrio = String(row.priority || "").toLowerCase();
          if (rawPrio.includes("crit")) normalizedPriority = "Critical";
          else if (rawPrio.includes("high")) normalizedPriority = "High";
          else if (rawPrio.includes("low")) normalizedPriority = "Low";

          return {
            id: `db-wo-${row.id}`,
            dbId: row.id,
            woNumber: row.work_order_no || `EN-2607-${String(row.id).padStart(3, '0')}`,
            asset: row.asset_name || row.title || "เครื่องจักรไม่ระบุ",
            symptoms: row.description || row.symptoms || "แจ้งซ่อมบำรุงประจำวัน",
            priority: normalizedPriority,
            assignee: row.assigned_name || "ยังไม่จ่ายงาน",
            status: normalizedStatus,
            createdAt: row.created_at || "2026-07-31"
          };
        });
        setItems(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch kanban items", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchKanban();
  }, []);

  // Change status of item
  const updateStatus = (itemId: string, newStatus: KanbanItem["status"]) => {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, status: newStatus } : item));
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        item.woNumber.toLowerCase().includes(q) ||
        item.asset.toLowerCase().includes(q) ||
        item.symptoms.toLowerCase().includes(q) ||
        item.assignee.toLowerCase().includes(q);
      const matchPriority = priorityFilter === "all" || item.priority === priorityFilter;
      return matchSearch && matchPriority;
    });
  }, [items, search, priorityFilter]);

  const columnsDef = [
    {
      key: "open" as const,
      title: "🟡 รอดำเนินการ (To Do)",
      color: "var(--cmms-warning)",
      bg: "var(--cmms-warning-wash)",
      items: filteredItems.filter(i => i.status === "open"),
      nextStatus: "in_progress" as const,
      nextLabel: "เริ่มซ่อม ➔",
    },
    {
      key: "in_progress" as const,
      title: "🔵 กำลังซ่อมบำรุง (In Progress)",
      color: "var(--cmms-primary)",
      bg: "var(--cmms-primary-wash)",
      items: filteredItems.filter(i => i.status === "in_progress"),
      prevStatus: "open" as const,
      nextStatus: "pending" as const,
      prevLabel: "⬅️ ย้อนกลับ",
      nextLabel: "รออะไหล่/ปิดงาน ➔",
    },
    {
      key: "pending" as const,
      title: "🔴 รออะไหล่/ประเมิน",
      color: "var(--cmms-danger)",
      bg: "var(--cmms-danger-wash)",
      items: filteredItems.filter(i => i.status === "pending"),
      prevStatus: "in_progress" as const,
      nextStatus: "completed" as const,
      prevLabel: "⬅️ กำลังซ่อม",
      nextLabel: "เสร็จสิ้น ➔",
    },
    {
      key: "completed" as const,
      title: "🟢 เสร็จสมบูรณ์ (Completed)",
      color: "var(--cmms-success)",
      bg: "var(--cmms-success-wash)",
      items: filteredItems.filter(i => i.status === "completed"),
      prevStatus: "in_progress" as const,
      prevLabel: "⬅️ ย้อนกลับ",
    },
  ];

  return (
    <VStack gap={6}>
      {/* Header */}
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Heading level={2}>📌 Kanban Board งานซ่อมบำรุง</Heading>
          <Text type="body" color="secondary">บอร์ดติดตามสถานะงานซ่อมแบบพกพาตามกระบวนการทำงาน (Work Order Workflow)</Text>
        </VStack>
        <HStack gap={2}>
          <Button
            label="รีเฟรช"
            variant="secondary"
            icon={<Icon icon={ArrowPathIcon} size="sm" />}
            onClick={fetchKanban}
          />
          <Button
            label="สร้างใบสั่งงาน"
            variant="primary"
            icon={<Icon icon={PlusIcon} size="sm" />}
            onClick={() => (window.location.href = "/repair/request")}
          />
        </HStack>
      </HStack>

      {/* Toolbar Filter */}
      <Toolbar
        label="ตัวกรอง Kanban"
        startContent={
          <>
            <TextInput
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาเลขงาน, เครื่องจักร, ช่าง..."
              startIcon={MagnifyingGlassIcon}
              value={search}
              onChange={setSearch}
            />
            <Selector
              label="ความสำคัญ"
              isLabelHidden
              placeholder="ทุกระดับความด่วน"
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={[
                { value: "all", label: "ทุกความด่วน" },
                { value: "Critical", label: "🔴 Critical" },
                { value: "High", label: "🟡 High" },
                { value: "Medium", label: "🔵 Medium" },
                { value: "Low", label: "⚪ Low" },
              ]}
            />
          </>
        }
      />

      {/* Board Columns */}
      <Grid columns={{ minWidth: 260, repeat: "fit" }} gap={4}>
        {columnsDef.map((col) => (
          <Card
            key={col.key}
            padding={4}
            style={{
              borderTop: `4px solid ${col.color}`,
              background: 'var(--cmms-bg-card)',
              minHeight: 500,
            }}
          >
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center" style={{ borderBottom: '1px solid var(--cmms-border)', paddingBottom: 10 }}>
                <Text type="body" weight="bold" style={{ fontSize: '0.95rem' }}>{col.title}</Text>
                <Badge label={String(col.items.length)} variant="neutral" />
              </HStack>

              {loading ? (
                <Text type="body" color="secondary" style={{ textAlign: 'center', padding: 20 }}>กำลังโหลด...</Text>
              ) : col.items.length === 0 ? (
                <div style={{
                  padding: 24, textAlign: 'center', borderRadius: 8,
                  border: '1px dashed var(--cmms-border)', color: 'var(--cmms-text-muted)',
                  fontSize: '0.85rem',
                }}>
                  ไม่มีงานในสถานะนี้
                </div>
              ) : (
                <VStack gap={3}>
                  {col.items.map((item) => (
                    <Card
                      key={item.id}
                      padding={4}
                      style={{
                        border: '1px solid var(--cmms-border)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <VStack gap={2}>
                        <HStack hAlign="between" vAlign="center">
                          <Text type="body" weight="bold" style={{ color: 'var(--cmms-primary)' }}>
                            {item.woNumber}
                          </Text>
                          <Badge
                            label={item.priority}
                            variant={priorityColors[item.priority] || "neutral"}
                          />
                        </HStack>

                        <Text type="body" weight="semibold" style={{ fontSize: '0.95rem' }}>
                          {item.asset}
                        </Text>

                        <Text type="body" size="sm" color="secondary" style={{
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                        }}>
                          {item.symptoms}
                        </Text>

                        <HStack hAlign="between" vAlign="center" style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--cmms-border-light)' }}>
                          <Text type="body" size="sm" color="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icon icon={UserIcon} size="xsm" /> {item.assignee}
                          </Text>
                        </HStack>

                        {/* Interactive Move Action Buttons */}
                        <HStack hAlign="between" gap={1} style={{ marginTop: 8 }}>
                          {col.prevStatus ? (
                            <Button
                              label={col.prevLabel}
                              variant="secondary"
                              size="sm"
                              onClick={() => updateStatus(item.id, col.prevStatus)}
                            />
                          ) : <div />}

                          {col.nextStatus && (
                            <Button
                              label={col.nextLabel}
                              variant="primary"
                              size="sm"
                              onClick={() => updateStatus(item.id, col.nextStatus)}
                            />
                          )}
                        </HStack>
                      </VStack>
                    </Card>
                  ))}
                </VStack>
              )}
            </VStack>
          </Card>
        ))}
      </Grid>
    </VStack>
  );
}
