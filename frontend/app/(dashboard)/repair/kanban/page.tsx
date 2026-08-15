"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { normalizeRepairStatus, repairStatusLabel, repairStatusAndon, isRepairOverdue } from "@/lib/repair-status";
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
  overdue: boolean;
  createdAt: string;
  team: { user_id: number; role: string; full_name: string; status?: string; accepted_at?: string }[];
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
  const hero = usePageHero("repair/kanban");
  const [items, setItems] = useState<KanbanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // ── ย้ายงานระหว่างคอลัมน์ (ลากวาง + ปุ่ม) — บันทึกลง DB จริง ──
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [moveMsg, setMoveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // สถานะคอลัมน์ Kanban → ค่าใน DB (ตามชุดกลาง repair-status.ts)
  const KANBAN_TO_DB: Record<KanbanItem["status"], string> = {
    open: "open",
    in_progress: "in_progress",
    pending: "waiting_parts",
    completed: "completed",
  };

  const persistStatus = async (item: KanbanItem, newStatus: KanbanItem["status"]) => {
    if (item.status === newStatus || savingId) return;
    const prevStatus = item.status;
    // optimistic update ก่อน — ย้ายการ์ดทันที
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
    setSavingId(item.id);
    setMoveMsg(null);
    try {
      const res = await fetch(`/api/v1/repair.php?id=${item.dbId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: KANBAN_TO_DB[newStatus] }),
      });
      const json = await res.json();
      if (!res.ok || (!json.success && !json.message)) throw new Error(json.error || "บันทึกไม่สำเร็จ");
      setMoveMsg({ kind: "ok", text: `ย้าย ${item.woNumber} ไป "${columnsDef.find(c => c.key === newStatus)?.title ?? newStatus}" สำเร็จ` });
      fetchKanban(); // ดึงใหม่ — ดึง completed_at/เวลาจริงจาก DB
    } catch (e) {
      console.error(e);
      // ย้อนกลับถ้าบันทึกไม่สำเร็จ
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: prevStatus } : i));
      setMoveMsg({ kind: "err", text: `บันทึกสถานะ ${item.woNumber} ไม่สำเร็จ — ลองอีกครั้ง` });
    } finally {
      setSavingId(null);
    }
  };

  const fetchKanban = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/index.php?resource=work-orders");
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
        const fetched: KanbanItem[] = json.data.map((row: any) => {
          let normalizedStatus: KanbanItem["status"] = "open";
          // ใช้สถานะกลางเดียวกับหน้ารายการ (lib/repair-status.ts) — alias/สี/คำแปลตรงกัน
          const k = normalizeRepairStatus(row.status);
          if (k === "completed" || k === "closed") {
            normalizedStatus = "completed";
          } else if (k === "waiting_parts") {
            normalizedStatus = "pending";
          } else if (k === "in_progress") {
            normalizedStatus = "in_progress";
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
            overdue: isRepairOverdue(row.estimated_completion_date, row.status),
            createdAt: row.created_at || "-",
            team: Array.isArray(row.team) ? row.team : []
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



  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        item.woNumber.toLowerCase().includes(q) ||
        item.asset.toLowerCase().includes(q) ||
        item.symptoms.toLowerCase().includes(q) ||
        item.assignee.toLowerCase().includes(q);
      const matchPriority = priorityFilter === "all" || item.priority === priorityFilter;
      const matchOverdue = !overdueOnly || item.overdue;
      return matchSearch && matchPriority && matchOverdue;
    });
  }, [items, search, priorityFilter, overdueOnly]);

  // หัวคอลัมน์ใช้ไฟ Andon จากสถานะกลาง (repair-status.ts) — สี/ชื่อตรงกับหน้ารายการ
  const columnsDef = [
    {
      key: "open" as const,
      title: repairStatusLabel("open"),
      andon: repairStatusAndon("open"),
      tone: "var(--cmms-text-muted)",
      items: filteredItems.filter(i => i.status === "open"),
      nextStatus: "in_progress" as const,
      nextLabel: "เริ่มซ่อม",
    },
    {
      key: "in_progress" as const,
      title: repairStatusLabel("in_progress"),
      andon: repairStatusAndon("in_progress"),
      tone: "var(--cmms-warning)",
      items: filteredItems.filter(i => i.status === "in_progress"),
      prevStatus: "open" as const,
      nextStatus: "pending" as const,
      prevLabel: "ย้อนกลับ",
      nextLabel: "รออะไหล่ / ปิดงาน",
    },
    {
      key: "pending" as const,
      title: repairStatusLabel("waiting_parts"),
      andon: repairStatusAndon("waiting_parts"),
      tone: "var(--cmms-warning)",
      items: filteredItems.filter(i => i.status === "pending"),
      prevStatus: "in_progress" as const,
      nextStatus: "completed" as const,
      prevLabel: "กำลังซ่อม",
      nextLabel: "เสร็จสิ้น",
    },
    {
      key: "completed" as const,
      title: repairStatusLabel("completed"),
      andon: repairStatusAndon("completed"),
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
            {hero.eyebrow}
          </Text>
          <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <button
            type="button"
            onClick={fetchKanban}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300"
          >
            <ArrowPathIcon className="w-4 h-4" />{t("action.refresh")}</button>
          <button
            type="button"
            onClick={() => (window.location.href = "/repair/request")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white cmms-btn-primary"
          >
            <PlusIcon className="w-4 h-4" />{t("action.create_wo")}</button>
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
                <button
                  type="button"
                  onClick={() => setOverdueOnly(v => !v)}
                  title="แสดงเฉพาะงานที่เลยกำหนดเสร็จ"
                  className={overdueOnly ? "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cmms-andon-chip" : "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"}
                  style={overdueOnly
                    ? { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)", border: "1px solid var(--cmms-danger)" }
                    : { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)", border: "1px solid var(--cmms-border)", cursor: "pointer" }}
                >
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: overdueOnly ? "var(--cmms-danger)" : "var(--cmms-text-muted)" }} />
                  เกินกำหนดเท่านั้น
                </button>
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
              <HStack hAlign="between" vAlign="center" style={{ borderBottom: '1px solid var(--cmms-border)', paddingBottom: 10 }}>            <HStack gap={2} vAlign="center">
              <AndonLamp status={col.andon} size="sm" />
              <Text type="body" weight="bold" style={{ fontSize: '0.95rem' }}>{col.title}</Text>
            </HStack>
            <span className="cmms-count-pill">{col.items.length}</span>
          </HStack>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverKey(col.key); }}
            onDragLeave={() => setDragOverKey(prev => prev === col.key ? null : prev)}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragId;
              setDragId(null);
              setDragOverKey(null);
              if (!id) return;
              const item = items.find(i => i.id === id);
              if (item && item.status !== col.key) persistStatus(item, col.key);
            }}
            style={{
              flex: 1,
              borderRadius: 12,
              outline: dragOverKey === col.key ? '2px dashed var(--cmms-primary)' : 'none',
              outlineOffset: 2,
              background: dragOverKey === col.key ? 'var(--cmms-primary-wash)' : 'transparent',
              minHeight: 120,
              transition: 'background 120ms ease',
            }}
          >
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
                      draggable={!savingId}
                      onDragStart={(e) => { setDragId(item.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setDragOverKey(null); }}
                      style={{
                        border: '1px solid var(--cmms-border)',
                        borderLeft: `3px solid ${priorityTone[item.priority] || "var(--cmms-text-secondary)"}`,
                        boxShadow: dragId === item.id ? '0 6px 16px rgba(0,0,0,0.12)' : '0 2px 4px rgba(0,0,0,0.04)',
                        opacity: dragId === item.id ? 0.55 : 1,
                        cursor: savingId ? 'wait' : 'grab',
                        transition: 'all 0.2s',
                      }}
                    >
                      <VStack gap={2}>
                        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={1}>
                          <HStack gap={1.5} vAlign="center">
                            <Text type="body" weight="bold" style={{ color: 'var(--cmms-primary)' }}>
                              {item.woNumber}
                            </Text>
                            {item.overdue && (
                              <span className="cmms-status down"><span className="cmms-status-dot" />เกินกำหนด</span>
                            )}
                          </HStack>
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

                        {/* สถานะรับงานต่อคน — ใครรับแล้ว/ใครยังไม่รับ */}
                        {item.team.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                            {item.team.map((m) => {
                              const accepted = m.status === "accepted";
                              const declined = m.status === "declined";
                              return (
                                <span
                                  key={m.user_id}
                                  className="cmms-andon-chip"
                                  style={{
                                    background: declined ? "var(--cmms-danger-light)" : accepted ? "var(--cmms-success-light)" : "var(--cmms-warning-light)",
                                    color: declined ? "var(--cmms-danger-dark)" : accepted ? "var(--cmms-success-dark)" : "var(--cmms-warning-dark)",
                                    fontSize: "0.68rem",
                                    padding: "2px 7px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-block",
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      background: declined ? "var(--cmms-danger)" : accepted ? "var(--cmms-success)" : "var(--cmms-warning)",
                                    }}
                                  />
                                  {m.full_name || "?"}{declined ? " ปฏิเสธ" : accepted ? "" : " ยังไม่รับ"}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Interactive Move Action Buttons */}
                        <HStack hAlign="between" gap={1} style={{ marginTop: 8 }}>
                          {col.prevStatus ? (
                            <button
                              type="button"
                              disabled={savingId === item.id}
                              onClick={() => persistStatus(item, col.prevStatus!)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                            >
                              <ChevronLeftIcon className="w-3.5 h-3.5" />
                              {savingId === item.id ? "กำลังบันทึก..." : col.prevLabel}
                            </button>
                          ) : <div />}

                          {col.nextStatus && (
                            <button
                              type="button"
                              disabled={savingId === item.id}
                              onClick={() => persistStatus(item, col.nextStatus!)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronRightIcon className="w-3.5 h-3.5" />
                              {savingId === item.id ? "กำลังบันทึก..." : col.nextLabel}
                            </button>
                          )}
                        </HStack>
                      </VStack>
                    </Card>
                  ))}
                </VStack>
              )}
            </div>
          </VStack>
          </Card>
        ))}
      </Grid>

      {/* ผลการย้ายงาน */}
      {moveMsg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: `1px solid ${moveMsg.kind === "ok" ? "var(--cmms-success)" : "var(--cmms-danger)"}`, background: moveMsg.kind === "ok" ? "var(--cmms-success-light)" : "var(--cmms-danger-light)", color: moveMsg.kind === "ok" ? "var(--cmms-success-dark)" : "var(--cmms-danger)", fontSize: "0.85rem", fontWeight: 600 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: moveMsg.kind === "ok" ? "var(--cmms-success)" : "var(--cmms-danger)" }} />
          {moveMsg.text}
        </div>
      )}
    </VStack>
  );
}
