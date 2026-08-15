"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea"; // Ensure TextArea is imported
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { DateInput } from "@astryxdesign/core/DateInput";
import SuccessDialog from "@/components/SuccessDialog";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function EditPMContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pmId = searchParams.get("id");

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("pending");
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [pmNumber, setPmNumber] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [isOutsource, setIsOutsource] = useState(false);
  const [outsourceBy, setOutsourceBy] = useState("");
  const [costOutsource, setCostOutsource] = useState("");

  // ── เอกสารแนบ (ใบแจ้งหนี้/ใบเสนอราคา) ──
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attUploading, setAttUploading] = useState(false);
  const [attMsg, setAttMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // New state variables for the new fields
  const [completedAt, setCompletedAt] = useState<ISODate | undefined>(undefined);
  const [completedBy, setCompletedBy] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  useEffect(() => {
    // ผู้รับผิดชอบ = ผู้ใช้งานที่ active
    fetch("/api/v1/index.php?resource=users")
      .then(res => res.json())
      .then(json => {
        const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
        setUsers(list.filter((u: any) => u.is_active !== 0 && u.is_active !== "0"));
      })
      .catch(() => { /* ignore */ });

    if (!pmId) {
      setError("ไม่ระบุหมายเลขแผน PM");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/pm_am.php?id=${pmId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setTitle(json.title || "");
          setStatus(json.status || "pending");
          setDueDate(json.due_date || undefined);
          setDescription(json.description || "");
          setNotes(json.notes || "");
          setPmNumber(`PM-${String(json.id).padStart(3, '0')}`);
          setAssignedTo(json.assigned_to ? String(json.assigned_to) : "");
          setIsOutsource(!!Number(json.is_outsource));
          setOutsourceBy(json.outsource_by || "");
          setCostOutsource(json.cost_outsource ? String(json.cost_outsource) : "");

          // Set new state variables
          setCompletedAt(json.completed_at || undefined);
          setCompletedBy(json.completed_by_name || ""); // Assuming API returns name, adjust if it's an ID
          setRescheduleReason(json.reschedule_reason || "");

          // โหลดเอกสารแนบ
          fetch(`/api/v1/pm_am.php?attachments=1&id=${pmId}`)
            .then(res => res.json())
            .then(list => { if (Array.isArray(list)) setAttachments(list); })
            .catch(() => { /* ignore */ });
        } else {
          setError("ไม่พบข้อมูลแผน PM");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [pmId]);

  const uploadAttachments = async (files: FileList | null) => {
    if (!pmId || !files || files.length === 0) return;
    setAttUploading(true);
    setAttMsg(null);
    let okCount = 0;
    const fails: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("folder", "pm_am");
        fd.append("file", file);
        const upRes = await fetch("/api/v1/upload.php", { method: "POST", body: fd });
        const upJson = await upRes.json();
        if (!upJson.url) throw new Error(upJson.error || "อัปโหลดไม่สำเร็จ");
        const regRes = await fetch(`/api/v1/pm_am.php?id=${pmId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attach_file: { file_url: upJson.url, file_name: file.name, file_type: file.type, file_size: file.size } }),
        });
        const regJson = await regRes.json();
        if (!regJson.success) throw new Error(regJson.error || "บันทึกไม่สำเร็จ");
        okCount++;
      } catch (e) {
        console.error(e);
        fails.push(file.name);
      }
    }
    const listRes = await fetch(`/api/v1/pm_am.php?attachments=1&id=${pmId}`);
    const list = await listRes.json();
    if (Array.isArray(list)) setAttachments(list);
    setAttUploading(false);
    setAttMsg(fails.length === 0
      ? { kind: "ok", text: `อัปโหลดเอกสารสำเร็จ ${okCount} ไฟล์` }
      : { kind: "err", text: `อัปโหลดไม่สำเร็จ ${fails.length} ไฟล์: ${fails.join(", ")}` });
  };

  const deleteAttachment = async (attId: number) => {
    if (!window.confirm("ลบเอกสารแนบนี้?")) return;
    const res = await fetch(`/api/v1/pm_am.php?attachment_id=${attId}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      setAttachments(prev => prev.filter(a => a.id !== attId));
      setAttMsg({ kind: "ok", text: "ลบเอกสารแล้ว" });
    } else {
      setAttMsg({ kind: "err", text: json.error || "ลบไม่สำเร็จ" });
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      // First fetch the existing data to preserve fields we aren't editing
      const currentRes = await fetch(`/api/v1/pm_am.php?id=${pmId}`);
      const currentData = await currentRes.json();

      const payload = {
        ...currentData,
        title,
        status,
        due_date: dueDate || null,
        assigned_to: assignedTo ? Number(assignedTo) : null,
        notes,
        is_outsource: isOutsource ? 1 : 0,
        outsource_by: isOutsource && outsourceBy.trim() ? outsourceBy.trim() : null,
        cost_outsource: isOutsource ? (Number(costOutsource) || 0) : 0,
        // Include new fields in the payload if they are being updated or are relevant
        reschedule_reason: rescheduleReason, // Include reschedule reason
        // completed_at and completed_by are typically set by a completion action,
        // so we might not edit them directly here, but include if API allows.
        // If they are meant to be updated here, uncomment and adjust:
        // completed_at: status === 'completed' ? (completedAt || new Date().toISOString().split('T')[0]) : null,
        // completed_by: status === 'completed' ? (completedBy || 'current_user_id') : null,
      };

      const res = await fetch(`/api/v1/pm_am.php?id=${pmId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success || json.message) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะ");
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
        title="อัปเดตสถานะงานสำเร็จ!"
        message={<>แผนซ่อมบำรุง <strong>{pmNumber}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าตาราง PM"
        onPrimary={() => router.push("/pm_am")}
        onBackdrop={() => router.push("/pm_am")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM PLAN · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>อัปเดตสถานะงานซ่อมบำรุง</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              {pmNumber || "PM Plan"}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แก้ไขข้อมูลแผน PM และอัปเดตสถานะการดำเนินงาน
          </Text>
        </VStack>
      </div>

      <Card padding={6}>
        {loadingData ? (
          <Text type="body" color="secondary">กำลังโหลดข้อมูลแผนงาน...</Text>
        ) : (
          <VStack gap={5} style={{ maxWidth: 640 }}>
            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <TextInput
              label="ชื่องาน PM"
              value={title}
              onChange={setTitle}  />

            <Selector
              label="ผู้รับผิดชอบ (ช่าง)"
              placeholder="เลือกช่างที่รับผิดชอบงาน PM นี้..."
              value={assignedTo}
              onChange={setAssignedTo}
              options={users.map(u => ({ value: String(u.id), label: `${u.full_name || u.username || `#${u.id}`}${u.employee_code ? ` (${u.employee_code})` : ""}` }))}
            />

            <HStack gap={3} vAlign="center" wrap="wrap">
              <Switch
                label="งานภายนอก (Outsource)"
                value={isOutsource}
                onChange={setIsOutsource}
              />
              <Text type="body" size="sm" color="secondary">เปิดเมื่อจ้างบริษัท/ผู้รับเหมาภายนอกมาทำ PM</Text>
            </HStack>

            {isOutsource && (
              <VStack gap={3} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--cmms-border)", background: "var(--cmms-bg-wash)" }}>
                <TextInput
                  label="ชื่อบริษัท/ผู้รับเหมา *"
                  placeholder="เช่น บริษัท ไฮโดรเทสต์ จำกัด"
                  value={outsourceBy}
                  onChange={setOutsourceBy}
                />
                <VStack gap={1}>
                  <Text type="body" size="sm" weight="semibold">ค่าใช้จ่าย (บาท)</Text>
                  <input
                    type="number"
                    min={0}
                    placeholder="เช่น 25000"
                    value={costOutsource}
                    onChange={(e) => setCostOutsource(e.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", fontSize: 14, width: "100%", boxSizing: "border-box", background: "var(--cmms-bg-card)" }}
                  />
                </VStack>
              </VStack>
            )}

            {/* ── เอกสารแนบ (ใบแจ้งหนี้/ใบเสนอราคา) ── */}
            <VStack gap={3} style={{ padding: 16, borderRadius: 10, border: "1px dashed var(--cmms-border)", background: "var(--cmms-bg-wash)" }}>
              <VStack gap={1}>
                <Text type="body" size="sm" weight="semibold">เอกสารแนบ (ใบแจ้งหนี้ / ใบเสนอราคา)</Text>
                <Text type="body" size="sm" color="secondary">รองรับ pdf / xls / xlsx / doc / docx / csv / txt สูงสุด 6 MB ต่อไฟล์</Text>
              </VStack>
              <input
                type="file"
                multiple
                accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.txt"
                disabled={attUploading}
                onChange={(e) => uploadAttachments(e.target.files)}
                style={{ fontSize: 13, color: "var(--cmms-text-secondary)" }}
              />
              {attMsg && (
                <Text type="body" size="sm" style={{ color: attMsg.kind === "ok" ? "var(--cmms-success-dark)" : "var(--cmms-danger)" }}>{attMsg.text}</Text>
              )}
              {attUploading && <Text type="body" size="sm" color="secondary">กำลังอัปโหลด...</Text>}
              {attachments.length > 0 && (
                <VStack gap={2}>
                  {attachments.map(a => (
                    <HStack key={a.id} gap={2} vAlign="center" wrap="wrap" style={{ padding: "8px 12px", borderRadius: 8, background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)" }}>
                      <a
                        href={a.file_path}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 600, color: "var(--cmms-primary)", textDecoration: "none", wordBreak: "break-all" }}
                      >
                        {a.file_name}
                      </a>
                      <Text type="body" size="sm" color="secondary">{(a.file_size ? (a.file_size / 1024).toFixed(0) : 0)} KB</Text>
                      <button
                        type="button"
                        onClick={() => deleteAttachment(a.id)}
                        style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--cmms-danger)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        ลบ
                      </button>
                    </HStack>
                  ))}
                </VStack>
              )}
            </VStack>

            <Selector
              label="สถานะปัจจุบัน"
              placeholder="เลือกสถานะ"
              value={status}
              onChange={setStatus}
              options={[
                { value: "pending", label: "รอดำเนินการ" },
                { value: "in_progress", label: "กำลังทำ" },
                { value: "completed", label: "ทำเสร็จแล้ว" },
                { value: "overdue", label: "เกินกำหนดเวลา" },
                { value: "skipped", label: "ข้ามรอบนี้" },
              ]}
            />

            <DateInput
              label="กำหนดการรอบนี้"
              value={dueDate}
              onChange={setDueDate}
            />

            <TextArea
              label="บันทึกผลการตรวจเช็ค"
              placeholder="บันทึกย่อ ข้อมูลที่พบจากการตรวจเช็ค..."
              value={notes}
              onChange={setNotes}
            />

            {/* Conditionally render completed_at and completed_by if status is 'completed' */}
            {status === "completed" && completedAt && (
              <TextInput
                label="วันที่เสร็จสิ้น"
                value={completedAt.split('T')[0]} // Display only the date part
                isDisabled
              />
            )}
            {status === "completed" && completedBy && (
              <TextInput
                label="ผู้ดำเนินการ"
                value={completedBy}
                isDisabled
              />
            )}

            {/* Conditionally render rescheduleReason if status is 'skipped' or 'overdue' */}
            {(status === "skipped" || status === "overdue") && (
              <TextArea
                label="เหตุผลในการเลื่อน/ข้าม"
                placeholder="ระบุเหตุผลที่ทำให้งานนี้ถูกเลื่อนหรือข้ามรอบ"
                value={rescheduleReason}
                onChange={setRescheduleReason}
              />
            )}

            <HStack gap={3} hAlign="end">
              <button
                type="button"
                onClick={() => router.push("/pm_am")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] transition-all duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </button>
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditPMPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditPMContent />
    </Suspense>
  );
}
