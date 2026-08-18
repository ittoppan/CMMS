"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import {
  HomeIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  CameraIcon,
  ClockIcon,
  CurrencyDollarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
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

interface SparePart {
  id: number;
  code: string;
  name: string;
  quantity_used: number;
  unit_price: number;
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
    <VStack gap={6}>
      <Breadcrumbs>
        <BreadcrumbItem href="/repair" startIcon={<HomeIcon />}>ใบแจ้งซ่อม</BreadcrumbItem>
        <BreadcrumbItem isCurrent>บันทึกข้อมูลซ่อม</BreadcrumbItem>
      </Breadcrumbs>

      {/* Header */}
      <div className="cmms-page-hero" style={{ borderRadius: 12 }}>
        <HStack gap={3} vAlign="center">
          <WrenchScrewdriverIcon className="w-6 h-6" style={{ color: "#fff" }} />
          <VStack gap={0}>
            <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>F-EN-03 · บันทึกข้อมูลซ่อม</Text>
            <Heading level={3} style={{ color: "#fff", margin: 0 }}>
              {woData?.work_order_no || `WO-${woId}`} — {woData?.asset_name || woData?.asset_code || ""}
            </Heading>
          </VStack>
        </HStack>
      </div>

      {loadingData ? (
        <HStack hAlign="center" style={{ padding: 40 }}>
          <Spinner size="md" />
          <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
        </HStack>
      ) : (
        <VStack gap={5} style={{ maxWidth: 900 }}>
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--cmms-danger-light)", color: "var(--cmms-danger)", fontSize: "0.85rem", fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* ── ส่วนที่ 1: สรุปข้อมูลจากผู้แจ้ง (อ่านอย่างเดียว) ── */}
          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <DocumentTextIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                <Heading level={4} style={{ margin: 0 }}>ข้อมูลจากผู้แจ้ง</Heading>
                <Text type="body" size="sm" color="secondary">(อ่านอย่างเดียว)</Text>
              </HStack>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px 24px" }}>
                <InfoRow label="ผู้แจ้ง" value={woData?.receiver_name || "-"} />
                <InfoRow label="เครื่องจักร" value={`${woData?.asset_code || "-"} ${woData?.asset_name || ""}`} />
                <InfoRow label="สถานะเครื่อง" value={woData?.machine_status || "-"} />
                <InfoRow label="อาการเสีย" value={woData?.title || "-"} />
                <InfoRow label="รายละเอียดปัญหา" value={woData?.description || "-"} />
                <InfoRow label="Lot No." value={woData?.product_lot_no || "-"} />
              </div>
            </VStack>
          </Card>

          {/* ── ส่วนที่ 2: ข้อมูลช่างกรอก ── */}
          <Card padding={5}>
            <VStack gap={5}>
              <HStack gap={2} vAlign="center">
                <WrenchScrewdriverIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                <Heading level={4} style={{ margin: 0 }}>ข้อมูลซ่อม (ช่างกรอก)</Heading>
              </HStack>

              {/* Status + Priority */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Selector
                  label="สถานะงาน (Job Status)"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "open", label: "เปิดงาน / รอดำเนินการ" },
                    { value: "in_progress", label: "กำลังซ่อม" },
                    { value: "waiting_parts", label: "รออะไหล่" },
                    { value: "completed", label: "ซ่อมเสร็จแล้ว" },
                    { value: "cancelled", label: "ยกเลิก" },
                  ]}
                />
                <Selector
                  label="ความสำคัญ (Priority)"
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: "critical", label: "วิกฤต (Critical)" },
                    { value: "high", label: "ด่วน (High)" },
                    { value: "medium", label: "ปานกลาง (Medium)" },
                    { value: "low", label: "ต่ำ (Low)" },
                  ]}
                />
              </div>

              {/* Root Cause */}
              <div>
                <Text type="body" weight="bold" style={{ marginBottom: 8 }}>
                  Root Cause (สาเหตุของปัญหา) <span style={{ color: "var(--cmms-danger)" }}>*</span>
                </Text>
                <TextArea
                  label="Root Cause"
                  isLabelHidden
                  placeholder="ระบุสาเหตุของปัญหา เช่น สึกหรอตามอายุการใช้งาน, ไม่ได้ทำความสะอาด, อะไหล่เสื่อมสภาพ..."
                  value={rootCause}
                  onChange={setRootCause}
                  rows={3}
                />
              </div>

              {/* Maintenance Description */}
              <div>
                <Text type="body" weight="bold" style={{ marginBottom: 8 }}>
                  Maintenance Description (รายละเอียดการซ่อม) <span style={{ color: "var(--cmms-danger)" }}>*</span>
                </Text>
                <TextArea
                  label="Maintenance Description"
                  isLabelHidden
                  placeholder="อธิบายว่าทำอะไรบ้าง เช่น เปลี่ยน bearing, ปรับตั้ง tension, ทำความสะอาด..."
                  value={maintenanceDesc}
                  onChange={setMaintenanceDesc}
                  rows={3}
                />
              </div>

              {/* Maintenance Note */}
              <div>
                <Text type="body" weight="bold" style={{ marginBottom: 8 }}>
                  Maintenance Note (บันทึกการซ่อม)
                </Text>
                <TextArea
                  label="Maintenance Note"
                  isLabelHidden
                  placeholder="บันทึกข้อมูลเพิ่มเติม เช่น ข้อควรระวัง, ควรตรวจสอบอีกครั้ง..."
                  value={maintenanceNote}
                  onChange={setMaintenanceNote}
                  rows={2}
                />
              </div>

              {/* MTN. Action */}
              <div>
                <Text type="body" weight="bold" style={{ marginBottom: 8 }}>
                  MTN. Action (การดำเนินการ)
                </Text>
                <TextArea
                  label="MTN. Action"
                  isLabelHidden
                  placeholder="ระบุการดำเนินการที่ทำ เช่น ซ่อมแซม, ปรับเปลี่ยน, ทดสอบ..."
                  value={mtnAction}
                  onChange={setMtnAction}
                  rows={2}
                />
              </div>

              {/* Contaminate Checking */}
              <div>
                <Text type="body" weight="bold" style={{ marginBottom: 8 }}>
                  Contaminate Checking (ตรวจสอบการปนเปื้อน) <span style={{ color: "var(--cmms-danger)" }}>*</span>
                </Text>
                <Selector
                  label="ตรวจสอบการปนเปื้อน"
                  isLabelHidden
                  value={contaminateChecking}
                  onChange={setContaminateChecking}
                  options={[
                    { value: "not_checked", label: "ยังไม่ตรวจ" },
                    { value: "clean", label: "ไม่พบการปนเปื้อน (ผ่าน)" },
                    { value: "contaminated", label: "พบการปนเปื้อน" },
                    { value: "not_applicable", label: "ไม่เกี่ยวข้องกับงานนี้" },
                  ]}
                />
              </div>

              {/* Outsource By */}
              <div>
                <Text type="body" weight="bold" style={{ marginBottom: 8 }}>
                  Outsource By (ภายนอก โดย)
                </Text>
                <TextInput
                  label="Outsource By"
                  isLabelHidden
                  placeholder="ระบุชื่อบริษัท/ผู้รับเหมาภายนอก (ถ้ามี)"
                  value={outsourceBy}
                  onChange={setOutsourceBy}
                />
              </div>
            </VStack>
          </Card>

          {/* ── ส่วนที่ 3: เวลาและค่าใช้จ่าย ── */}
          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <ClockIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                <Heading level={4} style={{ margin: 0 }}>เวลาและค่าใช้จ่าย</Heading>
              </HStack>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <Text type="body" weight="bold" style={{ marginBottom: 8 }}>Start Date/Time (วันที่เริ่มซ่อม)</Text>
                  <input
                    type="datetime-local"
                    value={downtimeStart ? downtimeStart.slice(0, 16) : ""}
                    onChange={(e) => setDowntimeStart(e.target.value ? e.target.value.replace("T", " ") + ":00" : "")}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", fontSize: 14 }}
                  />
                </div>
                <div>
                  <Text type="body" weight="bold" style={{ marginBottom: 8 }}>Finish Date/Time (วันที่เสร็จซ่อม)</Text>
                  <input
                    type="datetime-local"
                    value={downtimeEnd ? downtimeEnd.slice(0, 16) : ""}
                    onChange={(e) => setDowntimeEnd(e.target.value ? e.target.value.replace("T", " ") + ":00" : "")}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", fontSize: 14 }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                <div>
                  <Text type="body" weight="bold" style={{ marginBottom: 8 }}>BD. Time (เวลาหยุดเครื่อง — นาที)</Text>
                  <input
                    type="number"
                    value={downtimeMinutes || ""}
                    onChange={(e) => setDowntimeMinutes(Number(e.target.value) || 0)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", fontSize: 14 }}
                  />
                </div>
                <div>
                  <Text type="body" weight="bold" style={{ marginBottom: 8 }}>Cost Parts (ค่าอะไหล่ — บาท)</Text>
                  <input
                    type="number"
                    value={costParts || ""}
                    onChange={(e) => setCostParts(Number(e.target.value) || 0)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", fontSize: 14 }}
                  />
                </div>
                <div>
                  <Text type="body" weight="bold" style={{ marginBottom: 8 }}>Cost Labor (ค่าแรง — บาท)</Text>
                  <input
                    type="number"
                    value={costLabor || ""}
                    onChange={(e) => setCostLabor(Number(e.target.value) || 0)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", fontSize: 14 }}
                  />
                </div>
              </div>
            </VStack>
          </Card>

          {/* ── ส่วนที่ 4: รูปหลังซ่อม ── */}
          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <CameraIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                <Heading level={4} style={{ margin: 0 }}>รูปหลังซ่อม (After Image)</Heading>
              </HStack>

              <input
                ref={afterImageRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => { addAfterImages(e.target.files); e.target.value = ""; }}
              />

              <div className="cmms-photo-grid">
                {afterImages.map((p, i) => (
                  <div key={i} className="cmms-photo-thumb">
                    <img src={p} alt={`รูปหลังซ่อม ${i + 1}`} />
                    <button
                      type="button"
                      className="cmms-photo-remove"
                      onClick={() => setAfterImages(afterImages.filter((_, x) => x !== i))}
                    >
                      <XMarkIcon style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                ))}
                {afterImages.length < 5 && (
                  <button type="button" className="cmms-photo-add" onClick={() => afterImageRef.current?.click()}>
                    <CameraIcon style={{ width: 24, height: 24 }} />
                    <Text type="body" size="2xs" weight="bold">ถ่าย / เลือกรูป</Text>
                  </button>
                )}
              </div>
            </VStack>
          </Card>

          {/* ── ปุ่มบันทึก ── */}
          <HStack gap={3} hAlign="end">
            <button
              type="button"
              onClick={() => router.push("/repair")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูลซ่อม"}
            </button>
          </HStack>
        </VStack>
      )}
    </VStack>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text type="body" size="sm" color="secondary">{label}</Text>
      <Text type="body" size="sm" weight="bold">{value}</Text>
    </div>
  );
}

export default function EditWorkOrderPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditWorkOrderContent />
    </Suspense>
  );
}
