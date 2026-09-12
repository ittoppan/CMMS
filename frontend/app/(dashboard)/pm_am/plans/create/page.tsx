"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import SuccessDialog from "@/components/SuccessDialog";
import { CheckCircle2, Plus, Search, X } from "lucide-react";

const FREQ_OPTIONS: { value: string; label: string }[] = [
  { value: "daily", label: "รายวัน" },
  { value: "weekly", label: "รายสัปดาห์" },
  { value: "monthly", label: "รายเดือน" },
  { value: "quarterly", label: "ทุก 3 เดือน" },
  { value: "semi_annual", label: "ทุก 6 เดือน" },
  { value: "yearly", label: "รายปี" },
  { value: "custom", label: "กำหนดเอง (วัน)" },
  { value: "meter_based", label: "ตามมิเตอร์ (Meter-Based)" },
];

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];
const TYPE_OPTIONS = ["single", "group", "usage_based"];
const STATUS_OPTIONS = ["draft", "active", "cancelled"];

export default function PMPlanFormPage() {
  const hero = usePageHero("pm_am/plans");
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit") ? Number(params.get("edit")) : 0;

  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    instructions: "",
    priority: "medium",
    estimated_duration_minutes: "",
    start_date: "",
    end_date: "",
    plan_type: "single",
    frequency_type: "monthly",
    frequency_interval: "1",
    meter_unit: "",
    meter_interval: "",
    lead_days: "7",
    reminder_days: "3",
    is_active: 1,
    status: "active",
    responsible_user_id: "",
    department_id: "",
    location_id: "",
  });
  const [assetIds, setAssetIds] = useState<number[]>([]);
  const [templateIds, setTemplateIds] = useState<number[]>([]);
  // อะไหล่ตามแผน (Sage Item Code) — plain row; generate_wo จะ snapshot เป็น Pending Issue
  const [plannedParts, setPlannedParts] = useState<{ sage_item_code: string; item_description: string; unit?: string; qty: number; note?: string }[]>([]);
  const [ppSearch, setPpSearch] = useState("");
  const [ppResults, setPpResults] = useState<any[]>([]);
  const [ppSearching, setPpSearching] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/v1/asset_registry.php")
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j)) setAssets(j); })
      .catch(() => {});
    fetch("/api/v1/index.php?resource=users")
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
        setUsers(list);
      })
      .catch(() => {});
    fetch("/api/v1/checklist_templates.php")
      .then((r) => r.json())
      .then((j) => { if (j?.status === "success" && Array.isArray(j.data)) setTemplates(j.data); })
      .catch(() => {});
  }, []);

  // โหมดแก้ไข — โหลดข้อมูลแผนเดิม
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const res = await fetch(`/api/v1/pm_plans.php?id=${editId}`, { credentials: "include" });
        const j = await res.json();
        if (j?.status !== "success" || !j.data) { setLoadErr(j?.error || "โหลดแผนไม่สำเร็จ"); return; }
        const p = j.data;
        setForm({
          code: p.code || "",
          name: p.name || "",
          description: p.description || "",
          instructions: p.instructions || "",
          priority: p.priority || "medium",
          estimated_duration_minutes: p.estimated_duration_minutes != null ? String(p.estimated_duration_minutes) : "",
          start_date: p.start_date || "",
          end_date: p.end_date || "",
          plan_type: p.plan_type || "single",
          frequency_type: p.frequency_type || "monthly",
          frequency_interval: String(p.frequency_interval || 1),
          meter_unit: p.meter_unit || "",
          meter_interval: p.meter_interval != null ? String(p.meter_interval) : "",
          lead_days: String(p.lead_days ?? 7),
          reminder_days: String(p.reminder_days ?? 3),
          is_active: p.is_active === 1 ? 1 : 0,
          status: p.status || "active",
          responsible_user_id: p.responsible_user_id ? String(p.responsible_user_id) : "",
          department_id: p.department_id ? String(p.department_id) : "",
          location_id: p.location_id ? String(p.location_id) : "",
        });
        setAssetIds((p.assets || []).map((a: any) => a.id));
        setTemplateIds((p.templates || []).map((t: any) => t.id));
        setPlannedParts((p.planned_parts || []).map((x: any) => ({
          sage_item_code: x.sage_item_code || "",
          item_description: x.item_description || "",
          unit: x.unit || "",
          qty: Number(x.qty) || 1,
          note: x.note || "",
        })));
      } catch {
        setLoadErr("ไม่สามารถเชื่อมต่อระบบได้");
      }
    })();
  }, [editId]);

  const isMeter = form.frequency_type === "meter_based";

  const toggleAsset = (id: number) =>
    setAssetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleTemplate = (id: number) =>
    setTemplateIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // ค้นหา Item ใน Sage 300 (debounce) สำหรับอะไหล่ตามแผน
  useEffect(() => {
    const q = ppSearch.trim();
    if (!q) { setPpResults([]); return; }
    setPpSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/sage_items.php?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const j = await res.json();
        setPpResults(Array.isArray(j.items) ? j.items : []);
      } catch {
        setPpResults([]);
      }
      setPpSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [ppSearch]);

  const addPlannedPart = (item: any, qty = 1) => {
    if (!item?.item_no) return;
    setPlannedParts(prev => {
      const ex = prev.find((x) => x.sage_item_code.toLowerCase() === String(item.item_no).toLowerCase());
      if (ex) return prev.map((x) => (x.sage_item_code.toLowerCase() === String(item.item_no).toLowerCase() ? { ...x, qty: x.qty + qty } : x));
      return [...prev, { sage_item_code: item.item_no, item_description: item.description || "", unit: item.unit || "", qty }];
    });
    setPpSearch("");
    setPpResults([]);
  };

  const removePlannedPart = (i: number) => setPlannedParts(prev => prev.filter((_, idx) => idx !== i));
  const setPlannedQty = (i: number, qty: number) =>
    setPlannedParts(prev => prev.map((x, idx) => (idx === i ? { ...x, qty: Math.max(1, qty || 1) } : x)));

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("กรุณาระบุรหัสแผน และชื่อแผน");
      return;
    }
    if (assetIds.length === 0) {
      setError("กรุณาเลือกเครื่องจักรอย่างน้อย 1 เครื่อง");
      return;
    }
    if (isMeter && !form.meter_interval) {
      setError("แผนแบบ Meter-Based ต้องระบุรอบตามมิเตอร์ (meter interval)");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body = {
        ...form,
        frequency_interval: Number(form.frequency_interval) || 1,
        estimated_duration_minutes: form.estimated_duration_minutes ? Number(form.estimated_duration_minutes) : null,
        meter_interval: isMeter && form.meter_interval ? Number(form.meter_interval) : null,
        responsible_user_id: form.responsible_user_id ? Number(form.responsible_user_id) : null,
        department_id: form.department_id ? Number(form.department_id) : null,
        location_id: form.location_id ? Number(form.location_id) : null,
        asset_ids: assetIds,
        template_ids: templateIds,
        planned_parts: plannedParts,
        is_active: form.is_active,
      };
      const url = editId ? `/api/v1/pm_plans.php?id=${editId}` : "/api/v1/pm_plans.php";
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.success || j.id) {
        setSubmitted(true);
      } else {
        setError(j.error || "บันทึกไม่สำเร็จ");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title={editId ? "บันทึกแผนเรียบร้อย" : "สร้างแผน PM สำเร็จ!"}
        message={<>แผน <strong>{form.name}</strong> ({form.code}) ถูกบันทึกแล้ว</>}
        primaryLabel="ไปหน้ารายการแผน"
        onPrimary={() => router.push("/pm_am/plans")}
        onBackdrop={() => router.push("/pm_am/plans")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM PLAN · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>
              {editId ? "แก้ไขแผนบำรุงรักษา" : "สร้างแผนบำรุงรักษาใหม่"}
            </h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>PM Master</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>กำหนดแผน Preventive Maintenance แบบแม่แบบ — สร้างรอบอัตโนมัติตามความถี่</p>
        </div>
      </div>

      <Card>
        <CardContent className="mx-auto max-w-[720px] space-y-5 p-6">
          {loadErr && <Alert variant="danger" description={loadErr} />}
          {error && <Alert variant="danger" description={error} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="รหัสแผน (PM Code) *" placeholder="เช่น PM-PUMP-001" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input label="ชื่อแผน *" placeholder="เช่น ตรวจเช็คปั๊มน้ำประจำเดือน" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--cmms-text-primary)]">ประเภทแผน</label>
              <Select value={form.plan_type} onValueChange={(v) => setForm({ ...form, plan_type: v })}>
                <SelectTrigger aria-label="ประเภทแผน"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>{o === "single" ? "เครื่องเดียว" : o === "group" ? "กลุ่มเครื่อง" : "ตามการใช้งาน"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--cmms-text-primary)]">ความเร่งด่วน</label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger aria-label="ความเร่งด่วน"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>{o === "low" ? "ต่ำ" : o === "medium" ? "กลาง" : o === "high" ? "สูง" : "ฉุกเฉิน"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input label="ระยะเวลาโดยประมาณ (นาที)" type="number" min={0} placeholder="เช่น 60" value={form.estimated_duration_minutes}
              onChange={(e) => setForm({ ...form, estimated_duration_minutes: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--cmms-text-primary)]">ความถี่ *</label>
              <Select value={form.frequency_type} onValueChange={(v) => setForm({ ...form, frequency_type: v })}>
                <SelectTrigger aria-label="ความถี่"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQ_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input label={isMeter ? "รอบตามมิเตอร์ (ค่าเริ่มต้น)" : "จำนวนรอบ (Interval)"}
              type="number" min={1} value={isMeter ? (form.meter_interval || "") : form.frequency_interval}
              onChange={(e) => isMeter
                ? setForm({ ...form, meter_interval: e.target.value })
                : setForm({ ...form, frequency_interval: e.target.value })} />
            {isMeter && (
              <Input label="หน่วยมิเตอร์" placeholder="เช่น ชม. / km / รอบ" value={form.meter_unit}
                onChange={(e) => setForm({ ...form, meter_unit: e.target.value })} />
            )}
          </div>

          {isMeter && (
            <div className="rounded-[10px] border p-3 text-sm" style={{ borderColor: "var(--cmms-info, #0284c7)", background: "var(--cmms-info-light, #e0f2fe)" }}>
              Plan แบบ Meter-Based: ระบบจะนับรอบตามค่ามิเตอร์การใช้งาน (hours / distance / cycles) — เมื่อค่ามิเตอร์อ่านได้ถึงรอบถัดไป จะสร้างงาน PM ให้อัตโนมัติ
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="วันเริ่มแผน" type="date" value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Input label="วันสิ้นสุดแผน (เว้นว่าง = ต่อเนื่อง)" type="date" value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--cmms-text-primary)]">ผู้รับผิดชอบ (Responsible)</label>
              <Select value={form.responsible_user_id || "__none__"} onValueChange={(v) => setForm({ ...form, responsible_user_id: v === "__none__" ? "" : v })}>
                <SelectTrigger aria-label="ผู้รับผิดชอบ"><SelectValue placeholder="เลือกผู้รับผิดชอบ..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ไม่ระบุ</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.full_name || u.username || `#${u.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--cmms-text-primary)]">สถานะ</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger aria-label="สถานะ"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>{o === "draft" ? "ร่าง (Draft)" : o === "active" ? "เปิดใช้งาน (Active)" : "ยกเลิก (Cancelled)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Textarea label="ขั้นตอน / คำแนะนำ (Instructions)" rows={4} placeholder="ขั้นตอนการตรวจเช็ค คำแนะนำความปลอดภัย มาตรฐานที่ต้องปฏิบัติ..."
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          <Textarea label="รายละเอียด (Description)" rows={2} placeholder="รายละเอียดเพิ่มเติมของแผน"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />

          {/* ── เลือกเครื่องจักร ── */}
          <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--cmms-border)" }}>
            <p className="font-bold">เครื่องจักรในแผน * ({assetIds.length} เครื่อง)</p>
            <div className="grid max-h-[220px] gap-1.5 overflow-y-auto rounded-[10px] border p-2"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", borderColor: "var(--cmms-border)" }}>
              {assets.map((a) => {
                const checked = assetIds.includes(a.id);
                return (
                  <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5"
                    style={{ background: checked ? "var(--cmms-primary-wash)" : "transparent" }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleAsset(a.id)} />
                    <span className={`truncate text-sm ${checked ? "font-semibold" : ""}`}>{a.code} - {a.name}</span>
                  </label>
                );
              })}
              {assets.length === 0 && <p className="text-sm text-[var(--cmms-text-muted)]">ยังไม่มีเครื่องจักรในระบบ</p>}
            </div>
          </div>

          {/* ── เลือก Checklist ── */}
          <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--cmms-border)" }}>
            <div className="flex items-center justify-between">
              <p className="font-bold">Checklist Templates ({templateIds.length} ชุด)</p>
              <a href="/pm_am/checklists" className="text-sm font-semibold text-[var(--cmms-primary-hover)]">จัดการเทมเพลต →</a>
            </div>
            <div className="grid max-h-[220px] gap-1.5 overflow-y-auto rounded-[10px] border p-2"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", borderColor: "var(--cmms-border)" }}>
              {templates.map((tpl) => {
                const checked = templateIds.includes(tpl.id);
                return (
                  <label key={tpl.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5"
                    style={{ background: checked ? "var(--cmms-primary-wash)" : "transparent" }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTemplate(tpl.id)} />
                    <span className={`truncate text-sm ${checked ? "font-semibold" : ""}`}>{tpl.code} - {tpl.name}</span>
                  </label>
                );
              })}
              {templates.length === 0 && <p className="text-sm text-[var(--cmms-text-muted)]">ยังไม่มี Checklist Template</p>}
            </div>
          </div>

          {/* ── อะไหล่ตามแผน (Sage Item Code) ── */}
          <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--cmms-border)" }}>
            <div className="flex items-center justify-between">
              <p className="font-bold">อะไหล่ตามแผน ({plannedParts.length} รายการ)</p>
              <span className="text-xs text-[var(--cmms-text-muted)]">
                อ้างอิงด้วย Sage Item Code — เมื่อ generate Work Order จะสร้าง Pending Issue ให้คลังจัดของจริง
              </span>
            </div>

            <div className="relative">
              <Search size={16} strokeWidth={1.75} aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="ค้นหา Item Code / ชื่ออะไหล่ใน Sage 300 (เช่น SUP001 · O-RING) และกด + เพื่อเพิ่ม..."
                value={ppSearch}
                onChange={(e) => setPpSearch(e.target.value)}
                aria-label="ค้นหาอะไหล่ตามแผน"
              />
            </div>

            {ppSearching ? (
              <p className="text-xs text-[var(--cmms-text-muted)]">กำลังค้นหาบน Sage 300…</p>
            ) : ppResults.length > 0 ? (
              <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: "var(--cmms-border)" }}>
                <table className="w-full text-sm">
                  <tbody className="divide-y" style={{ borderColor: "var(--cmms-border)" }}>
                    {ppResults.map((it) => (
                      <tr key={it.item_no}>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs font-semibold">{it.item_no}</span>
                          <div className="text-xs text-[var(--cmms-text-muted)]">
                            {it.description} ({it.unit})
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`mr-2 text-xs font-bold ${Number(it.available) > 0 ? "text-emerald-600" : "text-[var(--cmms-danger)]"}`}>
                            คงเหลือ {Number(it.available).toLocaleString("th-TH")}
                          </span>
                          <button
                            type="button"
                            onClick={() => addPlannedPart(it)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                            style={{ background: "var(--cmms-primary-wash)", color: "var(--cmms-primary-hover)" }}
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> เพิ่ม 1
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : ppSearch.trim() ? (
              <p className="text-xs text-[var(--cmms-text-muted)]">ไม่พบรายการ "{ppSearch.trim()}" — Sage 300 ไม่พร้อมจะแสดงผลจากแคชเท่านั้น</p>
            ) : null}

            {plannedParts.length > 0 && (
              <div className="overflow-x-auto rounded-[10px] border" style={{ borderColor: "var(--cmms-border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-[var(--cmms-text-muted)]" style={{ borderColor: "var(--cmms-border)" }}>
                      <th className="py-2 pl-3 pr-2 font-semibold">Item Code</th>
                      <th className="py-2 pr-2 font-semibold">รายการ</th>
                      <th className="py-2 pr-2 text-right font-semibold">จำนวน</th>
                      <th className="py-2 pr-2 font-semibold">หน่วย</th>
                      <th className="py-2 pr-3 text-right font-semibold">ลบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--cmms-border)" }}>
                    {plannedParts.map((p, i) => (
                      <tr key={`${p.sage_item_code}-${i}`}>
                        <td className="py-2 pl-3 pr-2 font-mono text-xs font-semibold">{p.sage_item_code}</td>
                        <td className="py-2 pr-2">{p.item_description || "-"}</td>
                        <td className="py-2 pr-2 text-right">
                          <input
                            type="number" min={1}
                            className="w-20 rounded-lg border px-2 py-1 text-right text-sm"
                            style={{ borderColor: "var(--cmms-border)" }}
                            value={p.qty}
                            onChange={(e) => setPlannedQty(i, Number(e.target.value))}
                          />
                        </td>
                        <td className="py-2 pr-2 text-[var(--cmms-text-muted)]">{p.unit || "-"}</td>
                        <td className="py-2 pr-3 text-right">
                          <button type="button" aria-label={`ลบ ${p.sage_item_code}`} onClick={() => removePlannedPart(i)}
                            className="inline-flex items-center rounded-lg p-1.5 text-[var(--cmms-danger)] hover:bg-[var(--cmms-danger-light)]">
                            <X className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t pt-4" style={{ borderColor: "var(--cmms-border)" }}>
            <Button variant="secondary" onClick={() => router.push("/pm_am/plans")}>ยกเลิก</Button>
            <Button disabled={loading} onClick={handleSubmit}>
              {loading ? "กำลังบันทึก..." : editId ? "บันทึกการแก้ไข" : "บันทึกแผนงาน"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}