"use client";

// Inspection Run (Execute) — Phase 13
// Mobile-first execution wizard: ทุก item type (check/yes_no/pass_fail/numeric/measurement/text/dropdown/date_time)
// + auto-save (draft ฝั่ง server + localStorage) + ถ่ายรูปหลักฐาน (อัปโหลดทันที, ออฟไลน์รอส่ง)
// + offline submit (enqueue) + blocking ป้องกันซ้ำ (server FOR UPDATE + 409) + สร้าง WO/MR อัตโนมัติเมื่อไม่ผ่าน

import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/components/ToastProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  TriangleAlert,
  Wrench,
  Camera,
  Save,
  Loader2,
  ListChecks,
  Copy,
} from "lucide-react";
import { enqueue, pendingCount, subscribeOnline } from "@/lib/offlineQueue";

type ItemType = "check" | "value" | "numeric" | "measurement" | "dropdown" | "date_time" | "yes_no" | "pass_fail" | "text";
type AnswerStatus = "pass" | "fail" | "warn" | null;

interface RunPhoto {
  id?: number;
  path?: string;
  dataUrl?: string;
  pending?: boolean;
  caption?: string;
}

interface RunItem {
  id: number;
  seq: number;
  task: string;
  type: ItemType;
  standard: string;
  min_value: number | null;
  max_value: number | null;
  unit: string;
  options: string[];
  is_required: boolean;
  photo_required: boolean;
  remark_required: boolean;
  pass_criteria: string;
  failure_action: string;
  status: AnswerStatus;
  value: string;
  note: string;
  photos: RunPhoto[];
}

const TYPE_LABELS: Record<ItemType, string> = {
  check: "ตรวจ", value: "# ค่าตัวเลข", numeric: "ตัวเลข", measurement: "วัดค่า",
  dropdown: "ตัวเลือก", date_time: "วัน/เวลา", yes_no: "ใช่/ไม่ใช่", pass_fail: "ผ่าน/ไม่ผ่าน", text: "ข้อความ",
};

function isNumericItem(t: ItemType): boolean {
  return t === "value" || t === "numeric" || t === "measurement";
}

