"use client";

import { useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { apiJson, useApiQuery } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Landmark, Plus, Trash2 } from "lucide-react";

interface Standard {
  id: number;
  standard_code: string;
  standard_name: string;
  standard_type?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  certificate_number?: string;
  calibration_date?: string | null;
  next_calibration_date?: string | null;
  status?: string;
}

const typeLabel: Record<string, string> = {
  reference_instrument: "เครื่องมืออ้างอิง",
  master_gauge: "เกจต้นแบบ",
  transfer_standard: "มาตรฐานส่งต่อ",
  calibrator: "เครื่องสอบเทียบ",
  certified_weight: "ตุ้มน้ำหนักรับรอง",
  other: "อื่น ๆ",
};

export default function CalibrationStandardsPage() {
  const hero = usePageHero("calibration");
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ type?: "ok" | "err"; text?: string }>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useApiQuery<Standard[]>(["calibration", "standards"], "/api/v1/calibration_management.php?resource=standards");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { mutate: saveStandard, isPending: saving } = useMutation({
    mutationFn: () =>
      apiJson("/api/v1/calibration_management.php", {
        method: "POST",
        body: JSON.stringify({ action: "standard_save", ...form }),
      }),
    onSuccess: (r: any) => {
      setMsg({ type: "ok", text: "บันทึกมาตรฐานแล้ว" });
      setShowForm(false);
      setForm({});
      qc.invalidateQueries({ queryKey: ["calibration"] });
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const { mutate: retireStandard } = useMutation({
    mutationFn: (id: number) =>
      apiJson("/api/v1/calibration_management.php", {
        method: "POST",
        body: JSON.stringify({ action: "standard_delete", id }),
      }),
    onSuccess: () => {
      setMsg({ type: "ok", text: "Retire มาตรฐานแล้ว (ห้ามลบเมื่อมีประวัติ)" });
      qc.invalidateQueries({ queryKey: ["calibration"] });
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const columns: SimpleColumn<Standard>[] = [
    { key: "standard_code", header: "รหัส" },
    { key: "standard_name", header: "ชื่อมาตรฐาน" },
    { key: "standard_type", header: "ประเภท", renderCell: (s) => typeLabel[s.standard_type || ""] || s.standard_type },
    { key: "serial_number", header: "หมายเลขเครื่อง", renderCell: (s) => s.serial_number || "-" },
    { key: "certificate_number", header: "เลขใบรับรอง", renderCell: (s) => s.certificate_number || "-" },
    { key: "next_calibration_date", header: "หมดอายุ", renderCell: (s) => s.next_calibration_date || "-" },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (s) => {
        const expired = s.next_calibration_date && s.next_calibration_date < new Date().toISOString().slice(0, 10);
        const variant = s.status === "active" ? (expired ? "danger" : "success") : "secondary";
        return <Badge variant={variant as any}>{s.status === "active" ? (expired ? "หมดอายุ" : "ใช้งาน") : s.status}</Badge>;
      },
    },
    {
      key: "actions",
      header: "ดำเนินการ",
      align: "right",
      renderCell: (s) =>
        s.status === "active" ? (
          <Button variant="danger" size="sm" onClick={() => { if (confirm(`Retire มาตรฐาน ${s.standard_name}?`)) retireStandard(s.id); }}>
            <Trash2 className="w-3.5 h-3.5" /> Retire
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "มาตรฐานอ้างอิง" },
      ]}
      title="มาตรฐานอ้างอิง"
      description="เครื่องมือ/เกจต้นแบบที่ใช้เป็นอ้างอิงการสอบเทียบ — ระบบแจ้งเตือนเมื่อใกล้หมดอายุ และกันการสอบเทียบกับมาตรฐานที่หมดอายุตามนโยบาย"
      actions={
        <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4" /> เพิ่มมาตรฐาน
        </Button>
      }
    >
      {msg.type === "ok" && <Alert variant="success">{msg.text}</Alert>}
      {msg.type === "err" && <Alert variant="danger">{msg.text}</Alert>}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              เพิ่มมาตรฐานอ้างอิง
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input label="รหัสมาตรฐาน *" value={form.standard_code || ""} onChange={(e) => set("standard_code", e.target.value)} placeholder="e.g. STD-THERM-001" />
            <Input label="ชื่อมาตรฐาน *" value={form.standard_name || ""} onChange={(e) => set("standard_name", e.target.value)} placeholder="Thermometer master" />
            <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.standard_type || "reference_instrument"} onChange={(e) => set("standard_type", e.target.value)}>
              {Object.entries(typeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Input label="หมายเลขเครื่อง" value={form.serial_number || ""} onChange={(e) => set("serial_number", e.target.value)} />
            <Input label="ยี่ห้อ" value={form.manufacturer || ""} onChange={(e) => set("manufacturer", e.target.value)} />
            <Input label="รุ่น" value={form.model || ""} onChange={(e) => set("model", e.target.value)} />
            <Input label="เลขใบรับรอง" value={form.certificate_number || ""} onChange={(e) => set("certificate_number", e.target.value)} />
            <Input label="วันที่สอบเทียบ" type="date" value={form.calibration_date || ""} onChange={(e) => set("calibration_date", e.target.value)} />
            <Input label="หมดอายุถัดไป" type="date" value={form.next_calibration_date || ""} onChange={(e) => set("next_calibration_date", e.target.value)} />
            <div className="sm:col-span-4">
              <Textarea label="สายโซ่การสืบค้น (traceability)" value={form.traceability || ""} onChange={(e) => set("traceability", e.target.value)} placeholder="อ้างอิงไปมาตรฐานชาติ/สากล..." rows={2} />
            </div>
            <div className="sm:col-span-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>ยกเลิก</Button>
              <Button variant="primary" disabled={saving || !form.standard_code || !form.standard_name} onClick={() => saveStandard()}>
                บันทึกมาตรฐาน
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            รายการมาตรฐานอ้างอิง
            {!isLoading && <Badge variant="primary">{(data ?? []).length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<Standard>
            columns={columns}
            data={data ?? []}
            idKey="id"
            loading={isLoading}
            skeletonRows={6}
            pageSize={15}
            caption="มาตรฐานอ้างอิง"
            emptyTitle="ยังไม่มีมาตรฐาน"
            emptyDescription="เพิ่มมาตรฐานอ้างอิงแรกด้านบน"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}