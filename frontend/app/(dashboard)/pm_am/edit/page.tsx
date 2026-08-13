"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea"; // Ensure TextArea is imported
import { Selector } from "@astryxdesign/core/Selector";
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

          // Set new state variables
          setCompletedAt(json.completed_at || undefined);
          setCompletedBy(json.completed_by_name || ""); // Assuming API returns name, adjust if it's an ID
          setRescheduleReason(json.reschedule_reason || "");
        } else {
          setError("ไม่พบข้อมูลแผน PM");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [pmId]);

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
                readOnly
              />
            )}
            {status === "completed" && completedBy && (
              <TextInput
                label="ผู้ดำเนินการ"
                value={completedBy}
                readOnly
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
