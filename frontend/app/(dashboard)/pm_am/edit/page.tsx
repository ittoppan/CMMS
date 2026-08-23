"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import SuccessDialog from "@/components/SuccessDialog";

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
  const [dueDate, setDueDate] = useState("");
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
  const [completedAt, setCompletedAt] = useState("");
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
          setDueDate(json.due_date || "");
          setDescription(json.description || "");
          setNotes(json.notes || "");
          setPmNumber(`PM-${String(json.id).padStart(3, '0')}`);
          setAssignedTo(json.assigned_to ? String(json.assigned_to) : "");
          setIsOutsource(!!Number(json.is_outsource));
          setOutsourceBy(json.outsource_by || "");
          setCostOutsource(json.cost_outsource ? String(json.cost_outsource) : "");

          // Set new state variables
          setCompletedAt(json.completed_at || "");
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
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM PLAN · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>อัปเดตสถานะงานซ่อมบำรุง</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              {pmNumber || "PM Plan"}
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            แก้ไขข้อมูลแผน PM และอัปเดตสถานะการดำเนินงาน
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {loadingData ? (
            <div className="max-w-[640px] space-y-3" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-[var(--color-skeleton)]" />
              ))}
            </div>
          ) : (
            <div className="max-w-[640px] space-y-5">
              {error && <Alert variant="danger" description={error} />}

              <Input
                label="ชื่องาน PM"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <div className="space-y-1.5">
                <label htmlFor="pm-edit-assignee" className="text-sm font-medium text-[var(--cmms-text-primary)]">ผู้รับผิดชอบ (ช่าง)</label>
                <Select
                  value={assignedTo || "__none__"}
                  onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="pm-edit-assignee" aria-label="ผู้รับผิดชอบ">
                    <SelectValue placeholder="เลือกช่างที่รับผิดชอบงาน PM นี้..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">เลือกช่างที่รับผิดชอบงาน PM นี้...</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{`${u.full_name || u.username || `#${u.id}`}${u.employee_code ? ` (${u.employee_code})` : ""}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isOutsource}
                    onChange={(e) => setIsOutsource(e.target.checked)}
                    className="h-4 w-4 accent-[var(--cmms-primary)]"
                  />
                  <span className="text-sm font-semibold">งานภายนอก (Outsource)</span>
                </label>
                <span className="text-sm text-[var(--cmms-text-secondary)]">เปิดเมื่อจ้างบริษัท/ผู้รับเหมาภายนอกมาทำ PM</span>
              </div>

              {isOutsource && (
                <div className="space-y-3 rounded-[10px] border p-4" style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-wash)" }}>
                  <Input
                    label="ชื่อบริษัท/ผู้รับเหมา *"
                    placeholder="เช่น บริษัท ไฮโดรเทสต์ จำกัด"
                    value={outsourceBy}
                    onChange={(e) => setOutsourceBy(e.target.value)}
                  />
                  <Input
                    label="ค่าใช้จ่าย (บาท)"
                    type="number"
                    min={0}
                    placeholder="เช่น 25000"
                    value={costOutsource}
                    onChange={(e) => setCostOutsource(e.target.value)}
                  />
                </div>
              )}

              {/* ── เอกสารแนบ (ใบแจ้งหนี้/ใบเสนอราคา) ── */}
              <div className="space-y-3 rounded-[10px] border border-dashed p-4" style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-wash)" }}>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">เอกสารแนบ (ใบแจ้งหนี้ / ใบเสนอราคา)</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">รองรับ pdf / xls / xlsx / doc / docx / csv / txt สูงสุด 6 MB ต่อไฟล์</p>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.txt"
                  disabled={attUploading}
                  onChange={(e) => uploadAttachments(e.target.files)}
                  className="text-[13px]"
                  style={{ color: "var(--cmms-text-secondary)" }}
                />
                {attMsg && (
                  <p className="text-sm" style={{ color: attMsg.kind === "ok" ? "var(--cmms-success-dark)" : "var(--cmms-danger)" }}>{attMsg.text}</p>
                )}
                {attUploading && <p className="text-sm text-[var(--cmms-text-secondary)]">กำลังอัปโหลด...</p>}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map(a => (
                      <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ background: "var(--cmms-bg-card)", borderColor: "var(--cmms-border)" }}>
                        <a
                          href={a.file_path}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-[13px] font-semibold no-underline"
                          style={{ color: "var(--cmms-primary)" }}
                        >
                          {a.file_name}
                        </a>
                        <span className="text-sm text-[var(--cmms-text-secondary)]">{(a.file_size ? (a.file_size / 1024).toFixed(0) : 0)} KB</span>
                        <button
                          type="button"
                          onClick={() => deleteAttachment(a.id)}
                          className="ml-auto cursor-pointer border-none bg-transparent text-xs font-semibold"
                          style={{ color: "var(--cmms-danger)" }}
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pm-edit-status" className="text-sm font-medium text-[var(--cmms-text-primary)]">สถานะปัจจุบัน</label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v)}
                >
                  <SelectTrigger id="pm-edit-status" aria-label="สถานะปัจจุบัน">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">รอดำเนินการ</SelectItem>
                    <SelectItem value="in_progress">กำลังทำ</SelectItem>
                    <SelectItem value="completed">ทำเสร็จแล้ว</SelectItem>
                    <SelectItem value="overdue">เกินกำหนดเวลา</SelectItem>
                    <SelectItem value="skipped">ข้ามรอบนี้</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Input
                label="กำหนดการรอบนี้"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />

              <Textarea
                label="บันทึกผลการตรวจเช็ค"
                placeholder="บันทึกย่อ ข้อมูลที่พบจากการตรวจเช็ค..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              {/* Conditionally render completed_at and completed_by if status is 'completed' */}
              {status === "completed" && completedAt && (
                <Input
                  label="วันที่เสร็จสิ้น"
                  value={completedAt.split('T')[0]} // Display only the date part
                  disabled
                />
              )}
              {status === "completed" && completedBy && (
                <Input
                  label="ผู้ดำเนินการ"
                  value={completedBy}
                  disabled
                />
              )}

              {/* Conditionally render rescheduleReason if status is 'skipped' or 'overdue' */}
              {(status === "skipped" || status === "overdue") && (
                <Textarea
                  label="เหตุผลในการเลื่อน/ข้าม"
                  placeholder="ระบุเหตุผลที่ทำให้งานนี้ถูกเลื่อนหรือข้ามรอบ"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                />
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => router.push("/pm_am")}>
                  ยกเลิก
                </Button>
                <Button disabled={submitting} onClick={handleSubmit}>
                  {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EditPMPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--cmms-text-secondary)]">กำลังโหลด...</p>}>
      <EditPMContent />
    </Suspense>
  );
}
