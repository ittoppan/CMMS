"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { usePageHero, t, statusText, priorityText } from "@/lib/i18n";
import { isRepairOverdue } from "@/lib/repair-status";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import CountUp from "react-countup";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  DocumentArrowDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import WorkOrderClosureDocument, { WorkOrderDocData, WorkOrderPart } from "../../../components/WorkOrderClosureDocument";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableProps } from "@/components/ui/table";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/cn";

interface WorkOrder extends Record<string, unknown> {
  id: string;
  rawId?: number;
  woNumber: string;
  asset: string;
  status: string;
  priority: string;
  assignee: string;
  date: string;
  overdue: boolean;
  outsourceBy: string;
  costOutsource: number;
}

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

// สถานะ → ไฟ Andon: เขียว=เสร็จ, เหลือง=ต้องดูแล, แดง(กระพริบ)=เกินกำหนด, เทา=รอดำเนินการ
const andonOf = (s: string): "ok" | "warn" | "down" | "idle" => {
  const v = String(s || "").toLowerCase();
  if (v === "completed" || v === "closed" || v === "resolved") return "ok";
  if (v === "in_progress" || v === "waiting_parts" || v === "pending_parts") return "warn";
  if (v === "overdue") return "down";
  return "idle";
};

// สถานะ → Badge variant (semantic tokens)
const statusVariant = (s: string, overdue: boolean): "success" | "warning" | "danger" | "neutral" => {
  if (overdue) return "danger";
  const v = String(s || "").toLowerCase();
  if (v === "completed" || v === "closed" || v === "resolved") return "success";
  if (v === "in_progress" || v === "waiting_parts" || v === "pending_parts") return "warning";
  return "neutral";
};

// ความสำคัญ → Badge variant
const priorityVariant = (p: string): "danger" | "warning" | "primary" | "neutral" => {
  const v = String(p || "").toLowerCase();
  if (v === "critical") return "danger";
  if (v === "high") return "warning";
  if (v === "medium") return "primary";
  return "neutral";
};

const ALL_STATUS = "__all__";
const ALL_PRIORITY = "__all__";

