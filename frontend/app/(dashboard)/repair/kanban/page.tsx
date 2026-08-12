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
import AndonLamp from "@/components/AndonLamp";

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

const priorityColors: Record<KanbanItem["priority"], "error" | "warning" | "info" | "neutral"> = {
  Critical: "error",
  High: "warning",
  Medium: "info",
  Low: "neutral",
};

export default function RepairKanbanPage() {
  const [items, setItems] = useState<KanbanItem[]>([]);
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
            woNumber: row.work_order_no || `EN-${String(row.id).padStart(3, '0')}`,
            asset: row.asset_name || row.title || "เครื่องจักรไม่ระบุ",
            symptoms: row.description || row.symptoms || "แจ้งซ่อมบำรุงประจำวัน",
            priority: normalizedPriority,
            assignee: row.assigned_name || "ยังไม่จ่ายงาน",
            status: normalizedStatus,
            createdAt: row.created_at || "-"
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

  // หัวคอลัมน์ใช้ไฟ Andon: เหลือง=อยู่ในสายงาน, แดง=ถูกบล็อก (รออะไหล่), เขียว=เสร็จ
  const columnsDef = [
    {
      key: "open" as const,
      title: "รอดำเนินการ",
      andon: "warn" as const,
      tone: "#F59E0B",
      items: filteredItems.filter(i => i.status === "open"),
      nextStatus: "in_progress" as const,
      nextLabel: "เริ่มซ่อม",
    },
    {
      key: "in_progress" as const,
      title: "กำลังซ่อมบำรุง",
      andon: "warn" as const,
      tone: "#F59E0B",
      items: filteredItems.filter(i => i.status === "in_progress"),
      prevStatus: "open" as const,
      nextStatus: "pending" as const,
      prevLabel: "ย้อนกลับ",
      nextLabel: "รออะไหล่ / ปิดงาน",
    },
    {
      key: "pending" as const,
      title: "รออะไหล่ / ประเมิน",
      andon: "down" as const,
      tone: "#EF4444",
      items: filteredItems.filter(i => i.status === "pending"),
      prevStatus: "in_progress" as const,
      nextStatus: "completed" as const,
      prevLabel: "กำลังซ่อม",
      nextLabel: "เสร็จสิ้น",
    },
    {
      key: "completed" as const,
      title: "เสร็จสมบูรณ์",
      andon: "ok" as const,
      tone: "#10B981",
      items: filteredItems.filter(i => i.status === "completed"),
      prevStatus: "in_progress" as const,
      prevLabel: "ย้อนกลับ",
    },
  ];

  return (
    <VStack gap={6}>
      {/* Header */}
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow">
            Kanban Board · CMMS-TOPPAN
          </Text>
          <Heading level={2}>Kanban งานซ่อม</Heading>
          <Text type="body" color="secondary">บอร์ดติดตามสถานะงานซ่อมตามกระบวนการทำงาน — หัวคอลัมน์เป็นไฟสัญญาณ: เหลือง=อยู่ในสายงาน แดง=รออะไหล่ เขียว=เสร็จ</Text>
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
                { value: "Critical", label: "วิกฤต (Critical)" },
                { value: "High", label: "สูง (High)" },
                { value: "Medium", label: "ปานกลาง (Medium)" },
                { value: "Low", label: "ต่ำ (Low)" },
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
              borderTop: `4px solid ${col.tone}`,
              background: 'var(--cmms-bg-card)',
              minHeight: 500,
            }}
          >
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center" style={{ borderBottom: '1px solid var(--cmms-border)', paddingBottom: 10 }}>
                <HStack gap={2} vAlign="center">
                  <AndonLamp status={col.andon} size="sm" />
                  <Text type="body" weight="bold" style={{ fontSize: '0.95rem' }}>{col.title}</Text>
                </HStack>
                <span className="cmms-count-pill">{col.items.length}</span>
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
                              icon={<Icon icon={ChevronLeftIcon} size="xsm" />}
                              onClick={() => updateStatus(item.id, col.prevStatus)}
                            />
                          ) : <div />}

                          {col.nextStatus && (
                            <Button
                              label={col.nextLabel}
                              variant="primary"
                              size="sm"
                              icon={<Icon icon={ChevronRightIcon} size="xsm" />}
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
