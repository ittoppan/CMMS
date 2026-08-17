"use client";

import { useState, useEffect, useRef } from "react";
import { t, statusText, priorityText } from "@/lib/i18n";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  PrinterIcon,
  ArrowLeftIcon,
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
  UsersIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import WorkOrderClosureDocument, { WorkOrderPart } from "../../../../components/WorkOrderClosureDocument";
import AndonLamp from "@/components/AndonLamp";

interface PartRow {
  spare_part_id: number;
  code: string;
  name: string;
  quantity_used: number;
  unit_price: number;
}

interface WorkOrderDetail {
  id: number;
  workOrderNo: string;
  assetName: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedName: string;
  receiverName: string;
  beforeImg: string;
  afterImg: string;
  receiverSignature: string;
  completedAt: string;
  createdDate: string;
  rootCause: string;
  solution: string;
  costParts: number;
  costLabor: number;
  costOutsource: number;
  downtimeMinutes: number;
  spareApprovalStatus: string;
  spareApprovedBy: string;
  spareApprovedAt: string;
  contaminateChecking?: string;
  outsourceBy?: string;
  actualStartAt?: string;
  repairTimeMinutes?: number;
  team: { user_id: number; role: string; full_name: string; status?: string; accepted_at?: string }[];
}

interface Activity {
  id: number;
  action: string;
  description: string;
  user_name?: string;
  created_at: string;
}

// สถานะ → ไฟ Andon (เหมือนหน้า /repair): เขียวเสร็จ / เหลืองค้าง / แดงเกินกำหนด
const andonOf = (s: string): "ok" | "warn" | "down" | "idle" => {
  const v = String(s || "").toLowerCase();
  if (v === "completed" || v === "closed" || v === "resolved") return "ok";
  if (v === "in_progress" || v === "waiting_parts" || v === "pending_parts" || v === "acknowledged") return "warn";
  if (v === "overdue" || v === "rejected") return "down";
  return "idle";
};

const statusLabels: Record<string, string> = {
  completed: "เสร็จสิ้น", closed: "ปิดงาน", resolved: "แก้ไขแล้ว",
  in_progress: "กำลังซ่อม", waiting_parts: "รออะไหล่", pending_parts: "รออะไหล่", acknowledged: "รับงานแล้ว",
  open: "รอดำเนินการ", pending: "รอดำเนินการ", overdue: "เกินกำหนด", rejected: "ตีกลับ",
};
const statusLabel = (s: string) => statusText(s, s || "—");

// ผลตรวจการปนเปื้อน (เหมือนหน้า /repair + PDF F-EN-03)
const contamLabel: Record<string, string> = {
  not_checked: "ยังไม่ตรวจ",
  clean: "ไม่พบการปนเปื้อน (ผ่าน)",
  contaminated: "พบการปนเปื้อน",
  not_applicable: "ไม่เกี่ยวข้องกับงานนี้",
};
const contamTone = (v: string): "ok" | "warn" | "down" | "idle" => {
  const c = String(v || "").toLowerCase();
  if (c === "clean") return "ok";
  if (c === "contaminated") return "down";
  if (c === "not_applicable") return "idle";
  return "warn";
};

const priorityLabels: Record<string, string> = { critical: "วิกฤต", high: "สูง", medium: "ปานกลาง", low: "ต่ำ" };
const priorityLabel = (p: string) => priorityText(p, p || "—");
const priorityVariant = (p: string): "error" | "warning" | "info" | "neutral" => {
  const m: Record<string, "error" | "warning" | "info" | "neutral"> = {
    critical: "error", high: "warning", medium: "info", low: "neutral",
  };
  return m[String(p || "").toLowerCase()] || "neutral";
};

