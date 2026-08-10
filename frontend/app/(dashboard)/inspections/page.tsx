"use client";

import { useState, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import CountUp from "react-countup";
import {
  PlusIcon,
  ClipboardDocumentCheckIcon,
  TrashIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";

const STATUS_LABELS: Record<string, string> = {
  pending: "รอดำเนินการ", in_progress: "กำลังทำ", completed: "เสร็จสิ้น",
  overdue: "เกินกำหนด", skipped: "ข้าม",
};
const STATUS_VARIANTS: Record<string, any> = {
  pending: "warning", in_progress: "info", completed: "success",
  overdue: "error", skipped: "secondary",
};
const RESULT_LABELS: Record<string, string> = { pass: "ผ่าน", fail: "ไม่ผ่าน" };

export default function InspectionsPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");

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

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

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

      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Heading level={2}>ตรวจเช็ครอบ (Checklist)</Heading>
          <Text type="body" color="secondary">รอบตรวจตามเครื่อง/สาธารณูปโภค — รายการไม่ผ่านจะสร้างใบแจ้งซ่อมอัตโนมัติ</Text>
        </VStack>
        <HStack gap={2}>
          <Link href="/inspections/templates">
            <Button label="จัดการ Template" variant="secondary" icon={<Icon icon={ClipboardDocumentCheckIcon} size="sm" />} />
          </Link>
          <Button label="สร้างรอบตรวจ" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => { setShowCreate((v) => !v); setError(null); }} />
        </HStack>
      </Card>

      {/* สรุปด่วน */}
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">เปิดค้าง</Text>
            <Heading level={2} className={openCount > 0 ? "text-warning-600" : "text-emerald-600"}><CountUp end={openCount} /> <Text type="body" size="sm">รอบ</Text></Heading>
          </VStack>
        </Card>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-blue-600">ครบกำหนดวันนี้</Text>
            <Heading level={2} className="text-blue-600"><CountUp end={schedules.filter((s) => s.due_date === today && (s.status === "pending" || s.status === "in_progress")).length} /> <Text type="body" size="sm">รอบ</Text></Heading>
          </VStack>
        </Card>
        <Card elevation="low" padding={4} className="border-rose-500 bg-rose-50 dark:bg-rose-900/10">
          <VStack gap={1}>
            <Text type="supporting" className="text-rose-600">เกินกำหนด</Text>
            <Heading level={2} className="text-rose-600"><CountUp end={schedules.filter((s) => s.due_date && s.due_date < today && (s.status === "pending" || s.status === "in_progress")).length} /> <Text type="body" size="sm">รอบ</Text></Heading>
          </VStack>
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
              <Button label="สร้างรอบ" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={createSchedule} />
              <Button label="ยกเลิก" variant="secondary" onClick={() => setShowCreate(false)} />
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
              <Icon icon={CalendarDaysIcon} size="lg" />
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
                      <Badge label={STATUS_LABELS[s.status] || s.status} variant={STATUS_VARIANTS[s.status] || "secondary"} />
                      {s.result && <Badge label={RESULT_LABELS[s.result] || s.result} variant={s.result === "pass" ? "success" : "error"} />}
                    </HStack>
                    <Text type="body" size="sm" color="secondary">
                      🏭 {s.asset_name || `เครื่อง #${s.asset_id}`}{s.asset_code ? ` (${s.asset_code})` : ""}
                      {s.assignee_name ? ` • 👤 ${s.assignee_name}` : ""}
                      {s.due_date ? ` • ครบกำหนด ${s.due_date}` : ""}
                      {s.completed_at ? ` • เสร็จเมื่อ ${s.completed_at}` : ""}
                    </Text>
                  </VStack>
                  <HStack gap={2}>
                    {s.status !== "completed" && (
                      <Link href={`/inspections/run?schedule_id=${s.id}`}>
                        <Button label="ทำเช็ค" variant="primary" size="sm" icon={<Icon icon={ClipboardDocumentCheckIcon} size="sm" />} />
                      </Link>
                    )}
                    <Button label="" variant="ghost" size="sm" icon={<Icon icon={TrashIcon} size="sm" color="error" />} onClick={() => deleteSchedule(s)} />
                  </HStack>
                </HStack>
              </div>
            ))}
          </VStack>
        </VStack>
      </Card>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", backgroundColor: "var(--cmms-success)", color: "#fff", borderRadius: 8, zIndex: 9999, fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}
    </VStack>
  );
}
