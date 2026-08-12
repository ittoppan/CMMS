"use client";

import { useState, useEffect, useRef } from "react";
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
  downtimeMinutes: number;
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
const statusLabel = (s: string) => statusLabels[String(s || "").toLowerCase()] || s || "—";

const priorityLabels: Record<string, string> = { critical: "วิกฤต", high: "สูง", medium: "ปานกลาง", low: "ต่ำ" };
const priorityLabel = (p: string) => priorityLabels[String(p || "").toLowerCase()] || p || "—";
const priorityVariant = (p: string): "error" | "warning" | "info" | "neutral" => {
  const m: Record<string, "error" | "warning" | "info" | "neutral"> = {
    critical: "error", high: "warning", medium: "info", low: "neutral",
  };
  return m[String(p || "").toLowerCase()] || "neutral";
};

// ไทม์ไลน์: กิจกรรม → สีหลอดไฟ + ไอคอน
const toneColor = { ok: "#10B981", warn: "#F59E0B", down: "#EF4444", idle: "#64748B" } as const;
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
    downtimeMinutes: 0
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
            downtimeMinutes: Number(row.downtime_minutes || 0)
          });
        }
      })
      .catch(e => console.error("Fetch WO error", e))
      .finally(() => setLoading(false));

    // อะไหล่ที่ใช้ซ่อม (สำหรับตารางในเอกสาร F-EN-03)
    fetch(`/api/v1/repair.php?parts=1&id=${idParam}`)
      .then(res => res.json())
      .then(partsJson => {
        if (Array.isArray(partsJson)) {
          setParts(partsJson.map((p: any) => ({
            code: p.code || "",
            name: p.name || "",
            quantity_used: Number(p.quantity_used) || 0,
            unit_price: Number(p.unit_price) || 0,
          })));
        }
      })
      .catch(e => console.error("Fetch WO parts error", e));

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
              label={downloading ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF (F-EN-03)"}
              variant="secondary"
              icon={<Icon icon={DocumentArrowDownIcon} size="sm" />}
              isDisabled={downloading}
              onClick={handleDownloadPdf}
            />
            <Button
              label="พิมพ์เอกสารปิดซ่อม"
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
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mt-5">
              {[
                { label: "ผู้แจ้ง", value: wo.receiverName },
                { label: "ผู้รับผิดชอบ", value: wo.assignedName },
                { label: "วันที่แจ้ง", value: wo.createdDate },
                { label: "วันที่ปิด", value: wo.completedAt },
                { label: "Downtime", value: wo.downtimeMinutes ? `${wo.downtimeMinutes} นาที` : "—" },
                { label: "ค่าใช้จ่ายรวม", value: `฿${(wo.costParts + wo.costLabor).toLocaleString()}` },
              ].map((f) => (
                <div
                  key={f.label}
                  className="cmms-andon-tile"
                  style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.66rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {f.label}
                  </span>
                  <span className="cmms-andon-tile-name" style={{ fontSize: "0.95rem" }}>
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

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
            costOutsource: 0,
            downtimeMinutes: wo.downtimeMinutes,
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
              style={{ width: "100%", height: "68vh", border: "1px solid #CBD5E1", borderRadius: 8, background: "#FFFFFF" }}
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
