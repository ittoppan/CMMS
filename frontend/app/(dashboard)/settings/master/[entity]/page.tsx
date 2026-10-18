"use client";

// settings/master/[entity] — generic CRUD สำหรับตาราง master/config (เดิมเป็นหน้า PHP แยกกัน)
// API: /api/v1/master_data.php?entity=<name>

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePageHero, t } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";
import AnimatedDialog from "@/components/AnimatedDialog";
import { apiJson } from "@/lib/api";
import { Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";

type FieldType = "text" | "textarea" | "bool" | "color" | "date" | "number";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

interface EntityDef {
  label: string;
  desc: string;
  fields: FieldDef[];
}

const E: Record<string, EntityDef> = {
  departments: {
    label: "แผนก",
    desc: "รายชื่อแผนก/ฝ่ายขององค์กร ใช้อ้างอิงในงานซ่อมและรายงาน",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อแผนก", type: "text", required: true },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  plants: {
    label: "โรงงาน / ไซต์",
    desc: "ข้อมูลโรงงานหรือ site ของบริษัท",
    fields: [
      { key: "site_code", label: "รหัสไซต์", type: "text", required: true },
      { key: "site_name", label: "ชื่อไซต์", type: "text", required: true },
      { key: "location_address", label: "ที่อยู่", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  locations: {
    label: "สถานที่ติดตั้ง",
    desc: "ตำแหน่งติดตั้งเครื่องจักร (อาจมี parent เชื่อมโครงสร้าง)",
    fields: [
      { key: "parent_id", label: "สถานที่แม่ (id)", type: "number" },
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อสถานที่", type: "text", required: true },
      { key: "type", label: "ประเภท", type: "text" },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  work_zones: {
    label: "โซนงาน",
    desc: "โซนพื้นที่ทำงาน ใช้ในงานซ่อม/ใบอนุญาตทำงาน",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อโซน", type: "text", required: true },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  failure_codes: {
    label: "รหัสสาเหตุ (Failure Codes)",
    desc: "รหัสมาตรฐานสาเหตุการพัง สำหรับวิเคราะห์ MTBF/MTTR",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อ", type: "text", required: true },
      { key: "category", label: "หมวด", type: "text" },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  repair_codes: {
    label: "รหัสงานซ่อม (Repair Codes)",
    desc: "รหัสประเภทผลงานซ่อม สำหรับรายงานและ NCR",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อ", type: "text", required: true },
      { key: "category", label: "หมวด", type: "text" },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  repair_types: {
    label: "ประเภทงานซ่อม",
    desc: "ประเภทงานซ่อมหลักที่แสดงในฟอร์มแจ้งซ่อม",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อ", type: "text", required: true },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  repair_tags: {
    label: "แท็กงานซ่อม",
    desc: "ป้ายกำกับ (tag) ที่ใช้หมายเหตุงานซ่อม",
    fields: [
      { key: "name", label: "ชื่อแท็ก", type: "text", required: true },
      { key: "color", label: "สี", type: "color" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  rejection_reasons: {
    label: "เหตุผลการปฏิเสธงาน",
    desc: "เหตุผลที่หัวหน้าใช้ตีกลับงาน (แยกตาม module)",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อเหตุผล", type: "text", required: true },
      { key: "module", label: "โมดูล", type: "text" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  borrowing_reasons: {
    label: "เหตุผลการยืมอุปกรณ์",
    desc: "ตัวเลือกเหตุผลสำหรับการยืม-คืนอุปกรณ์",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อเหตุผล", type: "text", required: true },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  spare_part_units: {
    label: "หน่วยอะไหล่",
    desc: "หน่วยนับของอะไหล่ (PCS, SET, M ...)",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อหน่วย", type: "text", required: true },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  spare_part_groups: {
    label: "กลุ่มอะไหล่",
    desc: "จัดกลุ่มอะไหล่เพื่อการวิเคราะห์และจัดการสต็อก",
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true },
      { key: "name", label: "ชื่อกลุ่ม", type: "text", required: true },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  holidays: {
    label: "วันหยุด",
    desc: "วันหยุดประจำปี ใช้คำนวณวันทำงานในแผนงาน PM",
    fields: [
      { key: "holiday_date", label: "วันที่", type: "date", required: true },
      { key: "name", label: "ชื่อวันหยุด", type: "text", required: true },
      { key: "is_recurring", label: "ซ้ำทุกปี", type: "bool" },
      { key: "description", label: "คำอธิบาย", type: "textarea" },
    ],
  },
  email_notifications: {
    label: "เทมเพลตอีเมลแจ้งเตือน",
    desc: "ตั้งค่าหัวข้อ/เนื้อหาอีเมลแจ้งเตือนตามเหตุการณ์",
    fields: [
      { key: "module", label: "โมดูล", type: "text", required: true },
      { key: "event", label: "เหตุการณ์", type: "text", required: true },
      { key: "recipients", label: "ผู้รับ (คั่นด้วย ,)", type: "text" },
      { key: "subject", label: "หัวข้อ", type: "text" },
      { key: "template_body", label: "เนื้อหา", type: "textarea" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
  organizational_chart: {
    label: "ผังองค์กร",
    desc: "ผู้ใช้ ↔ หัวหน้า ↔ แผนก + ตำแหน่ง/ระดับ ใช้ในเวิร์กโฟลว์อนุมัติ",
    fields: [
      { key: "user_id", label: "ผู้ใช้ (id)", type: "number", required: true },
      { key: "supervisor_id", label: "หัวหน้า (id)", type: "number" },
      { key: "department_id", label: "แผนก (id)", type: "number" },
      { key: "position", label: "ตำแหน่ง", type: "text" },
      { key: "level", label: "ระดับ", type: "number" },
    ],
  },
  auto_assignment_rules: {
    label: "กฎมอบหมายอัตโนมัติ",
    desc: "กฎจัดคิวงานอัตโนมัติตามเกณฑ์ (module/criteria) ไปยังผู้รับผิดชอบ",
    fields: [
      { key: "module", label: "โมดูล", type: "text", required: true },
      { key: "rule_name", label: "ชื่อกฎ", type: "text", required: true },
      { key: "criteria_type", label: "ประเภทเกณฑ์", type: "text" },
      { key: "criteria_value", label: "ค่าเกณฑ์", type: "number" },
      { key: "assignee_id", label: "ผู้รับผิดชอบ (id)", type: "number" },
      { key: "priority", label: "ลำดับความสำคัญ", type: "number" },
      { key: "is_active", label: "ใช้งาน", type: "bool" },
    ],
  },
};

type Row = Record<string, any>;

export default function MasterDataPage() {
  const params = useParams<{ entity: string }>();
  const router = useRouter();
  const hero = usePageHero("settings");
  const entityKey = (params?.entity || "").toLowerCase();
  const def = E[entityKey];

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const ADMIN_ENTITIES = def ? ["departments", "plants", "locations", "work_zones", "failure_codes", "repair_codes", "repair_types", "repair_tags", "rejection_reasons", "borrowing_reasons", "spare_part_units", "spare_part_groups", "holidays", "email_notifications"] : [];

  const fetchRows = useCallback(async () => {
    if (!def) return;
    setLoading(true);
    setError("");
    try {
      const json = await apiJson<Row[]>(`/api/v1/master_data.php?entity=${entityKey}`);
      setRows(Array.isArray(json) ? json : []);
    } catch {
      setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, [entityKey, def]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  if (!def) {
    return (
      <PageShell
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "ระบบฐานข้อมูล" }]}
        title="ไม่พบ entity"
        description="รายการนี้ไม่มีในระบบ"
      >
        <Alert variant="danger">entity ไม่ถูกต้อง: {entityKey}</Alert>
      </PageShell>
    );
  }

  const openCreate = () => {
    const init: Record<string, any> = {};
    for (const f of def.fields) init[f.key] = f.type === "bool" ? (f.key === "is_active" ? 1 : 0) : f.type === "number" ? 0 : "";
    setEditing(null);
    setForm(init);
    setDialogOpen(true);
  };

  const openEdit = (row: Row) => {
    const init: Record<string, any> = {};
    for (const f of def.fields) init[f.key] = row[f.key] ?? (f.type === "bool" ? 0 : f.type === "number" ? 0 : "");
    setEditing(row);
    setForm(init);
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await apiJson(`/api/v1/master_data.php?entity=${entityKey}&id=${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ fields: form }),
        });
      } else {
        await apiJson("/api/v1/master_data.php", {
          method: "POST",
          body: JSON.stringify({ entity: entityKey, fields: form }),
        });
      }
      setDialogOpen(false);
      await fetchRows();
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!confirm("ยืนยันการลบรายการนี้?")) return;
    try {
      await apiJson(`/api/v1/master_data.php?entity=${entityKey}&id=${row.id}`, { method: "DELETE" });
      await fetchRows();
    } catch (e: any) {
      setError(e?.message || "ลบไม่สำเร็จ");
    }
  };

  const columns: SimpleColumn<Row>[] = [
    { key: "id", header: "#", renderCell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span> },
    ...def.fields.map((f) => ({
      key: f.key,
      header: f.label,
      renderCell: (r: Row) => {
        const v = r[f.key];
        if (f.type === "bool") return <Badge className={v ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>{v ? "ใช้งาน" : "ปิด"}</Badge>;
        if (f.type === "color") return <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: String(v) }} />{String(v || "-")}</span>;
        const s = v === null || v === undefined ? "-" : String(v);
        return <span className={f.key === "code" ? "font-mono text-sm" : "text-sm"}>{s.length > 60 ? `${s.slice(0, 60)}…` : s || "-"}</span>;
      },
    })),
    {
      key: "__actions",
      header: t("tbl.actions"),
      renderCell: (r: Row) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label="แก้ไข">
            <Pencil className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => remove(r)} aria-label="ลบ">
            <Trash2 className="w-4 h-4 text-rose-600" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: def.label }]}
      title={def.label}
      description={def.desc}
      actions={
        <>
          <Button variant="secondary" onClick={fetchRows}>
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {t("action.refresh")}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            เพิ่มรายการ
          </Button>
        </>
      }
    >
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{`รายการ${def.label} (${rows.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีรายการ</p>
          ) : (
            <SimpleDataTable columns={columns} data={rows} />
          )}
        </CardContent>
      </Card>

      <AnimatedDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      >
        <div className="space-y-4 p-5">
          <h2 className="text-base font-bold">{editing ? "แก้ไขข้อมูล" : "เพิ่มรายการ"} — {def.label}</h2>
          {def.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              {f.type === "bool" ? (
                <label className="flex items-center justify-between gap-4 text-sm font-medium">
                  {f.label}
                  <Switch
                    checked={Number(form[f.key]) === 1}
                    onCheckedChange={(v) => setForm((s) => ({ ...s, [f.key]: v ? 1 : 0 }))}
                  />
                </label>
              ) : f.type === "textarea" ? (
                <>
                  <label className="text-sm font-medium">{f.label}</label>
                  <Textarea value={String(form[f.key] ?? "")} onChange={(ev) => setForm((s) => ({ ...s, [f.key]: ev.target.value }))} rows={3} />
                </>
              ) : f.type === "number" ? (
                <>
                  <label className="text-sm font-medium">{f.label}</label>
                  <Input type="number" value={String(form[f.key] ?? "")} onChange={(ev) => setForm((s) => ({ ...s, [f.key]: ev.target.value ? Number(ev.target.value) : 0 }))} />
                </>
              ) : (
                <>
                  <label className="text-sm font-medium">{f.label}</label>
                  <Input type={f.type === "color" ? "color" : f.type === "date" ? "date" : "text"} value={String(form[f.key] ?? "")} onChange={(ev) => setForm((s) => ({ ...s, [f.key]: ev.target.value }))} />
                </>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </div>
        </div>
      </AnimatedDialog>
    </PageShell>
  );
}
