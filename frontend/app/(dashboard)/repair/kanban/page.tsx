"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import {
  PlusIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  UserIcon,
  InboxIcon,
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

const priorityColors: Record<KanbanItem["priority"], React.CSSProperties> = {
  Critical: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  High: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  Medium: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  Low: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

// สีเส้นข้างการ์ดตามความเร่งด่วน
const priorityTone: Record<KanbanItem["priority"], string> = {
  Critical: "var(--cmms-danger)",
  High: "var(--cmms-warning)",
  Medium: "var(--cmms-primary)",
  Low: "var(--cmms-text-secondary)",
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
      tone: "var(--cmms-warning)",
      items: filteredItems.filter(i => i.status === "open"),
      nextStatus: "in_progress" as const,
      nextLabel: "เริ่มซ่อม",
    },
    {
      key: "in_progress" as const,
      title: "กำลังซ่อมบำรุง",
      andon: "warn" as const,
      tone: "var(--cmms-warning)",
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
      tone: "var(--cmms-danger)",
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
      tone: "var(--cmms-success)",
      items: filteredItems.filter(i => i.status === "completed"),
      prevStatus: "in_progress" as const,
      prevLabel: "ย้อนกลับ",
    },
  ];

  return (
    <VStack gap={6}>
      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
            Kanban Board · CMMS-TOPPAN
          </Text>
          <Heading level={2} style={{ color: "#fff" }}>Kanban งานซ่อม</Heading>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            บอร์ดติดตามสถานะงานซ่อมตามกระบวนการทำงาน — หัวคอลัมน์เป็นไฟสัญญาณ: เหลือง=อยู่ในสายงาน แดง=รออะไหล่ เขียว=เสร็จ
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <button
            type="button"
            onClick={fetchKanban}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300"
          >
            <ArrowPathIcon className="w-4 h-4" />
            รีเฟรช
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/repair/request")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white cmms-btn-primary"
          >
            <PlusIcon className="w-4 h-4" />
            สร้างใบสั่งงาน
          </button>
        </HStack>
      </div>

      {/* Toolbar Filter */}
      <Card elevation="low" padding={5}>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center">
            <div className="w-8 h-8 rounded-lg cmms-icon-tile">
              <MagnifyingGlassIcon className="w-4 h-4" />
            </div>
            <Heading level={3} style={{ margin: 0 }}>ตัวกรองบอร์ด</Heading>
            <span className="cmms-count-pill">{filteredItems.length} งาน</span>
          </HStack>
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
        </VStack>
      </Card>

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
                  padding: 24, textAlign: 'center', borderRadius: 12,
                  border: '1px dashed var(--cmms-border)', color: 'var(--cmms-text-muted)',
                  fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}>
                  <InboxIcon className="w-6 h-6 opacity-50" />
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
                        borderLeft: `3px solid ${priorityTone[item.priority] || "var(--cmms-text-secondary)"}`,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <VStack gap={2}>
                        <HStack hAlign="between" vAlign="center">
                          <Text type="body" weight="bold" style={{ color: 'var(--cmms-primary)' }}>
                            {item.woNumber}
                          </Text>
                          <span className="cmms-andon-chip" style={priorityColors[item.priority] || { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                            {item.priority}
                          </span>
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
                            <UserIcon className="w-3.5 h-3.5" /> {item.assignee}
                          </Text>
                          <Text type="body" size="sm" color="secondary">
                            {item.createdAt && item.createdAt !== "-" ? item.createdAt.split(" ")[0] : ""}
                          </Text>
                        </HStack>

                        {/* Interactive Move Action Buttons */}
                        <HStack hAlign="between" gap={1} style={{ marginTop: 8 }}>
                          {col.prevStatus ? (
                            <button
                              type="button"
                              onClick={() => updateStatus(item.id, col.prevStatus)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                            >
                              <ChevronLeftIcon className="w-3.5 h-3.5" />
                              {col.prevLabel}
                            </button>
                          ) : <div />}

                          {col.nextStatus && (
                            <button
                              type="button"
                              onClick={() => updateStatus(item.id, col.nextStatus)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
                            >
                              <ChevronRightIcon className="w-3.5 h-3.5" />
                              {col.nextLabel}
                            </button>
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
