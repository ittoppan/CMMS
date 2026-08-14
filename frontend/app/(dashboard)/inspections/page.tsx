"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import CountUp from "react-countup";
import {
  PlusIcon,
  ClipboardDocumentCheckIcon,
  TrashIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

const STATUS_LABELS: Record<string, string> = {
  pending: "รอดำเนินการ", in_progress: "กำลังทำ", completed: "เสร็จสิ้น",
  overdue: "เกินกำหนด", skipped: "ข้าม",
};
const RESULT_LABELS: Record<string, string> = { pass: "ผ่าน", fail: "ไม่ผ่าน" };

export default function InspectionsPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState("");

  // form สร้างรอบ
  const [showCreate, setShowCreate] = useState(false);
  const [cf, setCf] = useState({ template_id: "", asset_id: "", assignee_id: "", due_date: "" });

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, tRes, aRes, uRes] = await Promise.all([
        fetch(`/api/v1/inspections.php?schedules=1${statusFilter ? `&status=${statusFilter}` : ""}`),
        fetch("/api/v1/inspections.php"),
        fetch("/api/v1/index.php?resource=assets"),
        fetch("/api/v1/index.php?resource=users"),
      ]);
      const s = await sRes.json();
      const t = await tRes.json();
      const a = await aRes.json();
      const u = await uRes.json();
      if (Array.isArray(s)) setSchedules(s);
      if (Array.isArray(t)) setTemplates(t);
      if (a.data && Array.isArray(a.data)) setAssets(a.data);
      if (u.data && Array.isArray(u.data)) setUsers(u.data);
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลได้");
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [statusFilter]);

  const flash = (msg: string) => { showToast("info", msg); };

  const createSchedule = async () => {
    if (!cf.template_id || !cf.asset_id) { setError("กรุณาเลือก Template และเครื่องจักร"); return; }
    try {
      const res = await fetch("/api/v1/inspections.php?action=schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: Number(cf.template_id),
          asset_id: Number(cf.asset_id),
          assignee_id: cf.assignee_id ? Number(cf.assignee_id) : null,
          due_date: cf.due_date || null,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "สร้างรอบไม่สำเร็จ"); return; }
      flash("สร้างรอบตรวจแล้ว — กด \"ทำเช็ค\" เพื่อเริ่ม");
      setShowCreate(false);
      setCf({ template_id: "", asset_id: "", assignee_id: "", due_date: "" });
      fetchAll();
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาด");
    }
  };

  const deleteSchedule = async (s: any) => {
    if (!window.confirm(`ลบรอบตรวจของ "${s.template_title}" (${s.asset_name || "-"})?`)) return;
    try {
      await fetch(`/api/v1/inspections.php?schedule=${s.id}`, { method: "DELETE" });
      flash("ลบรอบตรวจแล้ว");
      fetchAll();
    } catch { setError("ลบไม่สำเร็จ"); }
  };

  const openCount = schedules.filter((s) => s.status === "pending" || s.status === "in_progress").length;
  const today = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดรอบตรวจ...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>INSPECTION CHECKLIST · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ตรวจเช็ครอบ (Checklist)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" /> รายการไม่ผ่าน → สร้างใบแจ้งซ่อมอัตโนมัติ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            รอบตรวจตามเครื่อง/สาธารณูปโภค — ตรวจเช็คเสร็จแล้วบันทึกผลได้ทันที
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <a href="/inspections/templates" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300">
            <ClipboardDocumentCheckIcon className="w-4 h-4" />
            จัดการ Template
          </a>
          <button
            type="button"
            onClick={() => { setShowCreate((v) => !v); setError(null); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
          >
            <PlusIcon className="w-4 h-4" />
            สร้างรอบตรวจ
          </button>
        </HStack>
      </div>

      {/* สรุปด่วน */}
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile amber">
              <ClipboardDocumentCheckIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เปิดค้าง</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={openCount} /> <Text type="body" size="sm">รอบ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile">
              <CalendarDaysIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ครบกำหนดวันนี้</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={schedules.filter((s) => s.due_date === today && (s.status === "pending" || s.status === "in_progress")).length} /> <Text type="body" size="sm">รอบ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile red">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เกินกำหนด</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={schedules.filter((s) => s.due_date && s.due_date < today && (s.status === "pending" || s.status === "in_progress")).length} /> <Text type="body" size="sm">รอบ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      {/* สร้างรอบ */}
      {showCreate && (
        <Card padding={5} className="cmms-animate-fadeInUp">
          <VStack gap={4}>
            <Heading level={4}>สร้างรอบตรวจใหม่</Heading>
            <FormLayout columns={2}>
              <Field inputID="sc-tpl" label="เทมเพลต *">
                <Selector label="เทมเพลต" isLabelHidden placeholder="เลือกเทมเพลต..." value={cf.template_id} onChange={(v) => setCf({ ...cf, template_id: String(v) })} options={templates.map((t) => ({ value: String(t.id), label: `${t.title} (${t.code})` }))} />
              </Field>
              <Field inputID="sc-asset" label="เครื่องจักร / อุปกรณ์ *">
                <Selector label="เครื่องจักร" isLabelHidden placeholder="เลือกเครื่อง..." value={cf.asset_id} onChange={(v) => setCf({ ...cf, asset_id: String(v) })} options={assets.map((a) => ({ value: String(a.id), label: `${a.name}${a.code ? ` (${a.code})` : ""}` }))} />
              </Field>
              <Field inputID="sc-assignee" label="ผู้รับผิดชอบ">
                <Selector label="ผู้รับผิดชอบ" isLabelHidden placeholder="เลือกผู้รับผิดชอบ..." value={cf.assignee_id} onChange={(v) => setCf({ ...cf, assignee_id: String(v) })} options={users.map((u) => ({ value: String(u.id), label: u.full_name || u.username || `ผู้ใช้ #${u.id}` }))} />
              </Field>
              <Field inputID="sc-due" label="ครบกำหนดวันที่">
                <TextInput id="sc-due" type="date" value={cf.due_date} onChange={(v) => setCf({ ...cf, due_date: v })} />
              </Field>
            </FormLayout>
            <HStack gap={2}>
              <button
                type="button"
                onClick={createSchedule}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
              >
                <PlusIcon className="w-4 h-4" />
                สร้างรอบ
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ยกเลิก
              </button>
            </HStack>
          </VStack>
        </Card>
      )}

      {/* Filter + list */}
      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
            <Heading level={4}>รอบตรวจทั้งหมด ({schedules.length})</Heading>
            <div style={{ width: 220 }}>
              <Selector label="สถานะ" isLabelHidden placeholder="ทุกสถานะ" value={statusFilter} onChange={(v) => setStatusFilter(String(v))} options={[{ value: "", label: "ทุกสถานะ" }, { value: "pending", label: "รอดำเนินการ" }, { value: "in_progress", label: "กำลังทำ" }, { value: "completed", label: "เสร็จสิ้น" }, { value: "overdue", label: "เกินกำหนด" }]} />
            </div>
          </HStack>

          {schedules.length === 0 && (
            <VStack gap={2} style={{ padding: 24, textAlign: "center" }}>
              <CalendarDaysIcon className="w-8 h-8" style={{ color: "var(--cmms-secondary)" }} />
              <Text type="body" color="secondary">ยังไม่มีรอบตรวจ — กด "สร้างรอบตรวจ" เพื่อเริ่ม</Text>
            </VStack>
          )}

          <VStack gap={2}>
            {schedules.map((s) => (
              <div key={s.id} style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--cmms-border)", backgroundColor: s.status === "completed" ? "var(--cmms-bg-muted)" : "var(--cmms-bg-surface, #fff)" }}>
                <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                  <VStack gap={1} style={{ flex: 1, minWidth: 260 }}>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Text type="body" weight="bold">{s.template_title || `Template #${s.template_id}`}</Text>
                      <span
                        className="cmms-andon-chip"
                        style={{
                          background: s.status === "completed" ? "rgba(16,185,129,0.12)" : s.status === "in_progress" ? "rgba(30,136,229,0.12)" : s.status === "overdue" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                          color: s.status === "completed" ? "var(--cmms-success)" : s.status === "in_progress" ? "var(--cmms-primary)" : s.status === "overdue" ? "var(--cmms-danger)" : "var(--cmms-warning)",
                          fontSize: "0.7rem",
                          padding: "3px 9px",
                        }}
                      >
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                      {s.result && (
                        <span className="cmms-andon-chip" style={{ background: s.result === "pass" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: s.result === "pass" ? "var(--cmms-success)" : "var(--cmms-danger)", fontSize: "0.7rem", padding: "3px 9px" }}>
                          {RESULT_LABELS[s.result] || s.result}
                        </span>
                      )}
                    </HStack>
                    <Text type="body" size="sm" color="secondary">
                      {s.asset_name || `เครื่อง #${s.asset_id}`}{s.asset_code ? ` (${s.asset_code})` : ""}
                      {s.assignee_name ? ` • ${s.assignee_name}` : ""}
                      {s.due_date ? ` • ครบกำหนด ${s.due_date}` : ""}
                      {s.completed_at ? ` • เสร็จเมื่อ ${s.completed_at}` : ""}
                    </Text>
                  </VStack>
                  <HStack gap={2}>
                    {s.status !== "completed" && (
                      <a href={`/inspections/run?schedule_id=${s.id}`} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary">
                        <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" />
                        ทำเช็ค
                      </a>
                    )}
                    <button
                      type="button"
                      title="ลบรอบ"
                      onClick={() => deleteSchedule(s)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </HStack>
                </HStack>
              </div>
            ))}
          </VStack>
        </VStack>
      </Card>

    </VStack>
  );
}