export default function WorkOrdersPage() {
  const hero = usePageHero("repair");
  const router = useRouter();
  const { showToast } = useToast();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [outsourceFilter, setOutsourceFilter] = useState<"all" | "in" | "out">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rawMap, setRawMap] = useState<Record<number, any>>({});
  const [pdfBuilding, setPdfBuilding] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const [partsForBatch, setPartsForBatch] = useState<Record<number, WorkOrderPart[]>>({});
  const [excelBuilding, setExcelBuilding] = useState(false);
  const deptMapRef = useRef<Record<number, string>>({});

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
          date: row.created_at ? row.created_at.split(" ")[0] : "-",
          overdue: isRepairOverdue(row.estimated_completion_date, row.status),
          outsourceBy: row.outsource_by || "",
          costOutsource: Number(row.cost_outsource || 0)
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
      const matchStatus = !statusFilter || (statusFilter === "overdue" ? wo.overdue : statusGroup(wo.status) === statusFilter);
      const matchPriority = !priorityFilter || wo.priority === priorityFilter;
      const matchOutsource = outsourceFilter === "all" || (outsourceFilter === "out" ? !!wo.outsourceBy : !wo.outsourceBy);
      return matchSearch && matchStatus && matchPriority && matchOutsource;
    });
  }, [search, statusFilter, priorityFilter, outsourceFilter, workOrders]);

  // Compute stats
  const stats = useMemo(() => {
    const total = workOrders.length;
    const open = workOrders.filter(w => ["open", "Open", "pending", "Overdue", "overdue"].includes(w.status)).length;
    const inprog = workOrders.filter(w => ["in_progress", "In Progress", "waiting_parts", "pending_parts"].includes(w.status)).length;
    const done = workOrders.filter(w => ["completed", "Completed", "closed", "resolved"].includes(w.status)).length;
    const overdue = workOrders.filter(w => w.overdue).length;
    const outsourceCount = workOrders.filter(w => !!w.outsourceBy).length;
    const outsourceCost = workOrders.reduce((s, w) => s + (w.costOutsource || 0), 0);
    return { total, open, inprog, done, overdue, outsourceCount, outsourceCost };
  }, [workOrders]);

  const totalItems = filtered.length;

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
    contaminateChecking: row.contaminate_checking || "not_checked",
    outsourceBy: row.outsource_by || "",
    actualStartAt: row.actual_start_at || "",
    repairTimeMinutes: Number(row.repair_time_minutes || 0),
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
        showToast("error", "ไม่พบข้อมูลงานที่เลือก — กรุณาลองใหม่");
      } else {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        pdf.save(`F-EN-03-Batch-${date}-${ids.length}wo.pdf`);
        setSelected(new Set());
        showToast("success", `สร้าง PDF รวม ${ids.length} ใบเรียบร้อย`);
      }
    } catch (e) {
      console.error("Batch PDF failed", e);
      showToast("error", "ไม่สามารถสร้าง PDF รวมได้ — กรุณาลองใหม่อีกครั้ง");
    }
    setPartsForBatch({});
    setPdfBuilding(false);
    setPdfProgress("");
  };

  // ── ส่งออก F-EN-03 (MT_JOB) เป็น Excel — ดึงข้อมูลจริงจากตาราง repair ──
  const contamLabel: Record<string, string> = {
    not_checked: "ยังไม่ตรวจ",
    clean: "ไม่พบการปนเปื้อน (ผ่าน)",
    contaminated: "พบการปนเปื้อน",
    not_applicable: "ไม่เกี่ยวข้องกับงานนี้",
  };
  const fmtDate = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");
  const fmtTime = (v: string | null | undefined) => (v ? String(v).slice(11, 16) : "");

  const handleExportExcel = async () => {
    const ids = selected.size > 0 ? Array.from(selected) : filtered.map((w: any) => Number(w.rawId));
    if (ids.length === 0 || excelBuilding) return;
    setExcelBuilding(true);
    try {
      // ชื่อแผนก (cache ครั้งแรก)
      if (Object.keys(deptMapRef.current).length === 0) {
        try {
          const dRes = await fetch("/api/v1/departments.php");
          const dJson = await dRes.json();
          if (Array.isArray(dJson)) dJson.forEach((d: any) => { if (d && d.id) deptMapRef.current[Number(d.id)] = d.name; });
        } catch { /* ไม่มีชื่อแผนกก็ออกได้ */ }
      }
      // อะไหล่ที่ใช้ซ่อม (map: repair_id → รายการ)
      let partsByRow: Record<number, WorkOrderPart[]> = {};
      try {
        const pRes = await fetch(`/api/v1/repair.php?parts=1&ids=${ids.join(",")}`);
        const pJson = await pRes.json();
        if (pJson && typeof pJson === "object" && !Array.isArray(pJson)) partsByRow = pJson;
      } catch { /* ไม่มีอะไหล่ */ }

      // 31 คอลัมน์ตามฟอร์ม F-EN-03 (MT_JOB)
      const header = [
        "ITEMS / รายการ", "MT_JOB NO. / เลขที่เอกสาร", "JOB STATUS / สถานะ", "DEPARTMENT / แผนก",
        "REQUESTOR / ชื่อผู้แจ้ง", "REQUEST DATE / วันที่แจ้ง", "REQUEST TIME / เวลาแจ้ง", "JOB TYPE / ประเภทงาน",
        "JOB DESCRIPTION / ลักษณะงาน", "MACHINE STATUS / สถานะเครื่องจักร", "MACHINE NAME / ชื่อเครื่องจักร",
        "PROBLEM DESCRIPTION / รายละเอียดของปัญหา", "ROOT CAUSE / สาเหตุของปัญหา", "MAINTENANCE DESCRIPTION / รายละเอียดการซ่อม",
        "MAINTENANCE NOTE / บันทึกการซ่อม", "MTN. ACTION / การดำเนินการ", "SPARE PARTS USED / อะไหล่ที่เปลี่ยน",
        "Q'TY. / จำนวน", "CONTAMINATE CHECKING / ตรวจสอบการปนเปื้อน", "CORRECTIVE ACTION / มาตรการป้องกัน",
        "MAKER BY / ผู้ปฏิบัติงาน", "OUTSOURCE BY / ภายนอก (โดย)", "START DATE / วันที่ซ่อม", "START TIME / เวลาซ่อม",
        "FINISH DATE / วันที่เสร็จ", "FINISH TIME / เวลาเสร็จ", "MTN. TIME / เวลาซ่อม", "BD.TIME / เวลาหยุด",
        "CHECKED BY / ผู้ตรวจรับ", "RESPONSIBLE / ผู้รับผิดชอบ", "REMARK / หมายเหตุ",
      ];
      const esc = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const headHtml = `<tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
      const bodyHtml = ids
        .map((id, idx) => {
          const r = rawMap[id];
          if (!r) return "";
          const fr = String(r.failure_report || "");
          const jobType = (fr.match(/JobType:\s*([^|]+)/) || [])[1]?.trim() || r.source_type || "";
          const jobDesc = (fr.match(/JobDescription:\s*([^|]+)/) || [])[1]?.trim() || "";
          const parts = partsByRow[id] || [];
          const cells = [
            idx + 1,
            r.work_order_no || `EN-${r.id}`,
            statusText(r.status, r.status),
            deptMapRef.current[Number(r.department_id)] || "",
            r.receiver_name || "",
            fmtDate(r.created_at),
            fmtTime(r.created_at),
            jobType,
            jobDesc,
            r.machine_status || "",
            r.asset_name || "",
            r.description || r.failure_report || "",
            r.root_cause || "",
            r.solution || r.resolution || "",
            r.notes || "",
            r.diagnosis || "",
            parts.map((p) => `${p.code || "-"} x ${Number(p.quantity_used) || 0}`).join(", "),
            parts.map((p) => Number(p.quantity_used) || 0).join(", "),
            contamLabel[r.contaminate_checking] || "ยังไม่ตรวจ",
            r.rca_category || "",
            r.assigned_name || "",
            r.outsource_by || "",
            fmtDate(r.actual_start_at),
            fmtTime(r.actual_start_at),
            fmtDate(r.completed_at),
            fmtTime(r.completed_at),
            r.repair_time_minutes ? `${r.repair_time_minutes} นาที` : "",
            r.downtime_minutes ? `${r.downtime_minutes} นาที` : "",
            r.receiver_name || "",
            r.assigned_name || "",
            r.notes || "",
          ].map((v) => `<td>${esc(v)}</td>`).join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");

      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body><table border="1">${headHtml}${bodyHtml}</table></body></html>`;
      const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `F-EN-03_MT_JOB_${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("success", `ส่งออก F-EN-03 Excel ${ids.length} รายการเรียบร้อย`);
    } catch (e) {
      console.error("Export F-EN-03 failed", e);
      showToast("error", "ไม่สามารถส่งออก F-EN-03 ได้ — กรุณาลองใหม่อีกครั้ง");
    } finally {
      setExcelBuilding(false);
    }
  };

  const columns: DataTableProps<WorkOrder>["columns"] = [
    {
      id: "select",
      header: t("tbl.select"),
      enableSorting: false,
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`เลือกงาน ${row.original.woNumber}`}
          checked={selected.has(Number(row.original.rawId))}
          onChange={() => toggleSelect(Number(row.original.rawId))}
          className="h-4 w-4 cursor-pointer"
        />
      ),
    },
    { accessorKey: "woNumber", header: t("tbl.wo_no_short") },
    {
      accessorKey: "asset",
      header: t("tbl.asset_full"),
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{row.original.asset}</span>
          {row.original.outsourceBy && (
            <Badge variant="warning">ภายนอก{row.original.outsourceBy ? ` · ${row.original.outsourceBy}` : ""}</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: t("tbl.status"),
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status, row.original.overdue)} dot>
          {row.original.overdue ? "เกินกำหนด" : statusText(row.original.status, row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "priority",
      header: t("tbl.priority"),
      cell: ({ row }) => (
        <Badge variant={priorityVariant(row.original.priority)}>
          {priorityText(row.original.priority, row.original.priority)}
        </Badge>
      ),
    },
    { accessorKey: "assignee", header: t("tbl.assignee") },
    { accessorKey: "date", header: t("tbl.request_date") },
    {
      id: "actions",
      header: t("tbl.actions"),
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => router.push(`/repair/edit?id=${row.original.rawId || row.original.id}`)}
        >
          อัปเดตสถานะ
        </Button>
      ),
    },
  ];

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (default = เรียงเดิม)
  const layout = usePageLayout("/repair", ["hero", "kpi", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  // ตัวกรองเปลี่ยน → remount DataTable (reset sorting/pagination)
  const tableKey = `${search}|${statusFilter}|${priorityFilter}|${outsourceFilter}`;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "งานซ่อม", href: "/repair" }, { label: hero.title }]}
      title={hero.title}
      description={hero.desc}
      actions={
        <>
          <Button
            variant="secondary"
            disabled={pdfBuilding || selected.size === 0}
            onClick={handleBatchDownload}
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            {pdfBuilding ? (pdfProgress || t("action.building_pdf")) : selected.size > 0 ? `${t("action.download_pdf")} (${selected.size})` : t("action.download_pdf")}
          </Button>
          <Button
            variant="secondary"
            disabled={excelBuilding || filtered.length === 0}
            onClick={handleExportExcel}
            title={selected.size > 0 ? `ส่งออก ${selected.size} รายการที่เลือก` : "ส่งออกรายการที่กรองทั้งหมด"}
            className="border-transparent bg-[var(--cmms-success)] text-white hover:opacity-90"
          >
            <TableCellsIcon className="h-4 w-4" />
            {excelBuilding ? "กำลังสร้าง Excel..." : selected.size > 0 ? `ส่งออก F-EN-03 Excel (${selected.size})` : "ส่งออก F-EN-03 Excel"}
          </Button>
          <Button variant="ghost" onClick={fetchWO}>
            <ArrowPathIcon className="h-4 w-4" />{t("action.refresh")}
          </Button>
          <Button variant="primary" onClick={() => router.push("/repair/create")}>
            <PlusIcon className="h-4 w-4" />{t("action.create_wo")}
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" className="rounded-[var(--cmms-radius)] border border-[var(--cmms-danger)]/30 bg-[var(--cmms-danger-light)] p-4 text-sm text-[var(--cmms-text-primary)]">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="flex flex-col gap-6">
      {/* KPI — มินิบอร์ด Andon: กวาดตาเดียวรู้สถานะงาน */}
      <div style={layoutStyle("kpi")}>
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">งานซ่อมทั้งหมด</span>
              <AndonLamp status="idle" size="sm" />
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={stats.total} />
              <span className="cmms-kpi-unit">รายการ</span>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">รอดำเนินการ (Open)</span>
              <AndonLamp status="warn" size="sm" />
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={stats.open} />
              <span className="cmms-kpi-unit">รายการ</span>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">กำลังซ่อม (In Progress)</span>
              <AndonLamp status="warn" size="sm" />
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={stats.inprog} />
              <span className="cmms-kpi-unit">รายการ</span>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">เสร็จสิ้น (Completed)</span>
              <AndonLamp status="ok" size="sm" />
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={stats.done} />
              <span className="cmms-kpi-unit">รายการ</span>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setOutsourceFilter(prev => prev === "out" ? "all" : "out")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOutsourceFilter(prev => prev === "out" ? "all" : "out"); } }}
            title={outsourceFilter === "out" ? "ยกเลิกกรองงานภายนอก" : "กรองเฉพาะงานจ้างภายนอก"}
            style={{ cursor: "pointer" }}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">จ้างภายนอก (Outsource)</span>
                <AndonLamp status="warn" size="sm" />
              </div>
              <div className="cmms-kpi-value">
                <CountUp end={stats.outsourceCount} />
                <span className="cmms-kpi-unit">ใบ</span>
              </div>
              <p className="text-sm text-muted-foreground">
                ฿{stats.outsourceCost.toLocaleString("th-TH")}
              </p>
            </div>
          </div>
        </Card>
        {stats.overdue > 0 && (
          <Card className="p-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setStatusFilter(prev => prev === "overdue" ? "" : "overdue")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStatusFilter(prev => prev === "overdue" ? "" : "overdue"); } }}
              title={statusFilter === "overdue" ? "ยกเลิกกรองงานเกินกำหนด" : "กรองเฉพาะงานเกินกำหนด"}
              style={{ cursor: "pointer" }}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">เกินกำหนด</span>
                  <AndonLamp status="down" size="sm" />
                </div>
                <div className="cmms-kpi-value">
                  <CountUp end={stats.overdue} />
                  <span className="cmms-kpi-unit">รายการ</span>
                </div>
              </div>
            </div>
          </Card>
        )}
      </Grid>
      </div>

      <div style={layoutStyle("content")} className="space-y-6">
      {/* Filter Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-[var(--cmms-text-secondary)]">
              <input
                type="checkbox"
                aria-label={t("action.select_all_page")}
                checked={filtered.length > 0 && selected.size === filtered.length}
                onChange={toggleAll}
                className="h-4 w-4 cursor-pointer"
              />{t("action.select_all")}</label>
            {selected.size > 0 && (
              <Badge variant="primary">เลือก {selected.size} รายการ</Badge>
            )}
          </div>
          <Input
            label="ค้นหา"
            isLabelHidden
            placeholder="ค้นหาเลขงาน, เครื่องจักร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-56"
          />
          <Select
            value={statusFilter || ALL_STATUS}
            onValueChange={(v) => setStatusFilter(v === ALL_STATUS ? "" : v)}
          >
            <SelectTrigger aria-label="สถานะ" className="w-full sm:w-44">
              <SelectValue placeholder={t("action.filter_all_status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUS}>{t("action.filter_all_status")}</SelectItem>
              <SelectItem value="open">งานใหม่ (Open)</SelectItem>
              <SelectItem value="in_progress">กำลังซ่อม</SelectItem>
              <SelectItem value="overdue">เกินกำหนด (ไฟแดง)</SelectItem>
              <SelectItem value="completed">เสร็จสิ้น</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={priorityFilter || ALL_PRIORITY}
            onValueChange={(v) => setPriorityFilter(v === ALL_PRIORITY ? "" : v)}
          >
            <SelectTrigger aria-label="ความสำคัญ" className="w-full sm:w-44">
              <SelectValue placeholder={t("action.filter_all_priority")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PRIORITY}>{t("action.filter_all_priority")}</SelectItem>
              <SelectItem value="critical">วิกฤต (Critical)</SelectItem>
              <SelectItem value="high">ด่วน (High)</SelectItem>
              <SelectItem value="medium">ปกติ (Medium)</SelectItem>
              <SelectItem value="low">ต่ำ (Low)</SelectItem>
            </SelectContent>
          </Select>
          <div className="inline-flex items-center gap-1 rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-wash)] p-1">
            {([
              { v: "all", label: "ทั้งหมด" },
              { v: "in", label: "งานใน" },
              { v: "out", label: "งานภายนอก" },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setOutsourceFilter(opt.v)}
                className={cn(
                  "rounded-[var(--cmms-radius-sm)] px-3 py-1.5 text-xs font-semibold transition-colors duration-[var(--cmms-transition-fast)]",
                  outsourceFilter === opt.v
                    ? "bg-[var(--cmms-bg-card)] text-[var(--cmms-primary-hover)] shadow-[var(--cmms-shadow-sm)]"
                    : "text-[var(--cmms-text-secondary)] hover:text-[var(--cmms-text-primary)]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg cmms-icon-tile">
                <ClipboardDocumentListIcon className="h-4 w-4" />
              </div>
              <h3 className="text-base font-semibold">รายการงานซ่อม</h3>
              <span className="cmms-count-pill">{totalItems} รายการ</span>
            </div>
            {statusFilter && (
              <p className="text-sm text-muted-foreground">
                ตัวกรองสถานะ: {statusFilter === "open" ? "งานใหม่ (Open)" : statusFilter === "in_progress" ? "กำลังซ่อม" : statusFilter === "overdue" ? "เกินกำหนด" : "เสร็จสิ้น"}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <DataTable<WorkOrder>
            key={tableKey}
            columns={columns}
            data={filtered}
            loading={loading}
            skeletonRows={6}
            pageSize={10}
            caption="รายการงานซ่อม"
            emptyTitle="ไม่พบงานซ่อม"
            emptyDescription="ลองเปลี่ยนตัวกรองหรือสร้างใบสั่งงานใหม่"
          />
        </CardContent>
      </Card>
      </div>
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
    </PageShell>
  );
}
