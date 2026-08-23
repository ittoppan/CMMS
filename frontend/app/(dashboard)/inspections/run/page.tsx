"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { enqueue, pendingCount, subscribeOnline } from "@/lib/offlineQueue";

interface RunItem {
  item_id: number | null;
  task: string;
  type: "check" | "value";
  standard: string;
  min_value: number | null;
  max_value: number | null;
  unit: string;
  status: "pass" | "fail" | null;
  value: string;
  note: string;
  autoFailed?: boolean;
}

export default function InspectionRunPage() {
  const [schedules, setSchedules] = useState<{ value: string; label: string; raw: any }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState("");
  const [schedule, setSchedule] = useState<any>(null);
  const [items, setItems] = useState<RunItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(0);
  const { showToast } = useToast();
  const [createdRepair, setCreatedRepair] = useState<{ repair_id: number | null; message: string } | null>(null);
  const qrPrefillRef = useRef<{ scheduleId?: string; assetCode?: string } | null>(null);

  useEffect(() => {
    setPending(pendingCount());
    const off = subscribeOnline(() => setPending(pendingCount()));
    return off;
  }, []);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const scheduleId = p.get("schedule_id")?.trim();
      const assetCode = p.get("asset_code")?.trim().toUpperCase();
      if (scheduleId || assetCode) qrPrefillRef.current = { scheduleId, assetCode };
    } catch { /* ignore */ }
  }, []);

  const fetchSchedules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/inspections.php?schedules=1");
      const json = await res.json();
      if (!Array.isArray(json)) return;
      const open = json.filter((s: any) => s.status !== "completed");

      let list = open;
      const prefill = qrPrefillRef.current;
      if (prefill?.scheduleId) {
        list = open.filter((s: any) => String(s.id) === prefill.scheduleId);
      } else if (prefill?.assetCode) {
        list = open.filter((s: any) => String(s.asset_code || "").toUpperCase() === prefill.assetCode);
      }

      setSchedules(list.map((s: any) => ({
        value: String(s.id),
        label: `${s.template_title || `Template #${s.template_id}`} — ${s.asset_name || `เครื่อง #${s.asset_id}`}${s.due_date ? ` (ครบ ${s.due_date})` : ""}`,
        raw: s,
      })));

      if (list.length === 1) {
        setSelectedId(String(list[0].id));
        await loadSchedule(list[0].id);
      } else if (list.length === 0 && prefill?.assetCode) {
        setError(`เครื่อง ${prefill.assetCode} ไม่มีรอบตรวจที่รอดำเนินการ (pending / in_progress)`);
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดรอบตรวจได้");
    }
    setLoading(false);
  };

  useEffect(() => { fetchSchedules(); }, []);

  const loadSchedule = async (id: number | string) => {
    setError(null);
    setCreatedRepair(null);
    try {
      const res = await fetch(`/api/v1/inspections.php?schedule=${id}`);
      const s = await res.json();
      if (!s.id) { setError(s.error || "ไม่พบรอบตรวจ"); return; }
      setSchedule(s);

      // results เดิม (ถ้ามี) สำหรับแสดง
      const old = new Map<string, any>((s.results || []).map((r: any) => [String(r.item_id), r] as [string, any]));
      setItems((s.items || []).map((it: any) => {
        const prev = old.get(it.id);
        const isValue = it.type === "value";
        const val = prev?.value || "";
        let autoFailed = false;
        if (isValue && val !== "") {
          const n = parseFloat(val);
          if (!isNaN(n)) {
            if (it.max_value != null && n > parseFloat(it.max_value)) autoFailed = true;
            if (it.min_value != null && n < parseFloat(it.min_value)) autoFailed = true;
          }
        }
        return {
          item_id: it.id,
          task: it.task,
          type: it.type,
          standard: it.standard || "",
          min_value: it.min_value != null ? parseFloat(it.min_value) : null,
          max_value: it.max_value != null ? parseFloat(it.max_value) : null,
          unit: it.unit || "",
          status: prev?.status || (isValue && autoFailed ? "fail" : isValue ? "pass" : null),
          value: val,
          note: prev?.note || "",
          autoFailed,
        };
      }));
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดรายการตรวจได้");
    }
  };

  const handleSelect = async (value: string) => {
    setSelectedId(value);
    await loadSchedule(value);
  };

  const handleStatus = (idx: number, status: "pass" | "fail") => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status, note: status === "pass" ? "" : it.note } : it)));
  };

  const handleValue = (idx: number, value: string) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const n = parseFloat(value);
      let autoFailed = false;
      if (!isNaN(n)) {
        if (it.max_value != null && n > it.max_value) autoFailed = true;
        if (it.min_value != null && n < it.min_value) autoFailed = true;
      }
      return { ...it, value, autoFailed, status: value.trim() === "" ? null : autoFailed ? "fail" : "pass" };
    }));
  };

  const handleNote = (idx: number, note: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, note } : it)));
  };

  const allFilled =
    items.length > 0 &&
    items.every((it) => (it.type === "value" ? it.value.trim() !== "" : it.status !== null)) &&
    items.every((it) => (it.status !== "fail" || it.note.trim() !== ""));

  const handleSubmit = async () => {
    if (!schedule) return;
    if (items.some((it) => it.status === "fail" && it.note.trim() === "")) {
      setError("รายการที่ \"ไม่ผ่าน\" ต้องระบุสาเหตุ/รายละเอียดทุกข้อ");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      items: items.map((it) => ({ item_id: it.item_id, task: it.task, type: it.type, status: it.status === "fail" ? "fail" : "pass", value: it.value, note: it.note })),
    };
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueue({ kind: "inspection", label: `ตรวจเช็ค: ${schedule.title || schedule.id}`, url: `/api/v1/inspections.php?action=submit&schedule=${schedule.id}`, method: "POST", body });
        setPending(pendingCount());
        setSubmitting(false);
        showToast("success", "บันทึกผลตรวจไว้ในเครื่องแล้ว — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์");
        fetchSchedules();
        return;
      }
      const res = await fetch(`/api/v1/inspections.php?action=submit&schedule=${schedule.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "บันทึกไม่สำเร็จ"); setSubmitting(false); return; }
      showToast("success", json.message || "บันทึกผลแล้ว");
      setCreatedRepair({ repair_id: json.repair_id, message: json.message });
      if (json.repair_id) {
        setSchedule((s: any) => ({ ...s, status: "completed", result: json.result, fail_count: json.fail_count }));
        setItems((prev) => prev.map((it) => ({ ...it, status: it.status })));
      }
      fetchSchedules();
    } catch (e) {
      console.error(e);
      // เน็ตหลุดระหว่างส่ง → เก็บในเครื่อง รอส่งอัตโนมัติ
      enqueue({ kind: "inspection", label: `ตรวจเช็ค: ${schedule.title || schedule.id}`, url: `/api/v1/inspections.php?action=submit&schedule=${schedule.id}`, method: "POST", body });
      setPending(pendingCount());
      showToast("success", "บันทึกผลตรวจไว้ในเครื่องแล้ว — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์");
      fetchSchedules();
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

          {pending > 0 && (
            <div
              className="flex w-fit items-center gap-2 rounded-lg px-3.5 py-2.5 text-[0.85rem] font-semibold"
              style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}
            >
              <span className="cmms-status-dot warn inline-block" />
              มี {pending} รายการที่บันทึกไว้ในเครื่อง — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>ทำรายการตรวจเช็ค</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden="true" /> รายการไม่ผ่าน → แจ้งช่างซ่อมทันที
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            บันทึกผลตรวจรายข้อ — ตรวจค่า ผ่าน/ไม่ผ่าน และเพิ่มหมายเหตุตามจริง
          </p>
        </div>
      </div>

      {/* เลือกรอบ */}
      <Card>
        <CardContent className="p-4">
          <div className="max-w-[640px] space-y-1.5">
            <Label>เลือกรอบตรวจ *</Label>
            <Select
              value={selectedId || "__none__"}
              onValueChange={(v) => handleSelect(v === "__none__" ? "" : v)}
              disabled={schedules.length === 0}
            >
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
          {schedules.length === 0 && (
            <p className="mt-2 text-sm text-[var(--cmms-text-secondary)]">ไม่พบรอบตรวจที่รอดำเนินการ — ไปที่ &quot;ตรวจเช็ครอบ&quot; เพื่อสร้างรอบ</p>
          )}
        </CardContent>
      </Card>

      {schedule && (
        <div className="max-w-[860px]">
          <Card className="overflow-hidden">
            {/* หัวรอบ */}
            <div className="border-b px-6 py-4" style={{ backgroundColor: "var(--cmms-bg-muted)", borderColor: "var(--cmms-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>{schedule.template_code || "CHK"}</span>
                    <span className="cmms-andon-chip" style={{ background: schedule.status === "completed" ? "var(--cmms-success-light)" : "var(--cmms-warning-light)", color: schedule.status === "completed" ? "var(--cmms-success-dark)" : "var(--cmms-warning-dark)" }}>
                      {schedule.status === "completed" ? "เสร็จสิ้น" : schedule.status === "in_progress" ? "กำลังทำ" : "รอดำเนินการ"}
                    </span>
                    {schedule.result && (
                      <span className="cmms-andon-chip" style={{ background: schedule.result === "pass" ? "var(--cmms-success-light)" : "var(--cmms-danger-light)", color: schedule.result === "pass" ? "var(--cmms-success-dark)" : "var(--cmms-danger-dark)" }}>
                        {schedule.result === "pass" ? "ผ่านทุกรายการ" : `ไม่ผ่าน ${schedule.fail_count} รายการ`}
                      </span>
                    )}
                  </div>
                  <p className="font-bold">{schedule.template_title}</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    {schedule.asset_name}{schedule.asset_code ? ` (${schedule.asset_code})` : ""}
                    {schedule.assignee_name ? ` • ${schedule.assignee_name}` : ""}
                    {schedule.due_date ? ` • ครบกำหนด: ${schedule.due_date}` : ""}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-sm font-semibold text-[var(--cmms-text-secondary)]">ความก้าวหน้า</p>
                  <p className="font-bold">{items.filter((i) => (i.type === "value" ? i.value.trim() !== "" : i.status !== null)).length} / {items.length} ข้อ</p>
                </div>
              </div>
            </div>

            {/* รายการตรวจ */}
            <div>
              {items.map((item, index) => {
                const isNg = item.status === "fail";
                return (
                  <div
                    key={item.item_id ?? index}
                    className="p-5"
                    style={{
                      borderBottom: index < items.length - 1 ? "1px solid var(--cmms-border)" : "none",
                      backgroundColor: isNg ? "var(--cmms-danger-light)" : item.status === "pass" ? "var(--cmms-success-light)" : "transparent",
                    }}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-[240px] flex-1 items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold" style={{ backgroundColor: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                            {index + 1}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="font-semibold">{item.task}</p>
                            {item.type === "value" && (
                              <div className="max-w-[300px] space-y-1">
                                <Input
                                  label="ค่า"
                                  isLabelHidden
                                  inputMode="decimal"
                                  placeholder={item.unit ? `ระบุค่า (${item.unit})...` : "ระบุค่าตัวเลข..."}
                                  value={item.value}
                                  onChange={(e) => handleValue(index, e.target.value)}
                                />
                                <p className="text-sm text-[var(--cmms-text-secondary)]">
                                  เกณฑ์: {item.min_value != null ? item.min_value : "-"} — {item.max_value != null ? item.max_value : "-"} {item.unit || ""}{item.standard ? ` (${item.standard})` : ""}
                                  {item.autoFailed && item.value !== "" ? " • เกินเกณฑ์ → ไม่ผ่านอัตโนมัติ" : ""}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {item.type === "check" && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleStatus(index, "pass")}
                              aria-pressed={item.status === "pass"}
                              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 font-semibold transition-all duration-300"
                              style={{
                                backgroundColor: item.status === "pass" ? "var(--cmms-success)" : "var(--cmms-bg-card)",
                                color: item.status === "pass" ? "white" : "var(--cmms-text-secondary)",
                                borderColor: item.status === "pass" ? "var(--cmms-success)" : "var(--cmms-border)",
                              }}
                            >
                              <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" /> ผ่าน
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatus(index, "fail")}
                              aria-pressed={item.status === "fail"}
                              className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 font-semibold transition-all duration-300"
                              style={{
                                backgroundColor: item.status === "fail" ? "var(--cmms-danger)" : "var(--cmms-bg-card)",
                                color: item.status === "fail" ? "white" : "var(--cmms-text-secondary)",
                                borderColor: item.status === "fail" ? "var(--cmms-danger)" : "var(--cmms-border)",
                              }}
                            >
                              <XCircle size={16} strokeWidth={1.75} aria-hidden="true" /> ไม่ผ่าน
                            </button>
                          </div>
                        )}
                      </div>

                      {isNg && (
                        <div className="ml-10 rounded-lg border border-dashed p-3.5" style={{ backgroundColor: "var(--cmms-bg-card)", borderColor: "var(--cmms-danger)" }}>
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-danger)" }} />
                              <p className="font-semibold" style={{ color: "var(--cmms-danger)" }}>พบความผิดปกติ (NG) — ระบุรายละเอียด (จำเป็น)</p>
                            </div>
                            <Textarea
                              label="สาเหตุที่พบ / หมายเหตุ *"
                              aria-label={`สาเหตุที่พบ / หมายเหตุ ข้อที่ ${index + 1}`}
                              placeholder="อธิบายอาการผิดปกติที่พบ..."
                              value={item.note}
                              onChange={(e) => handleNote(index, e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ส่งผล */}
            <div className="border-t px-5 py-5" style={{ backgroundColor: "var(--cmms-bg-muted)", borderColor: "var(--cmms-border)" }}>
              <div className="space-y-3">
                {createdRepair && createdRepair.repair_id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3.5" style={{ backgroundColor: "var(--cmms-danger-light)", borderColor: "var(--cmms-danger)" }}>
                    <Wrench size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-danger)" }} />
                    <p className="font-semibold" style={{ color: "var(--cmms-danger)" }}>ระบบสร้างใบแจ้งซ่อมอัตโนมัติแล้ว (มีความเสี่ยงเครื่องหยุด)</p>
                    <a href="/repair" className="cmms-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white">
                      ดูใบแจ้งซ่อม →
                    </a>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[var(--cmms-text-secondary)]">ตรวจให้ครบทุกข้อก่อนบันทึก — ข้อที่ไม่ผ่านต้องมีสาเหตุ</p>
                  {schedule.status !== "completed" ? (
                    <button
                      type="button"
                      disabled={submitting || !allFilled}
                      onClick={handleSubmit}
                      className="cmms-btn-primary inline-flex items-center gap-2 rounded-[var(--cmms-radius)] px-6 py-3 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-50"
                    >
                      <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                      {submitting ? "กำลังส่งข้อมูล..." : "บันทึกผลการตรวจ"}
                    </button>
                  ) : (
                    <span className="cmms-status ok"><span className="cmms-status-dot" />บันทึกผลแล้ว</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
