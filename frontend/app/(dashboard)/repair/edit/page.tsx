"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Home,
  ChevronRight,
  Wrench,
  FileText,
  Clock,
  Camera,
  X,
  Save,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import SuccessDialog from "@/components/SuccessDialog";

/* ============================================================
   หน้าแก้ไขงานซ่อม F-EN-03 — ช่างเป็นคนกรอกข้อมูล
   ส่วนที่ช่างกรอก:
   - Root Cause (สาเหตุของปัญหา)
   - Maintenance Description (รายละเอียดการซ่อม)
   - Maintenance Note (บันทึกการซ่อม)
   - MTN. Action (การดำเนินการ)
   - Contaminate Checking (ตรวจสอบการปนเปื้อน)
   - Spare Parts (อะไหล่ที่เปลี่ยน)
   - Start/Finish Date/Time
   - Downtime
   - Cost
   - After Image (รูปหลังซ่อม)
   ============================================================ */

interface RepairData {
  id: number;
  work_order_no: string;
  asset_name: string;
  asset_code: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_name: string;
  receiver_name: string;
  root_cause: string;
  solution: string;
  resolution: string;
  notes: string;
  diagnosis: string;
  contaminate_checking: string;
  outsource_by: string;
  downtime_start: string;
  downtime_end: string;
  downtime_minutes: number;
  cost_parts: number;
  cost_labor: number;
  cost_outsource: number;
  before_image_path: string;
  after_image_path: string;
  actual_start_at: string;
  completed_at: string;
  machine_status: string;
  product_lot_no: string;
}

function EditWorkOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const woId = searchParams.get("id");
  const afterImageRef = useRef<HTMLInputElement>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [woData, setWoData] = useState<RepairData | null>(null);

  // Technician fields
  const [rootCause, setRootCause] = useState("");
  const [maintenanceDesc, setMaintenanceDesc] = useState("");
  const [maintenanceNote, setMaintenanceNote] = useState("");
  const [mtnAction, setMtnAction] = useState("");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("medium");
  const [contaminateChecking, setContaminateChecking] = useState("not_checked");
  const [outsourceBy, setOutsourceBy] = useState("");
  const [downtimeStart, setDowntimeStart] = useState("");
  const [downtimeEnd, setDowntimeEnd] = useState("");
  const [downtimeMinutes, setDowntimeMinutes] = useState(0);
  const [costParts, setCostParts] = useState(0);
  const [costLabor, setCostLabor] = useState(0);
  const [afterImages, setAfterImages] = useState<string[]>([]);
  const [actualStartAt, setActualStartAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");

  useEffect(() => {
    if (!woId) {
      setError("ไม่ระบุหมายเลขใบแจ้งซ่อม");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/repair.php?id=${woId}`)
      .then((res) => res.json())
      .then((json: RepairData) => {
        if (json && !(json as any).error) {
          setWoData(json);
          setRootCause(json.root_cause || "");
          setMaintenanceDesc(json.solution || json.resolution || "");
          setMaintenanceNote(json.notes || "");
          setMtnAction(json.diagnosis || "");
          setStatus(json.status || "open");
          setPriority(json.priority || "medium");
          setContaminateChecking(json.contaminate_checking || "not_checked");
          setOutsourceBy(json.outsource_by || "");
          setDowntimeStart(json.downtime_start || "");
          setDowntimeEnd(json.downtime_end || "");
          setDowntimeMinutes(json.downtime_minutes || 0);
          setCostParts(json.cost_parts || 0);
          setCostLabor(json.cost_labor || 0);
          setActualStartAt(json.actual_start_at || "");
          setCompletedAt(json.completed_at || "");
          if (json.after_image_path) {
            setAfterImages(json.after_image_path.split("|").filter(Boolean));
          }
        } else {
          setError("ไม่พบข้อมูลใบแจ้งซ่อม");
        }
      })
      .catch(() => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [woId]);

  // Resize image
  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("no ctx")); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = () => reject(new Error("img load failed"));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error("file read failed"));
      reader.readAsDataURL(file);
    });
  };

  const addAfterImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = [...afterImages];
    for (const f of Array.from(files).slice(0, 5 - next.length)) {
      try {
        const uri = await resizeImage(f);
        next.push(uri);
      } catch { /* skip */ }
    }
    setAfterImages(next);
  };

  const handleSubmit = async () => {
    if (!rootCause.trim()) {
      setError("กรุณาระบุสาเหตุของปัญหา (Root Cause)");
      return;
    }
    if (!maintenanceDesc.trim()) {
      setError("กรุณาระบุรายละเอียดการซ่อม");
      return;
    }
    if (status === "completed" && contaminateChecking === "not_checked") {
      setError("ต้องระบุผลตรวจการปนเปื้อนก่อนปิดงาน");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        root_cause: rootCause,
        solution: maintenanceDesc,
        notes: maintenanceNote,
        diagnosis: mtnAction,
        status,
        priority,
        contaminate_checking: contaminateChecking,
        outsource_by: outsourceBy || null,
        downtime_start: downtimeStart || null,
        downtime_end: downtimeEnd || null,
        downtime_minutes: downtimeMinutes || null,
        cost_parts: costParts || 0,
        cost_labor: costLabor || 0,
        actual_start_at: actualStartAt || null,
        completed_at: status === "completed" ? (completedAt || new Date().toISOString().slice(0, 19).replace("T", " ")) : completedAt || null,
        after_image_path: afterImages.length > 0 ? afterImages.join("|") : null,
      };

      const res = await fetch(`/api/v1/repair.php?id=${woId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="บันทึกข้อมูลซ่อมสำเร็จ!"
        message={<>ใบแจ้งซ่อมเลขที่ <strong>{woData?.work_order_no || woId}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้ารวมใบแจ้งซ่อม"
        onPrimary={() => router.push("/repair")}
        onBackdrop={() => router.push("/repair")}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/repair" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
          <Home className="w-4 h-4" />
          <span>ใบแจ้งซ่อม</span>
        </Link>
        <ChevronRight className="w-4 h-4 text-slate-400" />
        <span className="font-medium text-slate-900 dark:text-slate-100" aria-current="page">
          บันทึกข้อมูลซ่อม
        </span>
      </nav>

      {/* Page Header */}
      <div>
        <p className="cmms-eyebrow">F-EN-03 · MAINTAIN RECORD</p>
        <PageHeader
          title={woData?.work_order_no ? `${woData.work_order_no} — ${woData.asset_name || woData.asset_code || ""}` : `WO-${woId}`}
          description="กรอกข้อมูลสาเหตุ ผลการซ่อม เวลาหยุดเครื่อง และค่าใช้จ่ายในการซ่อม"
        />
      </div>

      {loadingData ? (
        <div className="flex items-center justify-center gap-3 p-12 text-slate-500">
          <Spinner size={24} />
          <span>กำลังโหลดข้อมูล...</span>
        </div>
      ) : (
        <div className="space-y-6 max-w-3xl">
          {error && (
            <Alert variant="danger" title="ข้อผิดพลาด">
              {error}
            </Alert>
          )}

          {/* ── ส่วนที่ 1: สรุปข้อมูลจากผู้แจ้ง (อ่านอย่างเดียว) ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <span>ข้อมูลจากผู้แจ้ง</span>
                <span className="text-xs font-normal text-slate-400">(อ่านอย่างเดียว)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <InfoRow label="ผู้แจ้ง" value={woData?.receiver_name || "-"} />
                <InfoRow label="เครื่องจักร" value={`${woData?.asset_code || "-"} ${woData?.asset_name || ""}`} />
                <InfoRow label="สถานะเครื่อง" value={woData?.machine_status || "-"} />
                <InfoRow label="อาการเสีย" value={woData?.title || "-"} />
                <InfoRow label="รายละเอียดปัญหา" value={woData?.description || "-"} />
                <InfoRow label="Lot No." value={woData?.product_lot_no || "-"} />
              </div>
            </CardContent>
          </Card>

          {/* ── ส่วนที่ 2: ข้อมูลช่างกรอก ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <span>ข้อมูลซ่อม (ช่างกรอก)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Status + Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="สถานะงาน (Job Status) *"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="open">เปิดงาน / รอดำเนินการ</option>
                  <option value="in_progress">กำลังซ่อม</option>
                  <option value="waiting_parts">รออะไหล่</option>
                  <option value="completed">ซ่อมเสร็จแล้ว</option>
                  <option value="cancelled">ยกเลิก</option>
                </Select>

                <Select
                  label="ความสำคัญ (Priority) *"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="critical">วิกฤต (Critical)</option>
                  <option value="high">ด่วน (High)</option>
                  <option value="medium">ปานกลาง (Medium)</option>
                  <option value="low">ต่ำ (Low)</option>
                </Select>
              </div>

              {/* Root Cause */}
              <Textarea
                label="Root Cause (สาเหตุของปัญหา) *"
                placeholder="ระบุสาเหตุของปัญหา เช่น สึกหรอตามอายุการใช้งาน, ไม่ได้ทำความสะอาด, อะไหล่เสื่อมสภาพ..."
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                rows={3}
              />

              {/* Maintenance Description */}
              <Textarea
                label="Maintenance Description (รายละเอียดการซ่อม) *"
                placeholder="อธิบายว่าทำอะไรบ้าง เช่น เปลี่ยน bearing, ปรับตั้ง tension, ทำความสะอาด..."
                value={maintenanceDesc}
                onChange={(e) => setMaintenanceDesc(e.target.value)}
                rows={3}
              />

              {/* Maintenance Note */}
              <Textarea
                label="Maintenance Note (บันทึกการซ่อม)"
                placeholder="บันทึกข้อมูลเพิ่มเติม เช่น ข้อควรระวัง, ควรตรวจสอบอีกครั้ง..."
                value={maintenanceNote}
                onChange={(e) => setMaintenanceNote(e.target.value)}
                rows={2}
              />

              {/* MTN. Action */}
              <Textarea
                label="MTN. Action (การดำเนินการ)"
                placeholder="ระบุการดำเนินการที่ทำ เช่น ซ่อมแซม, ปรับเปลี่ยน, ทดสอบ..."
                value={mtnAction}
                onChange={(e) => setMtnAction(e.target.value)}
                rows={2}
              />

              {/* Contaminate Checking */}
              <Select
                label="Contaminate Checking (ตรวจสอบการปนเปื้อน) *"
                value={contaminateChecking}
                onChange={(e) => setContaminateChecking(e.target.value)}
              >
                <option value="not_checked">ยังไม่ตรวจ</option>
                <option value="clean">ไม่พบการปนเปื้อน (ผ่าน)</option>
                <option value="contaminated">พบการปนเปื้อน</option>
                <option value="not_applicable">ไม่เกี่ยวข้องกับงานนี้</option>
              </Select>

              {/* Outsource By */}
              <Input
                label="Outsource By (ภายนอก โดย)"
                placeholder="ระบุชื่อบริษัท/ผู้รับเหมาภายนอก (ถ้ามี)"
                value={outsourceBy}
                onChange={(e) => setOutsourceBy(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* ── ส่วนที่ 3: เวลาและค่าใช้จ่าย ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <span>เวลาและค่าใช้จ่าย</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  type="datetime-local"
                  label="Start Date/Time (วันที่เริ่มซ่อม)"
                  value={downtimeStart ? downtimeStart.slice(0, 16) : ""}
                  onChange={(e) =>
                    setDowntimeStart(e.target.value ? e.target.value.replace("T", " ") + ":00" : "")
                  }
                />
                <Input
                  type="datetime-local"
                  label="Finish Date/Time (วันที่เสร็จซ่อม)"
                  value={downtimeEnd ? downtimeEnd.slice(0, 16) : ""}
                  onChange={(e) =>
                    setDowntimeEnd(e.target.value ? e.target.value.replace("T", " ") + ":00" : "")
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  type="number"
                  label="BD. Time (เวลาหยุดเครื่อง — นาที)"
                  value={downtimeMinutes || ""}
                  onChange={(e) => setDowntimeMinutes(Number(e.target.value) || 0)}
                />
                <Input
                  type="number"
                  label="Cost Parts (ค่าอะไหล่ — บาท)"
                  value={costParts || ""}
                  onChange={(e) => setCostParts(Number(e.target.value) || 0)}
                />
                <Input
                  type="number"
                  label="Cost Labor (ค่าแรง — บาท)"
                  value={costLabor || ""}
                  onChange={(e) => setCostLabor(Number(e.target.value) || 0)}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── ส่วนที่ 4: รูปหลังซ่อม ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Camera className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <span>รูปหลังซ่อม (After Image)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={afterImageRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  addAfterImages(e.target.files);
                  e.target.value = "";
                }}
              />

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {afterImages.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 group">
                    <img src={p} alt={`รูปหลังซ่อม ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/70 text-white hover:bg-slate-900 transition-colors"
                      onClick={() => setAfterImages(afterImages.filter((_, x) => x !== i))}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {afterImages.length < 5 && (
                  <button
                    type="button"
                    className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-500 dark:hover:border-sky-400 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 bg-slate-50/50 dark:bg-slate-800/50 transition-colors"
                    onClick={() => afterImageRef.current?.click()}
                  >
                    <Camera className="w-6 h-6" />
                    <span className="text-xs font-semibold">ถ่าย / เลือกรูป</span>
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── ปุ่มบันทึก ── */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--cmms-border)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/repair")}
              disabled={submitting}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? "กำลังบันทึก..." : "บันทึกข้อมูลซ่อม"}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

export default function EditWorkOrderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">กำลังโหลด...</div>}>
      <EditWorkOrderContent />
    </Suspense>
  );
}
