"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { normalizeRepairStatus, repairStatusLabel, repairStatusAndon, isRepairOverdue } from "@/lib/repair-status";
import { Plus, RefreshCw, Search, ChevronRight, ChevronLeft, User, Inbox } from "lucide-react";
import AndonLamp from "@/components/AndonLamp";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-native";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";

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
    } catch (e: any) {
      console.error(e);
      // ย้อนกลับถ้าบันทึกไม่สำเร็จ
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: prevStatus } : i));
      const serverMsg = typeof e?.message === "string" && e.message.includes("ปนเปื้อน")
        ? e.message
        : `บันทึกสถานะ ${item.woNumber} ไม่สำเร็จ — ลองอีกครั้ง`;
      setMoveMsg({ kind: "err", text: serverMsg });
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="cmms-eyebrow">{hero.eyebrow}</p>
        <PageHeader
          title={hero.title}
          description={hero.desc}
          actions={
            <>
              <Button variant="outline" onClick={fetchKanban} className="gap-2">
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
                {t("action.refresh")}
              </Button>
              <Button onClick={() => (window.location.href = "/repair/request")} className="gap-2">
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                {t("action.create_wo")}
              </Button>
            </>
          }
        />
      </div>

      {/* Toolbar Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg cmms-icon-tile">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            ตัวกรองบอร์ด
            <span className="cmms-count-pill">{filteredItems.length} งาน</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]"
              />
              <Input
                aria-label="ค้นหา"
                placeholder="ค้นหาเลขงาน, เครื่องจักร, ช่าง..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              aria-label="ความสำคัญ"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="sm:w-52"
            >
              <option value="all">ทุกความด่วน</option>
              <option value="Critical">วิกฤต (Critical)</option>
              <option value="High">สูง (High)</option>
              <option value="Medium">ปานกลาง (Medium)</option>
              <option value="Low">ต่ำ (Low)</option>
            </Select>
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
          </div>
        </CardContent>
      </Card>

      {/* Board Columns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {columnsDef.map((col) => (
          <div
            key={col.key}
            className="flex flex-col gap-4 rounded-[var(--cmms-radius-lg)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] p-4"
            style={{ borderTop: `4px solid ${col.tone}`, minHeight: 500 }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--cmms-border)] pb-2.5">
              <div className="flex items-center gap-2">
                <AndonLamp status={col.andon} size="sm" />
                <span className="text-[0.95rem] font-bold">{col.title}</span>
              </div>
              <span className="cmms-count-pill">{col.items.length}</span>
            </div>

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
              className="flex-1 rounded-xl"
              style={{
                outline: dragOverKey === col.key ? '2px dashed var(--cmms-primary)' : 'none',
                outlineOffset: 2,
                background: dragOverKey === col.key ? 'var(--cmms-primary-wash)' : 'transparent',
                minHeight: 120,
                transition: 'background 120ms ease',
              }}
            >
              {loading ? (
                <p className="p-5 text-center text-sm text-[var(--cmms-text-secondary)]">กำลังโหลด...</p>
              ) : col.items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--cmms-border)] p-6 text-center text-[0.85rem] text-[var(--cmms-text-muted)]">
                  <Inbox size={24} strokeWidth={1.5} className="opacity-50" aria-hidden="true" />
                  ไม่มีงานในสถานะนี้
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {col.items.map((item) => (
                    <div
                      key={item.id}
                      draggable={!savingId}
                      onDragStart={(e) => { setDragId(item.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setDragOverKey(null); }}
                      className="rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] p-4"
                      style={{
                        borderLeft: `3px solid ${priorityTone[item.priority] || "var(--cmms-text-secondary)"}`,
                        boxShadow: dragId === item.id ? '0 6px 16px rgba(0,0,0,0.12)' : '0 2px 4px rgba(0,0,0,0.04)',
                        opacity: dragId === item.id ? 0.55 : 1,
                        cursor: savingId ? 'wait' : 'grab',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[var(--cmms-primary)]">{item.woNumber}</span>
                            {item.overdue && (
                              <span className="cmms-status down"><span className="cmms-status-dot" />เกินกำหนด</span>
                            )}
                          </div>
                          <span className="cmms-andon-chip" style={priorityColors[item.priority] || { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                            {item.priority}
                          </span>
                        </div>

                        <p className="text-[0.95rem] font-semibold">{item.asset}</p>

                        <p className="line-clamp-2 text-sm text-[var(--cmms-text-secondary)]">{item.symptoms}</p>

                        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-[var(--cmms-border)] pt-1.5">
                          <span className="flex items-center gap-1 text-sm text-[var(--cmms-text-secondary)]">
                            <User size={14} strokeWidth={1.75} aria-hidden="true" /> {item.assignee}
                          </span>
                          <span className="text-sm text-[var(--cmms-text-secondary)]">
                            {item.createdAt && item.createdAt !== "-" ? item.createdAt.split(" ")[0] : ""}
                          </span>
                        </div>

                        {/* สถานะรับงานต่อคน — ใครรับแล้ว/ใครยังไม่รับ */}
                        {item.team.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
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
                        <div className="mt-2 flex items-center justify-between gap-1">
                          {col.prevStatus ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={savingId === item.id}
                              onClick={() => persistStatus(item, col.prevStatus!)}
                              className="gap-1.5"
                            >
                              <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
                              {savingId === item.id ? "กำลังบันทึก..." : col.prevLabel}
                            </Button>
                          ) : <div />}

                          {col.nextStatus && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={savingId === item.id}
                              onClick={() => persistStatus(item, col.nextStatus!)}
                              className="gap-1.5"
                            >
                              <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                              {savingId === item.id ? "กำลังบันทึก..." : col.nextLabel}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ผลการย้ายงาน */}
      {moveMsg && (
        <Alert variant={moveMsg.kind === "ok" ? "success" : "danger"}>
          {moveMsg.text}
        </Alert>
      )}
    </div>
  );
}
