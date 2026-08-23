"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Wrench,
  FileText,
  Clock,
  Camera,
  X,
  Save,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/PageShell";
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
    <PageShell
      eyebrow={<p className="cmms-eyebrow">REPAIR ORDER · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "งานซ่อม", href: "/repair" }, { label: "บันทึกข้อมูลซ่อม" }]}
      title={woData?.work_order_no ? `${woData.work_order_no} — ${woData.asset_name || woData.asset_code || ""}` : `WO-${woId}`}
      description="กรอกข้อมูลสาเหตุ ผลการซ่อม เวลาหยุดเครื่อง และค่าใช้จ่ายในการซ่อม"
      className="max-w-4xl"
    >
      {loadingData ? (
        <div className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
          <Spinner size={24} />
          <span>กำลังโหลดข้อมูล...</span>
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
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
                <span className="text-xs font-normal text-muted-foreground">(อ่านอย่างเดียว)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wo-edit-status">สถานะงาน (Job Status)<span className="text-destructive"> *</span></Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="wo-edit-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">เปิดงาน / รอดำเนินการ</SelectItem>
                      <SelectItem value="in_progress">กำลังซ่อม</SelectItem>
                      <SelectItem value="waiting_parts">รออะไหล่</SelectItem>
                      <SelectItem value="completed">ซ่อมเสร็จแล้ว</SelectItem>
                      <SelectItem value="cancelled">ยกเลิก</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wo-edit-priority">ความสำคัญ (Priority)<span className="text-destructive"> *</span></Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="wo-edit-priority" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">วิกฤต (Critical)</SelectItem>
                      <SelectItem value="high">ด่วน (High)</SelectItem>
                      <SelectItem value="medium">ปานกลาง (Medium)</SelectItem>
                      <SelectItem value="low">ต่ำ (Low)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <div className="space-y-1.5">
                <Label htmlFor="wo-edit-contam">Contaminate Checking (ตรวจสอบการปนเปื้อน)<span className="text-destructive"> *</span></Label>
                <Select value={contaminateChecking} onValueChange={setContaminateChecking}>
                  <SelectTrigger id="wo-edit-contam" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_checked">ยังไม่ตรวจ</SelectItem>
                    <SelectItem value="clean">ไม่พบการปนเปื้อน (ผ่าน)</SelectItem>
                    <SelectItem value="contaminated">พบการปนเปื้อน</SelectItem>
                    <SelectItem value="not_applicable">ไม่เกี่ยวข้องกับงานนี้</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {afterImages.map((p, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                    <img src={p} alt={`รูปหลังซ่อม ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label={`ลบรูปหลังซ่อม ${i + 1}`}
                      className="absolute right-1.5 top-1.5 rounded-full bg-zinc-900/70 p-1 text-white transition-colors hover:bg-zinc-900"
                      onClick={() => setAfterImages(afterImages.filter((_, x) => x !== i))}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {afterImages.length < 5 && (
                  <button
                    type="button"
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input bg-muted/50 text-muted-foreground transition-colors hover:border-ring hover:text-primary"
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
          <div className="flex items-center justify-end gap-3 border-t border-[var(--cmms-border)] pt-4">
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
    </PageShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="block text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}

export default function EditWorkOrderPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">กำลังโหลด...</div>}>
      <EditWorkOrderContent />
    </Suspense>
  );
}
