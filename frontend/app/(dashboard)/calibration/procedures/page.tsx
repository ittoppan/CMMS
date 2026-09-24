"use client";

import { useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { apiJson, useApiQuery } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AndonLamp from "@/components/AndonLamp";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { FileText, Plus } from "lucide-react";

interface Procedure {
  id: number;
  procedure_code: string;
  procedure_name: string;
  version: number;
  is_current: number;
  version_count?: number;
  effective_date?: string | null;
  instrument_category?: string;
  rev_note?: string;
}

export default function CalibrationProceduresPage() {
  const hero = usePageHero("calibration");
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ type?: "ok" | "err"; text?: string }>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useApiQuery<Procedure[]>(["calibration", "procedures"], "/api/v1/calibration_management.php?resource=procedures");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { mutate: saveProc, isPending: saving } = useMutation({
    mutationFn: () =>
      apiJson("/api/v1/calibration_management.php", {
        method: "POST",
        body: JSON.stringify({
          action: "procedure_save",
          procedure_code: form.procedure_code,
          procedure_name: form.procedure_name,
          instrument_category: form.instrument_category || undefined,
          acceptance_criteria: form.acceptance_criteria || undefined,
          required_standards: form.required_standards || undefined,
          rev_note: form.rev_note || undefined,
          steps: [],
        }),
      }),
    onSuccess: () => {
      setMsg({ type: "ok", text: "บันทึกขั้นตอน (เพิ่มเวอร์ชันใหม่ถ้ารหัสซ้ำ) แล้ว" });
      setShowForm(false);
      setForm({});
      qc.invalidateQueries({ queryKey: ["calibration"] });
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const columns: SimpleColumn<Procedure>[] = [
    { key: "procedure_code", header: "รหัส" },
    { key: "procedure_name", header: "ชื่อขั้นตอน" },
    { key: "version", header: "เวอร์ชัน", renderCell: (p) => <Badge variant="neutral">v{p.version}</Badge> },
    { key: "instrument_category", header: "ประเภทเครื่องมือ", renderCell: (p) => p.instrument_category || "-" },
    { key: "effective_date", header: "มีผลจาก", renderCell: (p) => p.effective_date || "-" },
    {
      key: "is_current",
      header: "ปัจจุบัน",
      renderCell: (p) => (p.is_current ? <span className="inline-flex items-center gap-1.5"><AndonLamp status="ok" size="sm" /><span className="text-sm">ใช้อยู่</span></span> : <Badge variant="neutral">เวอร์ชันเก่า</Badge>),
    },
    { key: "rev_note", header: "หมายเหตุแก้ไข", renderCell: (p) => p.rev_note || "-" },
    {
      key: "action",
      header: "ดำเนินการ",
      renderCell: (p) => (
        <Button
          variant="secondary" size="sm"
          onClick={() => {
            setForm({ procedure_code: p.procedure_code, procedure_name: p.procedure_name, instrument_category: p.instrument_category || "", rev_note: `New version of v${p.version}` });
            setShowForm(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> ทำเวอร์ชันใหม่
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "ขั้นตอนสอบเทียบ" },
      ]}
      title="ขั้นตอนสอบเทียบ"
      description="กำหนดขั้นตอนการสอบเทียบต่อเครื่องมือ — เก็บเป็นเวอร์ชันต่อเนื่อง (ห้ามลบเวอร์ชันเก่า)"
      actions={
        <Button variant="primary" onClick={() => { setShowForm(true); }}>
          <Plus className="w-4 h-4" /> เพิ่มขั้นตอน
        </Button>
      }
    >
      {msg.type === "ok" && <Alert variant="success">{msg.text}</Alert>}
      {msg.type === "err" && <Alert variant="danger">{msg.text}</Alert>}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              {form.procedure_code && form.rev_note?.includes("New version") ? "ทำเวอร์ชันใหม่" : "เพิ่มขั้นตอน"} สอบเทียบ
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="รหัสขั้นตอน *" value={form.procedure_code || ""} onChange={(e) => set("procedure_code", e.target.value)} placeholder="e.g. CALP-THERM-01" />
            <Input label="ชื่อขั้นตอน *" value={form.procedure_name || ""} onChange={(e) => set("procedure_name", e.target.value)} placeholder="Thermometer calibration procedure" />
            <Input label="ประเภทเครื่องมือ" value={form.instrument_category || ""} onChange={(e) => set("instrument_category", e.target.value)} />
            <Input label="หมายเหตุแก้ไข (rev note)" value={form.rev_note || ""} onChange={(e) => set("rev_note", e.target.value)} />
            <div className="sm:col-span-2">
              <Textarea label="เกณฑ์ยอมรับ (acceptance criteria/MPE)" value={form.acceptance_criteria || ""} onChange={(e) => set("acceptance_criteria", e.target.value)} rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="เครื่องมือ/มาตรฐานที่ต้องใช้" value={form.required_standards || ""} onChange={(e) => set("required_standards", e.target.value)} rows={2} />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>ยกเลิก</Button>
              <Button variant="primary" disabled={saving || !form.procedure_code || !form.procedure_name} onClick={() => saveProc()}>
                บันทึก
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            รายการขั้นตอนสอบเทียบ
            {!isLoading && <Badge variant="primary">{(data ?? []).length} เวอร์ชัน</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<Procedure>
            columns={columns}
            data={data ?? []}
            idKey="id"
            loading={isLoading}
            skeletonRows={6}
            pageSize={15}
            caption="ขั้นตอนสอบเทียบ"
            emptyTitle="ยังไม่มีขั้นตอน"
            emptyDescription="เพิ่มขั้นตอนแรกด้านบน"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}