// ไทม์ไลน์: กิจกรรม → สีหลอดไฟ + ไอคอน
const toneColor = { ok: "var(--cmms-success)", warn: "var(--cmms-warning)", down: "var(--cmms-danger)", idle: "var(--cmms-text-secondary)" } as const;
const actionTone = (action: string): "ok" | "warn" | "down" | "idle" => {
  const a = String(action || "").toLowerCase();
  if (a.includes("closed") || a.includes("complete") || a.includes("resolve")) return "ok";
  if (a.includes("waiting_parts") || a.includes("pending_parts") || a.includes("reopen") || a.includes("assign")) return "warn";
  if (a.includes("overdue") || a.includes("reject")) return "down";
  return "idle";
};
const actionIcon = (action: string) => {
  const a = String(action || "").toLowerCase();
  if (a.includes("assign")) return UsersIcon;
  if (a.includes("closed") || a.includes("complete") || a.includes("resolve")) return CheckCircleIcon;
  if (a.includes("waiting_parts") || a.includes("pending_parts")) return ClockIcon;
  if (a.includes("status") || a.includes("move")) return ArrowPathIcon;
  if (a.includes("overdue") || a.includes("reject")) return ExclamationTriangleIcon;
  return InformationCircleIcon;
};

export default function RepairViewDetailsPage() {
  const [woId, setWoId] = useState<string>("1");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [parts, setParts] = useState<WorkOrderPart[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  // ── เบิกอะไหล่จากใบซ่อม (Feature: ใบเบิก + ตัดสต็อก) ──
  const [catalog, setCatalog] = useState<any[]>([]);
  const [partRows, setPartRows] = useState<PartRow[]>([]);
  const [newPartId, setNewPartId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [partsSaving, setPartsSaving] = useState(false);
  const [partsMsg, setPartsMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [deductStock, setDeductStock] = useState(true);
  const [wo, setWo] = useState<WorkOrderDetail>({
    id: 0,
    workOrderNo: "-",
    assetName: "-",
    title: "-",
    description: "-",
    status: "",
    priority: "",
    assignedName: "-",
    receiverName: "-",
    beforeImg: "",
    afterImg: "",
    receiverSignature: "",
    completedAt: "-",
    createdDate: "-",
    rootCause: "-",
    solution: "-",
    costParts: 0,
    costLabor: 0,
    costOutsource: 0,
    downtimeMinutes: 0,
    spareApprovalStatus: "none",
    spareApprovedBy: "",
    spareApprovedAt: "",
    team: []
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id") || "1";
    setWoId(idParam);

    fetch(`/api/v1/repair.php?id=${idParam}`)
      .then(res => res.json())
      .then(row => {
        if (row && row.id) {
          setWo({
            id: row.id,
            workOrderNo: row.work_order_no || `EN-${row.id}`,
            assetName: row.asset_name || "-",
            title: row.title || "-",
            description: row.description || row.failure_report || "-",
            status: row.status || "",
            priority: row.priority || "",
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
            spareApprovalStatus: String(row.spare_approval_status || "none"),
            spareApprovedBy: String(row.spare_approved_by || ""),
            spareApprovedAt: String(row.spare_approved_at || ""),
            contaminateChecking: String(row.contaminate_checking || "not_checked"),
            outsourceBy: String(row.outsource_by || ""),
            actualStartAt: String(row.actual_start_at || ""),
            repairTimeMinutes: Number(row.repair_time_minutes || 0),
            team: Array.isArray(row.team) ? row.team : []
          });
        }
      })
      .catch(e => console.error("Fetch WO error", e))
      .finally(() => setLoading(false));

    // อะไหล่ที่ใช้ซ่อม (สำหรับตารางในเอกสาร F-EN-03 + ใบเบิก)
    fetch(`/api/v1/repair.php?parts=1&id=${idParam}`)
      .then(res => res.json())
      .then(partsJson => {
        if (Array.isArray(partsJson)) {
          const mapped = partsJson.map((p: any) => ({
            code: p.code || "",
            name: p.name || "",
            quantity_used: Number(p.quantity_used) || 0,
            unit_price: Number(p.unit_price) || 0,
          }));
          setParts(mapped);
          setPartRows(partsJson.map((p: any) => ({
            spare_part_id: Number(p.spare_part_id) || 0,
            code: p.code || "",
            name: p.name || "",
            quantity_used: Number(p.quantity_used) || 0,
            unit_price: Number(p.unit_price) || 0,
          })));
        }
      })
      .catch(e => console.error("Fetch WO parts error", e));

    // รายการอะไหล่ในคลัง (สำหรับเลือกเบิก)
    fetch("/api/v1/spare_parts.php", { headers: { "ngrok-skip-browser-warning": "1" } })
      .then(res => res.json())
      .then((list: any[]) => { if (Array.isArray(list)) setCatalog(list); })
      .catch(e => console.error("Fetch spare catalog error", e));

    // ตรวจว่าตัดสต็อกอัตโนมัติเปิดอยู่หรือไม่
    fetch("/api/v1/settings.php", { headers: { "ngrok-skip-browser-warning": "1" } })
      .then(res => res.json())
      .then((rows: any[]) => {
        if (Array.isArray(rows)) {
          const row = rows.find((x) => x.setting_key === "spare_deduct_stock");
          if (row) setDeductStock(String(row.setting_value) === "1");
        }
      })
      .catch(() => { /* default true */ });

    // ไทม์ไลน์การซ่อม (repair_activity_log)
    fetch(`/api/v1/repair.php?activity=1&id=${idParam}`)
      .then(res => res.json())
      .then((list: any[]) => { if (Array.isArray(list)) setActivity(list); })
      .catch(e => console.error("Fetch WO activity error", e));
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pw) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(img, "PNG", 0, position, pw, imgHeight);
      heightLeft -= ph;
      while (heightLeft > 0) {
        position -= ph;
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, position, pw, imgHeight);
        heightLeft -= ph;
      }
      // เปิดหน้าต่างดูตัวอย่างก่อนดาวน์โหลด (สร้าง blob URL สำหรับแสดงใน iframe)
      pdfRef.current = pdf;
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (e) {
      console.error("PDF generation failed:", e);
      alert('ไม่สามารถสร้าง PDF ได้ในเบราว์เซอร์นี้ — กรุณาใช้ปุ่ม "พิมพ์เอกสารปิดซ่อม" แล้วเลือก "บันทึกเป็น PDF"');
    }
    setDownloading(false);
  };

  const handleSavePdf = () => {
    if (pdfRef.current) {
      pdfRef.current.save(`F-EN-03-${wo.workOrderNo}.pdf`);
    }
  };

  const handleClosePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    pdfRef.current = null;
  };

  // ── เบิกอะไหล่จากใบซ่อม ──
  const addPart = () => {
    const spId = Number(newPartId);
    if (!spId) { setPartsMsg({ kind: "err", text: "กรุณาเลือกอะไหล่ก่อนเพิ่ม" }); return; }
    const qty = Math.max(1, Number(newQty) || 1);
    const sp = catalog.find((c) => Number(c.id) === spId);
    if (!sp) return;
    const existing = partRows.find((r) => r.spare_part_id === spId);
    if (existing) {
      setPartRows(partRows.map((r) => (r.spare_part_id === spId ? { ...r, quantity_used: r.quantity_used + qty } : r)));
    } else {
      setPartRows([...partRows, {
        spare_part_id: spId,
        code: sp.code || "",
        name: sp.name || "",
        quantity_used: qty,
        unit_price: Number(sp.unit_price) || 0,
      }]);
    }
    setNewPartId("");
    setNewQty("1");
    setPartsMsg(null);
  };

  const removePart = (spId: number) => setPartRows(partRows.filter((r) => r.spare_part_id !== spId));

  const saveParts = async () => {
    setPartsSaving(true);
    setPartsMsg(null);
    try {
      const res = await fetch(`/api/v1/repair.php?id=${woId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spare_parts: partRows.map((r) => ({ spare_part_id: r.spare_part_id, quantity_used: r.quantity_used, unit_price: r.unit_price })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setParts(partRows.map((r) => ({ code: r.code, name: r.name, quantity_used: r.quantity_used, unit_price: r.unit_price })));
        setPartsMsg({ kind: "ok", text: deductStock ? "บันทึกรายการอะไหล่แล้ว — สต็อกถูกตัดอัตโนมัติแล้ว" : "บันทึกรายการอะไหล่แล้ว (ไม่ตัดสต็อก — ปิดการตั้งค่า spare_deduct_stock)" });
      } else {
        setPartsMsg({ kind: "err", text: json.error || "บันทึกรายการอะไหล่ไม่สำเร็จ" });
      }
    } catch (e) {
      console.error(e);
      setPartsMsg({ kind: "err", text: "ไม่สามารถบันทึกรายการอะไหล่ได้ (เน็ตหลุด?) — ลองอีกครั้ง" });
    }
    setPartsSaving(false);
  };

  const partsTotal = partRows.reduce((a, r) => a + r.quantity_used * r.unit_price, 0);

  return (
    <VStack gap={6}>
      {/* Header (Hidden on Print) */}
      <div className="no-print">
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3} className="mb-5">
          <VStack gap={1}>
            <Text type="body" size="sm" className="cmms-eyebrow">
              Work Order Detail · CMMS-TOPPAN
            </Text>
            <Heading level={2}>ใบสั่งงานซ่อม</Heading>
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button
              label="กลับ"
              variant="secondary"
              icon={<Icon icon={ArrowLeftIcon} size="sm" />}
              onClick={() => (window.location.href = "/repair/tracking")}
            />
            <Button
              label={downloading ? t("action.building_pdf") : t("action.download_pdf_fen03")}
              variant="secondary"
              icon={<Icon icon={DocumentArrowDownIcon} size="sm" />}
              isDisabled={downloading}
              onClick={handleDownloadPdf}
            />
            <Button
              label={t("action.print_closure_doc")}
              variant="primary"
              icon={<Icon icon={PrinterIcon} size="sm" />}
              onClick={handlePrint}
            />
          </HStack>
        </HStack>

        {/* ── แถบสถานะ Andon (ticket header) — ข้อมูลงาน + สถานะกวาดตาเดียว ── */}
        <div className="cmms-andon-board mb-6">
          <div className="relative z-10">
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
              <HStack gap={4} vAlign="center" wrap="wrap">
                <AndonLamp status={andonOf(wo.status)} size="lg" />
                <VStack gap={1}>
                  <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
                    {statusLabel(wo.status)}
                  </Text>
                  <div className="cmms-display" style={{ fontSize: "2.1rem", lineHeight: 1, color: "#FFFFFF" }}>
                    {wo.workOrderNo}
                  </div>
                  <Text type="body" style={{ color: "rgba(255,255,255,0.88)", fontWeight: 600 }}>
                    {wo.title}
                  </Text>
                  <Text type="body" size="sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                    {wo.assetName}
                  </Text>
                </VStack>
              </HStack>
              <VStack gap={2} hAlign="end">
                <Badge label={`ความเร่งด่วน: ${priorityLabel(wo.priority)}`} variant={priorityVariant(wo.priority)} />
              </VStack>
            </HStack>

            {/* ข้อเท็จจริงของใบงาน */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
              {([
                { label: "ผู้แจ้ง", value: wo.receiverName },
                { label: "ผู้รับผิดชอบ", value: wo.assignedName },
                { label: "วันที่แจ้ง", value: wo.createdDate },
                { label: "วันที่ปิด", value: wo.completedAt },
                { label: "Downtime", value: wo.downtimeMinutes ? `${wo.downtimeMinutes} นาที` : "—" },
                { label: "ค่าใช้จ่ายรวม", value: `฿${(wo.costParts + wo.costLabor + wo.costOutsource).toLocaleString()}` },
                { label: "ผลตรวจการปนเปื้อน", value: contamLabel[wo.contaminateChecking || "not_checked"] ?? "ยังไม่ตรวจ", tone: contamTone(wo.contaminateChecking || "") },
                { label: "ผู้รับเหมาภายนอก", value: wo.outsourceBy || "—", tone: wo.outsourceBy ? "warn" : "idle" },
              ] as { label: string; value: string; tone?: "ok" | "warn" | "down" | "idle" }[]).map((f) => (
                <div
                  key={f.label}
                  className="cmms-andon-tile"
                  style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.66rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {f.label}
                  </span>
                  <span className="cmms-andon-tile-name" style={{ fontSize: "0.95rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {f.tone && (
                      <span className={`cmms-status-dot ${f.tone}`} style={{ display: "inline-block", width: 8, height: 8, flexShrink: 0 }} />
                    )}
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ทีมซ่อม (ผู้รับผิดชอบหลายคน) ── */}
        <Card elevation="low" padding={5} className="mb-6">
          <VStack gap={3}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <VStack gap={0}>
                <Heading level={4}>ทีมซ่อม</Heading>
                <Text type="body" size="sm" color="secondary">ผู้รับผิดชอบหลัก (หัวหน้าชุด) + สมาชิกในทีม — ใครในทีมก็ปิดงานได้</Text>
              </VStack>
              {wo.team.length > 0 && (
                <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)", fontSize: "0.7rem", padding: "3px 9px" }}>
                  {wo.team.length} คน
                </span>
              )}
            </HStack>
            {wo.team.length === 0 ? (
              <Text type="body" color="secondary">ยังไม่มีการมอบหมายทีมซ่อม — ไปที่หน้า "แจกงานซ่อม" เพื่อเลือกทีม</Text>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {wo.team.map((m) => (
                  <div
                    key={m.user_id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--cmms-border)", background: m.role === "lead" ? "var(--cmms-primary-wash)" : "var(--cmms-bg-card)" }}
                  >
                    <div
                      style={{ width: 32, height: 32, borderRadius: "50%", background: m.role === "lead" ? "var(--cmms-primary)" : "var(--cmms-bg-muted)", color: m.role === "lead" ? "#fff" : "var(--cmms-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}
                    >
                      {(m.full_name || "?").charAt(0)}
                    </div>
                    <VStack gap={1}>
                      <Text type="body" size="sm" weight="bold">{m.full_name || "-"}</Text>
                      <Text type="body" color="secondary" style={{ fontSize: 11 }}>
                        {m.role === "lead" ? "หัวหน้าชุด" : "สมาชิกทีม"}
                      </Text>
                      {m.status === "accepted" ? (
                        <HStack gap={1} vAlign="center">
                          <span className="cmms-status-dot ok" style={{ display: "inline-block", width: 7, height: 7 }} />
                          <Text type="body" size="sm" weight="semibold" style={{ color: "var(--cmms-success)", fontSize: 11 }}>
                            รับงานแล้ว{m.accepted_at ? ` · ${String(m.accepted_at).slice(11, 16)} น.` : ""}
                          </Text>
                        </HStack>
                      ) : (
                        <HStack gap={1} vAlign="center">
                          <span className="cmms-status-dot warn" style={{ display: "inline-block", width: 7, height: 7 }} />
                          <Text type="body" size="sm" color="secondary" style={{ fontSize: 11 }}>
                            ยังไม่รับงาน
                          </Text>
                        </HStack>
                      )}
                    </VStack>
                  </div>
                ))}
              </div>
            )}
          </VStack>
        </Card>

        {/* ── ไทม์ไลน์การซ่อม (จาก repair_activity_log) ── */}
        <Card elevation="low" padding={6} className="mb-6">
          <VStack gap={4}>
            <HStack hAlign="between" vAlign="center">
              <Heading level={4} className="flex items-center gap-2">
                <span className="cmms-status-dot ok" style={{ display: "inline-block" }} />
                ไทม์ไลน์การซ่อม
              </Heading>
              <Text type="body" size="sm" color="secondary">{activity.length} เหตุการณ์</Text>
            </HStack>
            {activity.length === 0 ? (
              <Text type="body" size="sm" color="secondary">
                ยังไม่มีประวัติการซ่อมสำหรับงานนี้
              </Text>
            ) : (
              <div className="relative pl-8 space-y-5 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--cmms-border)]">
                {activity.map((a) => {
                  const tone = actionTone(a.action);
                  const IconCmp = actionIcon(a.action);
                  return (
                    <div key={a.id} className="relative flex items-start gap-3">
                      <div
                        className="absolute -left-8 top-0.5 w-[22px] h-[22px] rounded-full border-2 border-white flex items-center justify-center shrink-0"
                        style={{ background: `${toneColor[tone]}1A`, color: toneColor[tone] }}
                      >
                        <IconCmp className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <Text type="body" weight="bold" style={{ fontSize: 13 }} className="truncate">
                            {a.description || a.action}
                          </Text>
                          <Text type="body" size="sm" color="secondary" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                            {a.created_at}
                          </Text>
                        </div>
                        <Text type="body" size="sm" color="secondary">
                          {a.user_name || "ระบบ"}
                        </Text>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </VStack>
        </Card>

        {/* ── เบิกอะไหล่ที่ใช้ซ่อม (ใบเบิก + ตัดสต็อก) ── */}
        <Card elevation="low" padding={6} className="mb-6">
          <VStack gap={4}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
              <VStack gap={1}>
                <Text type="body" size="sm" className="cmms-eyebrow">SPARE PARTS USED · F-EN-03</Text>
                <Heading level={4}>อะไหล่ที่ใช้ซ่อม (ใบเบิก)</Heading>
              </VStack>
              <HStack gap={2} vAlign="center" wrap="wrap">
                {wo.spareApprovalStatus === "approved" && (
                  <span style={{ background: "var(--cmms-success-light, #D1FAE5)", color: "var(--cmms-success, #059669)", padding: "4px 10px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 700 }}>
                    ✅ อนุมัติแล้ว{wo.spareApprovedBy ? ` โดย ${wo.spareApprovedBy}` : ""}{wo.spareApprovedAt ? ` · ${String(wo.spareApprovedAt).slice(0, 10)}` : ""}
                  </span>
                )}
                {wo.spareApprovalStatus === "rejected" && (
                  <span style={{ background: "var(--cmms-danger-light, #FEE2E2)", color: "var(--cmms-danger, #DC2626)", padding: "4px 10px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 700 }}>
                    ❌ ไม่อนุมัติ{wo.spareApprovedBy ? ` โดย ${wo.spareApprovedBy}` : ""}{wo.spareApprovedAt ? ` · ${String(wo.spareApprovedAt).slice(0, 10)}` : ""}
                  </span>
                )}
                {wo.spareApprovalStatus === "pending" && (
                  <span style={{ background: "var(--cmms-warning-light, #FEF3C7)",                    color: "var(--cmms-warning-dark)", padding: "4px 10px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 700 }}>
                    ⏳ รอหัวหน้าอนุมัติ (กดปุ่มใน LINE)
                  </span>
                )}
                <Text type="body" size="sm" color="secondary">รวม {partsTotal.toLocaleString()} บาท · {deductStock ? "ตัดสต็อกอัตโนมัติ" : "ไม่ตัดสต็อก (ปิดการตั้งค่า)"}</Text>
              </HStack>
            </HStack>

            {partsMsg && (
              <div
                style={{
                  padding: "10px 14px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600,
                  background: partsMsg.kind === "ok" ? "var(--cmms-success-light, #D1FAE5)" : "var(--cmms-danger-light, #FEE2E2)",
                  color: partsMsg.kind === "ok" ? "var(--cmms-success, #059669)" : "var(--cmms-danger, #DC2626)",
                }}
              >
                {partsMsg.text}
              </div>
            )}

            {/* รายการที่เลือกแล้ว */}
            {partRows.length === 0 ? (
              <Text type="body" size="sm" color="secondary">ยังไม่มีอะไหล่ในใบเบิก — เลือกจากคลังด้านล่าง</Text>
            ) : (
              <div style={{ border: "1px solid var(--cmms-border)", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--cmms-bg-wash)", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px" }}>รหัส</th>
                      <th style={{ padding: "8px 12px" }}>ชื่ออะไหล่</th>
                      <th style={{ padding: "8px 12px" }}>จำนวน</th>
                      <th style={{ padding: "8px 12px" }}>ราคา/หน่วย</th>
                      <th style={{ padding: "8px 12px" }}>รวม</th>
                      <th style={{ padding: "8px 12px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {partRows.map((r) => (
                      <tr key={r.spare_part_id} style={{ borderTop: "1px solid var(--cmms-border)" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.code}</td>
                        <td style={{ padding: "8px 12px" }}>{r.name}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="number"
                            min={1}
                            value={r.quantity_used}
                            onChange={(e) =>
                              setPartRows(partRows.map((x) => (x.spare_part_id === r.spare_part_id ? { ...x, quantity_used: Math.max(1, Number(e.target.value) || 1) } : x)))
                            }
                            style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--cmms-border)", fontSize: "0.85rem" }}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>{(r.unit_price || 0).toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{(r.quantity_used * (r.unit_price || 0)).toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          <button
                            onClick={() => removePart(r.spare_part_id)}
                            style={{ color: "var(--cmms-danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}
                          >{t("action.delete")}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* เพิ่มอะไหล่จากคลัง */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={newPartId}
                onChange={(e) => setNewPartId(e.target.value)}
                style={{ flex: 1, minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--cmms-border)", background: "var(--cmms-bg-wash)", fontSize: "0.85rem" }}
              >
                <option value="">— เลือกอะไหล่จากคลัง —</option>
                {catalog.map((sp) => (
                  <option key={sp.id} value={String(sp.id)}>
                    {sp.code} — {sp.name} (คงเหลือ {Number(sp.stock_qty ?? 0)})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                style={{ width: 80, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--cmms-border)", fontSize: "0.85rem" }}
                aria-label="จำนวนที่เบิก"
              />
              <Button label="เพิ่ม" variant="secondary" onClick={addPart} />
            </div>

            <HStack hAlign="end">
              <Button label={partsSaving ? "กำลังบันทึก..." : "บันทึกรายการอะไหล่"} variant="primary" onClick={saveParts} isDisabled={partsSaving || partRows.length === 0} />
            </HStack>
          </VStack>
        </Card>
      </div>

      {/* Main Closure Document Sheet */}
      <div ref={reportRef} style={{ background: "#FFFFFF" }}>
        <WorkOrderClosureDocument
          wo={{
            id: wo.id,
            workOrderNo: wo.workOrderNo,
            assetName: wo.assetName,
            title: wo.title,
            description: wo.description,
            status: wo.status,
            priority: wo.priority,
            assignedName: wo.assignedName,
            receiverName: wo.receiverName,
            beforeImg: wo.beforeImg,
            afterImg: wo.afterImg,
            receiverSignature: wo.receiverSignature,
            completedAt: wo.completedAt,
            createdDate: wo.createdDate,
            rootCause: wo.rootCause,
            solution: wo.solution,
            costParts: wo.costParts,
            costLabor: wo.costLabor,
            costOutsource: wo.costOutsource || 0,
            downtimeMinutes: wo.downtimeMinutes,
            contaminateChecking: wo.contaminateChecking,
            outsourceBy: wo.outsourceBy,
            actualStartAt: wo.actualStartAt,
            repairTimeMinutes: wo.repairTimeMinutes,
            parts,
          }}
        />
      </div>

      {/* Print Stylesheet */}
      <style jsx global>{`
        @media print {
          .no-print, header, aside, nav, #sidebar {
            display: none !important;
          }
          body, main {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* PDF Preview Dialog */}
      <Dialog
        isOpen={!!previewUrl}
        onOpenChange={(open: boolean) => { if (!open) handleClosePreview(); }}
      >
        <DialogHeader title={`ดูตัวอย่าง PDF — ${wo.workOrderNo}`} onOpenChange={() => handleClosePreview()} />
        <div style={{ padding: 16 }}>
          {previewUrl && (
            <iframe
              src={previewUrl}
              title={`PDF Preview ${wo.workOrderNo}`}
              style={{ width: "100%", height: "68vh", border: "1px solid var(--cmms-border)", borderRadius: 8, background: "#FFFFFF" }}
            />
          )}
          <HStack hAlign="end" gap={2} style={{ marginTop: 14 }}>
            <Button label="ปิด" variant="secondary" onClick={handleClosePreview} />
            <Button
              label="ดาวน์โหลดไฟล์ PDF"
              variant="primary"
              icon={<Icon icon={ArrowDownTrayIcon} size="sm" />}
              onClick={handleSavePdf}
            />
          </HStack>
        </div>
      </Dialog>
    </VStack>
  );
}
