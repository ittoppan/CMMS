"use client";

import { useState, useEffect, useRef } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  PrinterIcon,
  ArrowLeftIcon,
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import WorkOrderClosureDocument, { WorkOrderPart } from "../../../../components/WorkOrderClosureDocument";

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
  rootCause: string;
  solution: string;
  costParts: number;
  costLabor: number;
  downtimeMinutes: number;
}

export default function RepairViewDetailsPage() {
  const [woId, setWoId] = useState<string>("1");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [parts, setParts] = useState<WorkOrderPart[]>([]);
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
        <HStack hAlign="between" vAlign="center">
          <VStack gap={1}>
            <HStack gap={3} vAlign="center">
              <Heading level={2}>รายละเอียดใบส่งมอบงานปิดซ่อม</Heading>
              <Badge label={wo.workOrderNo} variant="info" />
              <Badge label="ซ่อมเสร็จสิ้น" variant="success" />
            </HStack>
            <Text type="body" color="secondary">
              เอกสารบันทึกรายละเอียดการซ่อม รูปเปรียบเทียบก่อน-หลังซ่อม และลายเซ็นผู้รับมอบงาน F-EN-03
            </Text>
          </VStack>

          <HStack gap={2}>
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
              label="🖨️ พิมพ์เอกสารปิดซ่อม"
              variant="primary"
              icon={<Icon icon={PrinterIcon} size="sm" />}
              onClick={handlePrint}
            />
          </HStack>
        </HStack>
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
            createdDate: wo.completedAt,
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
