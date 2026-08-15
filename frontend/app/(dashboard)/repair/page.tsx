"use client";

import { useState, useMemo, useEffect } from "react";
import { usePageHero } from "@/lib/i18n";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Table, proportional, useTablePagination } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import CountUp from "react-countup";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import WorkOrderClosureDocument, { WorkOrderDocData, WorkOrderPart } from "../../../components/WorkOrderClosureDocument";

interface WorkOrder extends Record<string, unknown> {
  id: string;
  woNumber: string;
  asset: string;
  status: string;
  priority: string;
  assignee: string;
  date: string;
}

const priorityColors: Record<string, React.CSSProperties> = {
  Critical: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  critical: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  High: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  high: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  Medium: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  medium: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  Low: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  low: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

const statusLabels: Record<string, string> = {
  completed: "เสร็จสิ้น", Completed: "เสร็จสิ้น", closed: "ปิดงาน", resolved: "แก้ไขแล้ว",
  in_progress: "กำลังซ่อม", "In Progress": "กำลังซ่อม", waiting_parts: "รออะไหล่", pending_parts: "รออะไหล่",
  open: "รอดำเนินการ", Open: "รอดำเนินการ", pending: "รอดำเนินการ",
  overdue: "เกินกำหนด", Overdue: "เกินกำหนด",
};

const priorityLabels: Record<string, string> = {
  critical: "วิกฤต", Critical: "วิกฤต",
  high: "สูง", High: "สูง",
  medium: "ปานกลาง", Medium: "ปานกลาง",
  low: "ต่ำ", Low: "ต่ำ",
};

const PAGE_SIZE = 10;

// สถานะ → ไฟ Andon: เขียว=เสร็จ, เหลือง=ต้องดูแล, แดง(กระพริบ)=เกินกำหนด, เทา=รอดำเนินการ
const andonOf = (s: string): "ok" | "warn" | "down" | "idle" => {
  const v = String(s || "").toLowerCase();
  if (v === "completed" || v === "closed" || v === "resolved") return "ok";
  if (v === "in_progress" || v === "waiting_parts" || v === "pending_parts") return "warn";
  if (v === "overdue") return "down";
  return "idle";
};

export default function WorkOrdersPage() {
  const hero = usePageHero("repair");
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rawMap, setRawMap] = useState<Record<number, any>>({});
  const [pdfBuilding, setPdfBuilding] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const [partsForBatch, setPartsForBatch] = useState<Record<number, WorkOrderPart[]>>({});

  const fetchWO = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/repair.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `wo-${row.id}`,
          woNumber: row.work_order_no || `WO-${row.id}`,
          asset: row.asset_name || row.asset_code || row.title || "ไม่ระบุ",
          status: row.status || "pending",
          priority: row.priority || "Medium",
          assignee: row.assigned_name || row.assigned_to || "ยังไม่มอบหมาย",
          date: row.created_at ? row.created_at.split(" ")[0] : "-"
        }));
        setWorkOrders(fetched);
        const map: Record<number, any> = {};
        json.forEach((row: any) => { map[row.id] = row; });
        setRawMap(map);
      }
    } catch (e) {
      console.error("Failed to fetch WO", e);
      setError("Failed to fetch work orders. Please try again.");
    }
    setLoading(false);
  };

  useEffect(() => { 
    fetchWO(); 
    setError(null);
  }, []);

  const filtered = useMemo(() => {
    const statusGroup = (s: string) => {
      const v = String(s || "").toLowerCase();
      if (v === "completed" || v === "closed" || v === "resolved") return "completed";
      if (v === "in_progress" || v === "waiting_parts" || v === "pending_parts") return "in_progress";
      if (v === "open" || v === "pending" || v === "overdue") return "open";
      return v;
    };
    return workOrders.filter((wo) => {
      const q = search.toLowerCase();
      const matchSearch = !q || wo.woNumber.toLowerCase().includes(q) || wo.asset.toLowerCase().includes(q) || wo.assignee.toLowerCase().includes(q);
      const matchStatus = !statusFilter || statusGroup(wo.status) === statusFilter;
      const matchPriority = !priorityFilter || wo.priority === priorityFilter;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [search, statusFilter, priorityFilter, workOrders]);

  // Compute stats
  const stats = useMemo(() => {
    const total = workOrders.length;
    const open = workOrders.filter(w => ["open", "Open", "pending", "Overdue", "overdue"].includes(w.status)).length;
    const inprog = workOrders.filter(w => ["in_progress", "In Progress", "waiting_parts", "pending_parts"].includes(w.status)).length;
    const done = workOrders.filter(w => ["completed", "Completed", "closed", "resolved"].includes(w.status)).length;
    const overdue = workOrders.filter(w => w.status === "Overdue" || w.status === "overdue").length;
    return { total, open, inprog, done, overdue };
  }, [workOrders]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pagination = useTablePagination<WorkOrder>({
    page,
    onPageChange: setPage,
    totalItems,
    pageSize: PAGE_SIZE,
  });

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (filtered.length === 0) return prev;
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((w) => Number(w.rawId)));
    });
  };

  const toDocData = (row: any, parts: WorkOrderPart[] = []): WorkOrderDocData => ({
    id: Number(row.id),
    workOrderNo: row.work_order_no || `EN-${row.id}`,
    assetName: row.asset_name || row.title || "-",
    title: row.title || "-",
    description: row.description || row.failure_report || "-",
    status: row.status || "pending",
    priority: row.priority || "medium",
    assignedName: row.assigned_name || "-",
    receiverName: row.receiver_name || "-",
    beforeImg: row.before_image_path || "",
    afterImg: row.after_image_path || "",
    receiverSignature: row.receiver_signature_path || "",
    completedAt: row.completed_at || row.updated_at || "-",
    createdDate: row.created_at || "-",
    rootCause: row.root_cause || "-",
    solution: row.solution || row.resolution || "-",
    costParts: Number(row.cost_parts || 0),
    costLabor: Number(row.cost_labor || 0),
    costOutsource: Number(row.cost_outsource || 0),
    downtimeMinutes: Number(row.downtime_minutes || 0),
    parts,
  });

  const handleBatchDownload = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0 || pdfBuilding) return;
    setPdfBuilding(true);
    try {
      setPdfProgress("กำลังโหลดข้อมูลอะไหล่...");
      const partsRes = await fetch(`/api/v1/repair.php?parts=1&ids=${ids.join(",")}`);
      const partsJson = await partsRes.json();
      const partsMap: Record<number, WorkOrderPart[]> =
        partsJson && typeof partsJson === "object" && !Array.isArray(partsJson) ? partsJson : {};
      setPartsForBatch(partsMap);
      // รอ React re-render โหนดเอกสารให้มีตารางอะไหล่ก่อน capture
      await new Promise((r) => setTimeout(r, 200));

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      let first = true;
      for (let i = 0; i < ids.length; i++) {
        const row = rawMap[ids[i]];
        const node = row ? document.getElementById(`batch-doc-${row.id}`) : null;
        if (!row || !node) continue;
        setPdfProgress(`กำลังสร้าง PDF... ${i + 1}/${ids.length}`);
        const canvas = await html2canvas(node, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const img = canvas.toDataURL("image/png");
        if (!first) pdf.addPage();
        const imgHeight = (canvas.height * pw) / canvas.width;
        pdf.addImage(img, "PNG", 0, 0, pw, imgHeight);
        first = false;
        await new Promise((r) => setTimeout(r, 60));
      }
      if (first) {
        alert("ไม่พบข้อมูลงานที่เลือก — กรุณาลองใหม่");
      } else {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        pdf.save(`F-EN-03-Batch-${date}-${ids.length}wo.pdf`);
        setSelected(new Set());
      }
    } catch (e) {
      console.error("Batch PDF failed", e);
      alert("ไม่สามารถสร้าง PDF รวมได้ — กรุณาลองใหม่อีกครั้ง");
    }
    setPartsForBatch({});
    setPdfBuilding(false);
    setPdfProgress("");
  };

  const columns: TableColumn<WorkOrder>[] = [
    {
      key: "select",
      header: "เลือก",
      width: proportional(0.4),
      renderCell: (item: WorkOrder) => (
        <input
          type="checkbox"
          aria-label={`เลือกงาน ${item.woNumber}`}
          checked={selected.has(Number(item.rawId))}
          onChange={() => toggleSelect(Number(item.rawId))}
          style={{ width: 16, height: 16, cursor: "pointer" }}
        />
      ),
    },
    { key: "woNumber", header: "เลขที่งาน", width: proportional(1) },
    { key: "asset", header: "เครื่องจักร/อุปกรณ์", width: proportional(2) },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1),
      renderCell: (item: WorkOrder) => (
        <span className={`cmms-status ${andonOf(item.status)}`}>
          <span className="cmms-status-dot" />
          {statusLabels[item.status] || item.status}
        </span>
      ),
    },
    {
      key: "priority",
      header: "ความเร่งด่วน",
      width: proportional(1),
      renderCell: (item: WorkOrder) => (
        <span className="cmms-andon-chip" style={priorityColors[item.priority] || { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
          {priorityLabels[item.priority] || item.priority}
        </span>
      ),
    },
    { key: "assignee", header: "ผู้รับผิดชอบ", width: proportional(1) },
    { key: "date", header: "วันที่แจ้ง", width: proportional(1) },
    {
      key: "actions",
      header: "การจัดการ",
      width: proportional(1.2),
      renderCell: (item: WorkOrder) => (
        <button
          type="button"
          onClick={() => router.push(`/repair/edit?id=${item.rawId || item.id}`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
        >
          อัปเดตสถานะ
        </button>
      ),
    },
  ];

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (default = เรียงเดิม)
  const layout = usePageLayout("/repair", ["hero", "kpi", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {error && (
        <Banner status="error" title="Error" description={error} isDismissable={false} />
      )}

      {/* Header */}
      <div style={layoutStyle("hero")}>
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
            disabled={pdfBuilding || selected.size === 0}
            onClick={handleBatchDownload}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              pdfBuilding || selected.size === 0
                ? "bg-white/10 text-white/40 cursor-not-allowed"
                : selected.size > 0
                  ? "bg-white text-[var(--cmms-primary)] shadow-lg hover:bg-blue-50"
                  : "bg-white/10 text-white/85 hover:bg-white/20"
            }`}
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            {pdfBuilding ? (pdfProgress || "กำลังสร้าง PDF...") : selected.size > 0 ? `ดาวน์โหลด PDF (${selected.size})` : "ดาวน์โหลด PDF"}
          </button>
          <button
            type="button"
            onClick={fetchWO}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300"
          >
            <ArrowPathIcon className="w-4 h-4" />
            รีเฟรช
          </button>
          <button
            type="button"
            onClick={() => router.push("/repair/create")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white cmms-btn-primary"
          >
            <PlusIcon className="w-4 h-4" />
            สร้างใบสั่งงาน
          </button>
        </HStack>
      </div>
      </div>

      {/* KPI — มินิบอร์ด Andon: กวาดตาเดียวรู้สถานะงาน */}
      <div style={layoutStyle("kpi")}>
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card blue">
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center">
              <HStack vAlign="center" gap={2}>
                
                <Text type="supporting" color="secondary">งานซ่อมทั้งหมด</Text>
              </HStack>
              <AndonLamp status="idle" size="sm" />
            </HStack>
            <div className="cmms-kpi-value">
              <CountUp end={stats.total} />
              <span className="cmms-kpi-unit">รายการ</span>
            </div>
          </VStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card amber">
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center">
              <HStack vAlign="center" gap={2}>
                
                <Text type="supporting" color="secondary">รอดำเนินการ (Open)</Text>
              </HStack>
              <AndonLamp status="warn" size="sm" />
            </HStack>
            <div className="cmms-kpi-value">
              <CountUp end={stats.open} />
              <span className="cmms-kpi-unit">รายการ</span>
            </div>
          </VStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card cyan">
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center">
              <HStack vAlign="center" gap={2}>
                
                <Text type="supporting" color="secondary">กำลังซ่อม (In Progress)</Text>
              </HStack>
              <AndonLamp status="warn" size="sm" />
            </HStack>
            <div className="cmms-kpi-value">
              <CountUp end={stats.inprog} />
              <span className="cmms-kpi-unit">รายการ</span>
            </div>
          </VStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card green">
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center">
              <HStack vAlign="center" gap={2}>
                
                <Text type="supporting" color="secondary">เสร็จสิ้น (Completed)</Text>
              </HStack>
              <AndonLamp status="ok" size="sm" />
            </HStack>
            <div className="cmms-kpi-value">
              <CountUp end={stats.done} />
              <span className="cmms-kpi-unit">รายการ</span>
            </div>
          </VStack>
        </Card>
        {stats.overdue > 0 && (
          <Card elevation="low" padding={4} className="cmms-kpi-card red">
            <VStack gap={2}>
              <HStack hAlign="between" vAlign="center">
                <HStack vAlign="center" gap={2}>
                  
                  <Text type="supporting" color="secondary">เกินกำหนด</Text>
                </HStack>
                <AndonLamp status="down" size="sm" />
              </HStack>
              <div className="cmms-kpi-value">
                <CountUp end={stats.overdue} />
                <span className="cmms-kpi-unit">รายการ</span>
              </div>
            </VStack>
          </Card>
        )}
      </Grid>
      </div>

      <div style={layoutStyle("content")}>
      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
            <HStack gap={2} vAlign="center">
              <div className="w-8 h-8 rounded-lg cmms-icon-tile">
                <ClipboardDocumentListIcon className="w-4 h-4" />
              </div>
              <Heading level={3} style={{ margin: 0 }}>รายการงานซ่อม</Heading>
              <span className="cmms-count-pill">{totalItems} รายการ</span>
            </HStack>
            {statusFilter && (
              <Text type="body" size="sm" color="secondary">
                ตัวกรองสถานะ: {statusFilter === "open" ? "งานใหม่ (Open)" : statusFilter === "in_progress" ? "กำลังซ่อม" : "เสร็จสิ้น"}
              </Text>
            )}
          </HStack>

          {/* Filter Toolbar */}
          <Toolbar
            label="ตัวกรองงานซ่อม"
            startContent={
              <>
                <HStack gap={2} vAlign="center">
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      aria-label="เลือกทั้งหมดในหน้านี้"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleAll}
                      style={{ width: 15, height: 15, cursor: "pointer" }}
                    />
                    เลือกทั้งหมด
                  </label>
                  {selected.size > 0 && (
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                      เลือก {selected.size} รายการ
                    </span>
                  )}
                </HStack>
                <TextInput
                  label="ค้นหา"
                  isLabelHidden
                  placeholder="ค้นหาเลขงาน, เครื่องจักร..."
                  startIcon={MagnifyingGlassIcon}
                  value={search}
                  onChange={setSearch}
                />
                <Selector
                  label="สถานะ"
                  isLabelHidden
                  placeholder="ทุกสถานะ"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "", label: "ทุกสถานะ" },
                    { value: "open", label: "งานใหม่ (Open)" },
                    { value: "in_progress", label: "กำลังซ่อม" },
                    { value: "completed", label: "เสร็จสิ้น" },
                  ]}
                />
                <Selector
                  label="ความสำคัญ"
                  isLabelHidden
                  placeholder="ทุกความเร่งด่วน"
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  options={[
                    { value: "", label: "ทุกความเร่งด่วน" },
                    { value: "critical", label: "วิกฤต (Critical)" },
                    { value: "high", label: "ด่วน (High)" },
                    { value: "medium", label: "ปกติ (Medium)" },
                    { value: "low", label: "ต่ำ (Low)" },
                  ]}
                />
              </>
            }
          />

          {/* Table */}
          {loading ? (
            <HStack hAlign="center" style={{ padding: 40 }}>
              <Spinner size="md" />
              <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
            </HStack>
          ) : paged.length === 0 ? (
            <EmptyState
              title="ไม่พบงานซ่อม"
              description="ลองเปลี่ยนตัวกรองหรือสร้างใบสั่งงานใหม่"
              icon={<MagnifyingGlassIcon className="w-6 h-6" />}
            />
          ) : (
            <Table<WorkOrder>
              data={paged}
              columns={columns}
              idKey="id"
              density="balanced"
              dividers="rows"
              hasHover
              plugins={{ pagination }}
            />
          )}
        </VStack>
      </Card>
      </div>

      {/* Hidden off-screen document nodes for batch PDF capture */}
      {selected.size > 0 && (
        <div style={{ position: "fixed", top: 0, left: -9999, width: 794, pointerEvents: "none" }} aria-hidden="true">
          {Array.from(selected).map((id) => {
            const row = rawMap[id];
            if (!row) return null;
            return (
              <div key={id} id={`batch-doc-${id}`} style={{ width: 794 }}>
                <WorkOrderClosureDocument wo={toDocData(row, partsForBatch[id] || [])} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