export default function InspectionRunPage() {
  const { showToast } = useToast();
  const [schedules, setSchedules] = useState<{ value: string; label: string; priority: string; due: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState("");
  const [schedule, setSchedule] = useState<any>(null);
  const [items, setItems] = useState<RunItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [savedAt, setSavedAt] = useState("");
  const [result, setResult] = useState<{ result: string; fail_count: number; repair_id: number | null; maintenance_request_id: number | null; next_schedule_id: number | null } | null>(null);

  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef(true);
  onlineRef.current = online;
  const loadedIdRef = useRef<string | null>(null);

  const draftKey = schedule ? `cmms_inspection_draft_v1_${schedule.id}` : "";

  // ── จำนวนค้างส่ง + ออนไลน์/Badge ──
  useEffect(() => {
    setPending(pendingCount());
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const off = subscribeOnline(() => setPending(pendingCount()));
    const onUp = () => { setOnline(true); flushPendingPhotos(); };
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => { off(); window.removeEventListener("online", onUp); window.removeEventListener("offline", onDown); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const loadMySchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/inspection_execute.php");
      const json = await res.json();
      if (!Array.isArray(json)) { setError("โหลดรอบตรวจไม่สำเร็จ"); setLoading(false); return; }
      const open = json.filter((s: any) => s.status !== "completed");
      setSchedules(open.map((s: any) => ({
        value: String(s.id),
        label: `${s.template_title || `Template #${s.template_id}`} — ${s.asset_name || `เครื่อง #${s.asset_id}`}${s.due_date ? ` (ครบ ${s.due_date})` : ""}`,
        priority: s.priority, due: s.due_date || "",
      })));
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดรอบตรวจได้");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadMySchedules(); }, [loadMySchedules]);

  // ── เลือกรอบจากการลิงก์ (QR / รายการ) ──
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const id = p.get("schedule_id")?.trim();
      if (id) setSelectedId(id);
    } catch { /* ignore */ }
  }, []);

  // โหลดรายการตรวจทันทีเมื่อ ?schedule_id= ตั้งไว้ (ยังไม่เคยโหลด)
  useEffect(() => {
    if (selectedId && schedules.length > 0 && selectedId !== loadedIdRef.current) {
      loadedIdRef.current = selectedId;
      loadSchedule(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, schedules]);

  const loadSchedule = async (id: number | string) => {
    loadedIdRef.current = String(id);
    setError(null);
    setResult(null);
    setSavedAt("");
    setItems([]);
    try {
      const res = await fetch(`/api/v1/inspection_execute.php?schedule=${id}`);
      const s = await res.json();
      if (!s.id) { setError(s.error || "ไม่พบรอบตรวจ"); return; }
      setSchedule(s);

      // ข้อมูลเดิม (ถ้าเริ่มไว้แล้ว) + draft ฝั่งเซิร์ฟเวอร์
      const old = new Map<string, any>((s.results || []).map((r: any) => [String(r.item_id), r]));
      let draftAnswers: Record<number, any> = {};
      try {
        const d = s.draft_json && s.draft_json.answers ? s.draft_json.answers : {};
        draftAnswers = d || {};
      } catch { /* ignore */ }

      const photoByItem = new Map<number, RunPhoto[]>();
      for (const ph of s.photos || []) {
        const list = photoByItem.get(Number(ph.item_id || 0)) || [];
        list.push({ id: ph.id, path: ph.file_path, caption: ph.caption });
        photoByItem.set(Number(ph.item_id || 0), list);
      }

      const built: RunItem[] = (s.items || []).map((it: any) => {
        const prev = old.get(it.id);
        const draft = draftAnswers[Number(it.id)] || {};
        const photos = (draft.photos || []).filter((p: RunPhoto) => p.pending).concat(
          photoByItem.get(Number(it.id)) || photoByItem.get(0) || []
        );
        const options = Array.isArray(it.options) ? it.options
          : typeof it.options === "string" && it.options
            ? JSON.parse(it.options) : [];
        return {
          id: Number(it.id), seq: Number(it.seq || 0), task: it.task || "",
          type: (isNumericItem(it.type) ? (it.type === "value" ? "value" : it.type) : it.type) as ItemType,
          standard: it.standard || "", min_value: it.min_value != null ? Number(it.min_value) : null,
          max_value: it.max_value != null ? Number(it.max_value) : null, unit: it.unit || "",
          options, is_required: Number(it.is_required ?? 1) === 1,
          photo_required: Number(it.photo_required ?? 0) === 1,
          remark_required: Number(it.remark_required ?? 0) === 1,
          pass_criteria: it.pass_criteria || "", failure_action: it.failure_action || "",
          status: draft.status ?? prev?.status ?? null,
          value: draft.value ?? prev?.value ?? "",
          note: draft.note ?? prev?.note ?? "",
          photos,
        };
      });
      setItems(built);

      if (s.status !== "completed") {
        // เริ่มตรวจอัตโนมัติ (in_progress + started_at + inspector_id)
        try {
          await fetch(`/api/v1/inspection_execute.php?action=start&schedule=${s.id}`, { method: "POST" });
          setSchedule((prev: any) => ({ ...prev, status: "in_progress" }));
        } catch { /* ignore */ }
        // เก็บ draft เครื่องไว้เป็นจุดตั้งต้น
        try { if (s.draft_json?.answers) localStorage.setItem(draftKey, JSON.stringify(s.draft_json)); } catch { /* ignore */ }
      }
      flushPendingPhotos();
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดรายการตรวจได้");
    }
  };

  const handleSelect = async (value: string) => {
    setSelectedId(value);
    await loadSchedule(value);
  };

  // ── Auto-save (debounce): localStorage เสมอ + server draft เมื่อออนไลน์ ──
  const persistDraft = useCallback(() => {
    const snap = { answers: Object.fromEntries(items.map((it) => [it.id, { status: it.status, value: it.value, note: it.note, photos: it.photos }])), updatedAt: new Date().toISOString() };
    try { if (draftKey) localStorage.setItem(draftKey, JSON.stringify(snap)); } catch { /* quota */ }
    if (onlineRef.current && schedule && schedule.status !== "completed") {
      fetch(`/api/v1/inspection_execute.php?action=autosave&schedule=${schedule.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: snap }),
      }).then((r) => { if (r.ok) setSavedAt(new Date().toLocaleTimeString("th-TH")); }).catch(() => {});
    }
  }, [items, draftKey, schedule]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persistDraft, 800);
  }, [persistDraft]);

  useEffect(() => { scheduleSave(); }, [items, scheduleSave]);

  // ── อัปเดตคำตอบ ──
  const updateItem = (idx: number, patch: Partial<RunItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const autoStatusFor = (it: RunItem): AnswerStatus => {
    if (!isNumericItem(it.type)) return it.status;
    if (it.value.trim() === "") return it.status;
    const n = parseFloat(it.value);
    if (isNaN(n)) return it.status;
    const inRange = (it.min_value != null && n < it.min_value) || (it.max_value != null && n > it.max_value);
    return inRange ? "fail" : "pass";
  };

  const handleValue = (idx: number, value: string) => {
    const it = items[idx];
    updateItem(idx, { value, status: value.trim() === "" ? null : autoStatusFor({ ...it, value }) });
  };

  const setStatus = (idx: number, status: AnswerStatus) => {
    updateItem(idx, { status, note: status === "pass" ? items[idx].note : items[idx].note });
  };

  // ── รูปหลักฐาน ──
  const onPickFile = async (idx: number, file: File | null) => {
    const it = items[idx];
    if (!file || !schedule) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      if (navigator.onLine === false) {
        // ออฟไลน์ → เก็บไว้ในเครื่อง รออัปโหลดเมื่อกลับมาออนไลน์
        updateItem(idx, { photos: [...it.photos, { dataUrl, pending: true }] });
        setPending(pendingCount());
        showToast("info", "บันทึกรูปไว้ในเครื่องแล้ว — จะอัปโหลดให้อัตโนมัติเมื่อออนไลน์");
        scheduleSave();
        return;
      }
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const fd = new FormData();
        fd.append("file", blob, "photo.jpg");
        fd.append("item_id", String(it.id));
        const res = await fetch(`/api/v1/inspection_execute.php?action=photo&schedule=${schedule.id}`, { method: "POST", body: fd });
        const json = await res.json();
        if (json.photo) {
          updateItem(idx, { photos: [...it.photos, { id: json.photo.id, path: json.photo.path }] });
          showToast("success", "อัปโหลดรูปหลักฐานแล้ว");
          scheduleSave();
          return;
        }
        updateItem(idx, { photos: [...it.photos, { dataUrl, pending: true, caption: "อัปโหลดผิดพลาด (รอออนไลน์)" }] });
        setError(json.error || "อัปโหลดรูปไม่สำเร็จ");
      } catch (e) {
        console.error(e);
        updateItem(idx, { photos: [...it.photos, { dataUrl, pending: true }] });
        setError("ส่งรูปไม่สำเร็จ — เก็บไว้ในเครื่องแล้ว");
      }
    };
    reader.readAsDataURL(file);
  };

  const flushPendingPhotos = async () => {
    if (!schedule || navigator.onLine === false) return;
    let did = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const pendingOnes = it.photos.filter((p) => p.pending && p.dataUrl);
      for (const ph of pendingOnes) {
        try {
          const blob = await (await fetch(ph.dataUrl!)).blob();
          const fd = new FormData();
          fd.append("file", blob, "photo.jpg");
          fd.append("item_id", String(it.id));
          const res = await fetch(`/api/v1/inspection_execute.php?action=photo&schedule=${schedule.id}`, { method: "POST", body: fd });
          const json = await res.json();
          if (json.photo) {
            did = true;
            updateItem(i, { photos: it.photos.map((x) => x === ph ? { id: json.photo.id, path: json.photo.path } : x) });
          }
        } catch { /* retry on next online */ }
      }
    }
    if (did) { showToast(did ? "success" : "info", "ส่งรูปที่ค้างให้แล้ว"); scheduleSave(); }
  };

  const removePhoto = (idx: number, phIdx: number) => {
    const it = items[idx];
    updateItem(idx, { photos: it.photos.filter((_, i) => i !== phIdx) });
  };

  // ── ความคืบหน้า / validation ──
  const answered = (it: RunItem): boolean => {
    if (isNumericItem(it.type) || it.type === "text" || it.type === "date_time") return it.value.trim() !== "";
    if (it.type === "dropdown") return it.value.trim() !== "";
    return it.status !== null;
  };

  const doneCount = items.filter(answered).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  const failItems = items.filter((it) => it.status === "fail");
  const missingRequired = items.filter((it) => it.is_required && !answered(it));
  const failNoNote = failItems.filter((it) => it.note.trim() === "");
  const remarkMissing = items.filter((it) => it.remark_required && it.note.trim() === "");
  const photoMissing = items.filter((it) => it.photo_required && it.photos.filter((p) => !p.pending).length === 0);
  const valid = missingRequired.length === 0 && failNoNote.length === 0 && remarkMissing.length === 0 && photoMissing.length === 0;

  const handleSubmit = async () => {
    if (!schedule) return;
    if (failNoNote.length) { setError("รายการที่ \"ไม่ผ่าน\" ทุกข้อต้องระบุสาเหตุ/รายละเอียด"); return; }
    if (remarkMissing.length) { setError("รายการที่กำหนด \"หมายเหตุบังคับ\" ต้องกรอกหมายเหตุทุกข้อ"); return; }
    if (missingRequired.length) { setError("ยังมีรายการที่จำเป็นไม่ได้ตอบ"); return; }
    if (photoMissing.length) {
      if (navigator.onLine === false) { setError("ต้องถ่ายรูปหลักฐานครบก่อน — กลับมาออนไลน์แล้วกดบันทึกผลใหม่"); return; }
      setError("รายการที่ต้องถ่ายรูปหลักฐานยังไม่ครบทุกข้อ"); return;
    }

    const body = {
      items: items.map((it) => ({
        item_id: it.id, task: it.task, type: it.type,
        status: it.status === "warn" ? "warn" : it.status === "fail" ? "fail" : "pass",
        value: it.value, note: it.note,
        photo_ids: it.photos.filter((p) => !p.pending && p.id).map((p) => p.id),
      })),
    };

    if (navigator.onLine === false) {
      enqueue({ kind: "inspection", label: `ตรวจเช็ค: ${schedule.template_title || schedule.id}`, url: `/api/v1/inspections.php?action=submit&schedule=${schedule.id}`, method: "POST", body });
      setPending(pendingCount());
      setSubmitting(false);
      showToast("success", "บันทึกผลไว้ในเครื่องแล้ว — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/inspections.php?action=submit&schedule=${schedule.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "บันทึกไม่สำเร็จ"); setSubmitting(false); return; }
      setResult({ result: json.result, fail_count: json.fail_count, repair_id: json.repair_id, maintenance_request_id: json.maintenance_request_id, next_schedule_id: json.next_schedule_id });
      setSchedule((s: any) => ({ ...s, status: "completed", result: json.result, fail_count: json.fail_count }));
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      showToast("success", json.message || "บันทึกผลแล้ว");
      loadMySchedules();
    } catch (e) {
      console.error(e);
      enqueue({ kind: "inspection", label: `ตรวจเช็ค: ${schedule.template_title || schedule.id}`, url: `/api/v1/inspections.php?action=submit&schedule=${schedule.id}`, method: "POST", body });
      setPending(pendingCount());
      setSubmitting(false);
      showToast("success", "เน็ตหลุดระหว่างส่ง — เก็บไว้ในเครื่องแล้ว จะส่งอัตโนมัติเมื่อออนไลน์");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={28} />
        <span className="text-[var(--cmms-text-secondary)]">กำลังโหลดรอบตรวจ...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>INSPECTION RUN · CMMS-TOPPAN</p>
          {!online && (
            <div className="flex w-fit items-center gap-2 rounded-lg px-3.5 py-2.5 text-[0.85rem] font-semibold" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
              <span className="cmms-status-dot warn inline-block" /> ออฟไลน์ — กรอกข้อมูลได้ รอออนไลน์แล้วกดบันทึกผล
            </div>
          )}
          {pending > 0 && (
            <div className="flex w-fit items-center gap-2 rounded-lg px-3.5 py-2.5 text-[0.85rem] font-semibold" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
              <span className="cmms-status-dot warn inline-block" /> มี {pending} รายการค้างส่งในเครื่อง
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>ทำรายการตรวจเช็ค</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden="true" /> รายการไม่ผ่าน → สร้างใบแจ้งซ่อมอัตโนมัติ
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            ตรวจแบบมือถือ — ถ่ายรูปหลักฐาน วัดค่า และบันทึกร่างอัตโนมัติทุกครั้งที่แก้
            {savedAt && <> · บันทึกร่างเมื่อ {savedAt}</>}
          </p>
        </div>
      </div>

      {/* เลือกรอบ */}
      <Card>
        <CardContent className="p-4">
          <div className="max-w-[640px] space-y-1.5">
            <Label>เลือกรอบตรวจ *</Label>
            <Select value={selectedId || "__none__"} onValueChange={(v) => handleSelect(v === "__none__" ? "" : v)} disabled={schedules.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={schedules.length === 0 ? "ไม่มีรอบตรวจที่รอดำเนินการ" : "เลือกรอบตรวจ..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>{schedules.length === 0 ? "ไม่มีรอบตรวจที่รอดำเนินการ" : "เลือกรอบตรวจ..."}</SelectItem>
                {schedules.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedId && !items.length && !loading && (
        <Card><CardContent className="p-5"><p className="text-[var(--cmms-text-secondary)]">กำลังโหลดรายการตรวจ — เลือกอีกรอบถ้าหน้ายังว่าง</p></CardContent></Card>
      )}

      {schedule && items.length > 0 && (
        <div className="max-w-[860px]">
          {/* หัวรอบ + progress */}
          <Card className="overflow-hidden">
            <div className="border-b px-6 py-4" style={{ backgroundColor: "var(--cmms-bg-muted)", borderColor: "var(--cmms-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>{schedule.template_code || "CHK"}</span>
                    <span className="cmms-andon-chip" style={{ background: schedule.status === "completed" ? "var(--cmms-success-light)" : "var(--cmms-warning-light)", color: schedule.status === "completed" ? "var(--cmms-success-dark)" : "var(--cmms-warning-dark)" }}>
                      {schedule.status === "completed" ? "เสร็จสิ้น" : schedule.status === "in_progress" ? "กำลังทำ" : "รอดำเนินการ"}
                    </span>
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                      {TYPE_LABELS ? `${items.length} ข้อ` : ""}
                    </span>
                  </div>
                  <p className="font-bold">{schedule.template_title}</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    {schedule.asset_name}{schedule.asset_code ? ` (${schedule.asset_code})` : ""}
                    {schedule.department_name ? ` • ${schedule.department_name}` : ""}
                    {schedule.location_name ? ` • ${schedule.location_name}` : ""}
                    {schedule.due_date ? ` • ครบกำหนด: ${schedule.due_date}` : ""}
                  </p>
                </div>
                <div className="w-full max-w-[260px] space-y-2 sm:w-[260px]">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--cmms-text-secondary)]">ความก้าวหน้า</span>
                    <span className="font-bold tabular-nums">{doneCount} / {items.length} ข้อ ({pct}%)</span>
                  </div>
                  <Progress value={pct} />
                </div>
              </div>
            </div>

            {/* รายการตรวจ */}
            <div>
              {items.map((item, index) => {
                const isNg = item.status === "fail";
                const isWarn = item.status === "warn";
                const numeric = isNumericItem(item.type);
                const photoUp = item.photos.filter((p) => !p.pending);
                const photoPending = item.photos.filter((p) => p.pending);
                return (
                  <div
                    key={item.id}
                    className="p-5"
                    style={{
                      borderBottom: index < items.length - 1 ? "1px solid var(--cmms-border)" : "none",
                      backgroundColor: isNg ? "var(--cmms-danger-light)" : isWarn ? "var(--cmms-warning-light)" : item.status === "pass" ? "var(--cmms-success-light)" : "transparent",
                    }}
                  >
                    <input ref={(el) => { fileRefs.current[item.id] = el; }} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
                      onChange={(e) => { onPickFile(index, e.target.files?.[0] ?? null); e.target.value = ""; }} />
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-[240px] flex-1 items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold" style={{ backgroundColor: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{index + 1}</div>
                          <div className="flex-1 space-y-1">
                            <p className="font-semibold">
                              {item.task}
                              {!item.is_required && <span className="ml-1 text-xs font-normal text-[var(--cmms-text-muted)]">(ไม่บังคับ)</span>}
                            </p>
                            <p className="text-xs text-[var(--cmms-text-muted)]">{TYPE_LABELS[item.type] || item.type}{item.failure_action === "critical" ? " · วิกฤต (หยุดเครื่อง)" : ""}</p>

                            {/* แสดงผลตามประเภท */}
                            {numeric && (
                              <div className="max-w-[300px] space-y-1 pt-1">
                                <Input
                                  label="ค่า" isLabelHidden inputMode="decimal"
                                  placeholder={item.unit ? `ระบุค่า (${item.unit})...` : "ระบุค่าตัวเลข..."}
                                  value={item.value} onChange={(e) => handleValue(index, e.target.value)}
                                />
                                {item.type === "measurement" && (
                                  <p className="text-xs text-[var(--cmms-text-secondary)]">
                                    เกณฑ์: {item.min_value != null ? item.min_value : "-"} — {item.max_value != null ? item.max_value : "-"} {item.unit || ""}
                                    {item.value.trim() !== "" && (autoStatusFor({ ...item, value: item.value }) === "fail" ? " · เกินเกณฑ์ → ไม่ผ่าน" : " · อยู่ในเกณฑ์")}
                                  </p>
                                )}
                              </div>
                            )}

                            {(item.type === "text") && (
                              <div className="max-w-[420px] pt-1">
                                <Textarea label="รายละเอียด" isLabelHidden placeholder="กรอกรายละเอียด/ข้อความ..." value={item.value} onChange={(e) => handleValue(index, e.target.value)} />
                              </div>
                            )}

                            {(item.type === "date_time") && (
                              <div className="max-w-[300px] pt-1">
                                <Input label="วัน/เวลา" isLabelHidden type="datetime-local" value={item.value} onChange={(e) => handleValue(index, e.target.value)} />
                              </div>
                            )}

                            {item.type === "dropdown" && (
                              <div className="max-w-[320px] pt-1">
                                <Select value={item.value || "__none__"} onValueChange={(v) => updateItem(index, { value: v === "__none__" ? "" : v, status: v === "__none__" ? null : item.status ?? "pass" })}>
                                  <SelectTrigger><SelectValue placeholder="เลือกตัวเลือก..." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__" disabled>เลือกตัวเลือก...</SelectItem>
                                    {item.options.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                                    {item.options.length === 0 && <SelectItem value="__none__" disabled>ยังไม่มีตัวเลือก</SelectItem>}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ปุ่มผล (ไม่ใช่ numeric/text/date) */}
                        {!numeric && item.type !== "text" && item.type !== "date_time" && (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setStatus(index, "pass")} aria-pressed={item.status === "pass"}
                              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 font-semibold transition-all duration-300"
                              style={{ backgroundColor: item.status === "pass" ? "var(--cmms-success)" : "var(--cmms-bg-card)", color: item.status === "pass" ? "white" : "var(--cmms-text-secondary)", borderColor: item.status === "pass" ? "var(--cmms-success)" : "var(--cmms-border)" }}>
                              <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" /> ผ่าน
                            </button>
                            {item.type === "check" && (
                              <button type="button" onClick={() => setStatus(index, "warn")} aria-pressed={item.status === "warn"}
                                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 font-semibold transition-all duration-300"
                                style={{ backgroundColor: item.status === "warn" ? "var(--cmms-warning)" : "var(--cmms-bg-card)", color: item.status === "warn" ? "white" : "var(--cmms-text-secondary)", borderColor: item.status === "warn" ? "var(--cmms-warning)" : "var(--cmms-border)" }}>
                                <Copy size={16} strokeWidth={1.75} aria-hidden="true" /> ข้อสังเกต
                              </button>
                            )}
                            <button type="button" onClick={() => setStatus(index, "fail")} aria-pressed={item.status === "fail"}
                              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 font-semibold transition-all duration-300"
                              style={{ backgroundColor: item.status === "fail" ? "var(--cmms-danger)" : "var(--cmms-bg-card)", color: item.status === "fail" ? "white" : "var(--cmms-text-secondary)", borderColor: item.status === "fail" ? "var(--cmms-danger)" : "var(--cmms-border)" }}>
                              <XCircle size={16} strokeWidth={1.75} aria-hidden="true" /> ไม่ผ่าน
                            </button>
                          </div>
                        )}

                        {/* numeric/text/date: ปุ่ม NG toggle */}
                        {(numeric || item.type === "text" || item.type === "date_time") && (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setStatus(index, "pass")} aria-pressed={item.status === "pass" || (numeric && item.value.trim() !== "" && item.status !== "fail")}
                              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 font-semibold transition-all duration-300"
                              style={{ backgroundColor: item.status === "fail" ? "var(--cmms-bg-card)" : "var(--cmms-success)", color: item.status === "fail" ? "var(--cmms-text-secondary)" : "white", borderColor: "var(--cmms-success)" }}>
                              <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" /> ผ่าน
                            </button>
                            <button type="button" onClick={() => setStatus(index, "fail")} aria-pressed={item.status === "fail"}
                              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 font-semibold transition-all duration-300"
                              style={{ backgroundColor: item.status === "fail" ? "var(--cmms-danger)" : "var(--cmms-bg-card)", color: item.status === "fail" ? "white" : "var(--cmms-text-secondary)", borderColor: "var(--cmms-danger)" }}>
                              <XCircle size={16} strokeWidth={1.75} aria-hidden="true" /> NG
                            </button>
                            <button type="button" onClick={() => updateItem(index, { status: null })}
                              className="inline-flex items-center gap-1 rounded-md border border-dashed px-3 py-2 font-medium"
                              style={{ color: "var(--cmms-text-secondary)", borderColor: "var(--cmms-border)" }}>
                              ล้าง
                            </button>
                          </div>
                        )}
                      </div>

                      {/* กล่อง NG / warning */}
                      {(isNg || isWarn || item.remark_required) && (
                        <div className="ml-10 rounded-lg border border-dashed p-3.5" style={{ backgroundColor: "var(--cmms-bg-card)", borderColor: isNg ? "var(--cmms-danger)" : "var(--cmms-warning)" }}>
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: isNg ? "var(--cmms-danger)" : "var(--cmms-warning-dark)" }} />
                              <p className="font-semibold" style={{ color: isNg ? "var(--cmms-danger)" : "var(--cmms-warning-dark)" }}>
                                {isNg ? "พบความผิดปกติ — ระบุรายละเอียด" : item.remark_required ? "ระบุหมายเหตุ (จำเป็น)" : "ข้อสังเกต"}
                              </p>
                            </div>
                            <Textarea label="สาเหตุที่พบ / หมายเหตุ" aria-label={`สาเหตุที่พบ / หมายเหตุ ข้อที่ ${index + 1}`} placeholder="อธิบายอาการ/รายละเอียด..." value={item.note} onChange={(e) => updateItem(index, { note: e.target.value })} />
                          </div>
                        </div>
                      )}

                      {/* รูปหลักฐาน */}
                      <div className="ml-10 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => fileRefs.current[item.id]?.click()}
                          className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-all duration-300"
                          style={{ background: item.photo_required ? "var(--cmms-primary-light)" : "var(--cmms-bg-muted)", color: "var(--cmms-primary-hover)", borderColor: "var(--cmms-border)" }}>
                          <Camera size={14} strokeWidth={1.75} aria-hidden="true" />
                          {item.photo_required ? "ถ่ายรูปหลักฐาน *" : "ถ่ายรูปเพิ่ม"}
                        </button>
                        {item.photos.map((ph, pi) => (
                          <div key={pi} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ph.dataUrl || ph.path} alt={`หลักฐานข้อ ${index + 1} รูปที่ ${pi + 1}`} className="h-16 w-20 rounded-lg border object-cover" style={{ borderColor: ph.pending ? "var(--cmms-warning)" : "var(--cmms-border)", opacity: ph.pending ? 0.6 : 1 }} />
                            {ph.pending && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "rgba(0,0,0,0.35)" }}>รอส่ง</span>}
                            <button type="button" aria-label={`ลบรูปข้อ ${index + 1}`} onClick={() => removePhoto(index, pi)}
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ background: "var(--cmms-danger)" }}>×</button>
                          </div>
                        ))}
                        {item.photo_required && item.photos.length === 0 && (
                          <span className="text-xs text-[var(--cmms-danger)]">ยังไม่มีรูปหลักฐาน</span>
                        )}
                        {photoPending.length > 0 && <Loader2 size={14} className="animate-spin text-[var(--cmms-warning-dark)]" aria-hidden="true" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* บันทึกผล */}
            <div className="border-t px-5 py-5" style={{ backgroundColor: "var(--cmms-bg-muted)", borderColor: "var(--cmms-border)" }}>
              <div className="space-y-3">
                {/* ผลลัพธ์ภายหลัง submit */}
                {result && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3.5"
                    style={{ backgroundColor: result.result === "pass" ? "var(--cmms-success-light)" : "var(--cmms-danger-light)", borderColor: result.result === "pass" ? "var(--cmms-success)" : "var(--cmms-danger)" }}>
                    {result.repair_id ? <Wrench size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-danger)" }} /> : <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-success)" }} />}
                    <p className="font-semibold" style={{ color: result.result === "pass" ? "var(--cmms-success-dark)" : "var(--cmms-danger)" }}>
                      {result.result === "pass" ? "ผ่านทุกรายการ" : result.result === "pass_with_warning" ? "ผ่านทุกรายการ (มีข้อสังเกต)" : `ไม่ผ่าน ${result.fail_count} รายการ`}
                    </p>
                    {result.next_schedule_id && (
                      <a href={`/inspections/run?schedule_id=${result.next_schedule_id}`} className="cmms-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white">รอบถัดไป →</a>
                    )}
                    {result.repair_id && <a href="/repair" className="cmms-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white">ดูใบแจ้งซ่อม →</a>}
                    <a href="/inspections" className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>ไปหน้ารอบตรวจ</a>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[var(--cmms-text-secondary)]">
                    ตรวจให้ครบทุกข้อก่อนบันทึก — ข้อที่ไม่ผ่านต้องมีสาเหตุ
                    {!valid && schedule.status !== "completed" && (
                      <span className="ml-1 font-semibold" style={{ color: "var(--cmms-danger)" }}>
                        (ค้าง: ขาด {missingRequired.length + failNoNote.length + remarkMissing.length + photoMissing.length} จุด)
                      </span>
                    )}
                  </p>
                  {schedule.status !== "completed" ? (
                    <button type="button" disabled={submitting || !valid} onClick={handleSubmit}
                      className="cmms-btn-primary inline-flex items-center gap-2 rounded-[var(--cmms-radius)] px-6 py-3 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-50">
                      {submitting ? <Loader2 size={16} className="animate-spin" strokeWidth={1.75} aria-hidden="true" /> : <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />}
                      {submitting ? "กำลังส่งข้อมูล..." : "บันทึกผลการตรวจ"}
                    </button>
                  ) : (
                    <span className="cmms-status ok"><span className="cmms-status-dot" />บันทึกผลแล้ว</span>
                  )}
                </div>
                {savedAt && <p className="text-xs text-[var(--cmms-text-muted)] flex items-center gap-1"><Save size={12} strokeWidth={1.75} aria-hidden="true" /> บันทึกร่างอัตโนมัติล่าสุด {savedAt}</p>}
              </div>
            </div>
          </Card>
        </div>
      )}

      {schedule && items.length === 0 && !loading && (
        <div className="max-w-[860px]">
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <ListChecks size={32} strokeWidth={1.5} aria-hidden="true" className="text-[var(--cmms-secondary)]" />
              <p className="font-semibold">{schedule.template_title}</p>
              <p className="text-sm text-[var(--cmms-text-secondary)]">Template นี้ยังไม่มีรายการตรวจแก้ไขที่ Template</p>
              <a href="/inspections/templates" className="cmms-btn-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white">ไปจัดการ Template</a>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}