"use client";

// asset-reliability/overhaul — Phase 28
// งานยกเครื่อง (Overhaul) ทั้งหมด + สร้างแผนใหม่ (POST asset_overhauls)

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery, apiJson } from "@/lib/api";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Hammer, Plus } from "lucide-react";

const OH_STATUS: Record<string, string> = {
  planned: "วางแผน", in_progress: "กำลังดำเนินการ", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", on_hold: "พักไว้",
};
const ohVariant = (s: string): "info" | "success" | "warning" | "neutral" | "danger" =>
  s === "completed" ? "success" : s === "in_progress" ? "warning" : s === "cancelled" ? "danger" : s === "on_hold" ? "neutral" : "info";

interface OverhaulRow extends Record<string, unknown> {
  id: number;
  asset_id: number;
  asset_code?: string;
  asset_name?: string;
  overhaul_code: string;
  title: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  verified_by_name?: string | null;
}

export default function OverhaulPage() {
  const hero = usePageHero("asset-reliability", { title: "งานยกเครื่อง (Overhaul)", desc: "แผนและประวัติการยกเครื่องเครื่องจักร" });
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ asset_id: "", title: "", reason: "", scope: "", planned_start: "", planned_end: "" });

  const { data, isLoading, error, refetch } = useApiQuery<{ rows: OverhaulRow[] }>(
    ["asset-reliability", "overhauls"],
    "/api/v1/asset_reports.php?report=overhaul_summary"
  );

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const query = q.trim().toLowerCase();
    return list.filter(
      (r) =>
        !query ||
        String(r.asset_code || "").toLowerCase().includes(query) ||
        String(r.asset_name || "").toLowerCase().includes(query) ||
        String(r.overhaul_code || "").toLowerCase().includes(query) ||
        String(r.title || "").toLowerCase().includes(query)
    );
  }, [data, q]);

  const fmtDate = (d?: string | null) => (d && d !== "0000-00-00" && d !== "0000-00-00 00:00:00" ? String(d).slice(0, 10) : "—");

  const save = async () => {
    setFormError("");
    if (!form.asset_id || !form.title.trim()) { setFormError("ระบุรหัสเครื่องและหัวข้อการยกเครื่อง"); return; }
    setSaving(true);
    try {
      const res = await apiJson<{ success?: boolean; message?: string }>("/api/v1/asset_overhauls.php?action=create", {
        method: "POST",
        body: JSON.stringify({ action: "create", asset_id: Number(form.asset_id), title: form.title, reason: form.reason, scope: form.scope, planned_start: form.planned_start, planned_end: form.planned_end }),
      } as RequestInit);
      if (res.success) {
        setOpen(false);
        setForm({ asset_id: "", title: "", reason: "", scope: "", planned_start: "", planned_end: "" });
        refetch();
      } else {
        setFormError(res.message || "บันทึกไม่สำเร็จ");
      }
    } catch (e) {
      setFormError((e as Error).message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  const columns: SimpleColumn<OverhaulRow>[] = [
    { key: "asset", header: "เครื่องจักร", renderCell: (r) => (
      <button type="button" className="text-left hover:underline" onClick={() => router.push(`/asset-reliability/${r.asset_id}`)}>
        <span className="font-medium">{r.asset_code}</span>
        <span className="block text-xs text-muted-foreground">{r.asset_name}</span>
      </button>
    ) },
    { key: "overhaul_code", header: "รหัส", renderCell: (r) => <span className="tabular-nums">{r.overhaul_code}</span> },
    { key: "title", header: "หัวข้อ", renderCell: (r) => <span>{r.title}</span> },
    { key: "status", header: "สถานะ", align: "center", renderCell: (r) => <Badge variant={ohVariant(r.status)}>{OH_STATUS[r.status] || r.status}</Badge> },
    { key: "planned_start", header: "ช่วงเวลา", renderCell: (r) => <span className="text-sm tabular-nums">{fmtDate(r.planned_start)} → {fmtDate(r.planned_end)}</span> },
    { key: "verified_by_name", header: "ผู้ verify", renderCell: (r) => <span className="text-sm">{r.verified_by_name || "—"}</span> },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: hero.title }]}
      title={hero.title}
      description="งานยกเครื่องเครื่องจักร — วางแผน บันทึกผล และติดตามรอบการยกเครื่องตามคู่มือผู้ผลิต"
      actions={
        <>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" /> สร้างแผนยกเครื่อง
          </Button>
          <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="สร้างแผนยกเครื่อง"
          description="บันทึกแผนการยกเครื่องประจำเครื่องจักร — ข้อมูลจริงเพื่อใช้ติดตาม"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
              <Button variant="primary" onClick={save} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึกแผน"}</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input label="ID เครื่องจักร" required placeholder="เช่น 89" value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} />
            <Input label="หัวข้อ" required placeholder="เช่น Overhaul กดปั๊มหลัก ปี 2569" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input label="เหตุผล" placeholder="เหตุผล / ระยะทาง / ตามคู่มือ" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <Input label="ขอบเขตงาน" placeholder="ขอบเขตงานที่ทำ" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
            <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
              <Input label="เริ่มวางแผน" type="date" value={form.planned_start} onChange={(e) => setForm({ ...form, planned_start: e.target.value })} />
              <Input label="สิ้นสุดวางแผน" type="date" value={form.planned_end} onChange={(e) => setForm({ ...form, planned_end: e.target.value })} />
            </Grid>
            {formError && <Alert variant="danger" title="ไม่สามารถบันทึกได้" description={formError} />}
          </div>
        </Dialog>
        </>
      }
    >
      {isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner label="กำลังโหลด..." /></div>
      )}
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error.message} />}

      {!isLoading && data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hammer className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              <span>รายการงานยกเครื่อง</span>
              <Badge variant="primary">{rows.length} รายการ</Badge>
            </CardTitle>
            <CardDescription>
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาเครื่อง / รหัส / หัวข้อ..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-[300px]"
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length > 0 ? (
              <SimpleDataTable
                columns={columns}
                data={rows}
                idKey="id"
                pageSize={10}
                caption="รายการงานยกเครื่อง"
                emptyTitle="ไม่พบรายการที่ตรงเงื่อนไข"
                emptyDescription="ลองเปลี่ยนคำค้นหา"
              />
            ) : (
              <EmptyState title="ยังไม่มีประวัติการยกเครื่อง" description="สร้างแผนยกเครื่องครั้งแรกเพื่อเริ่มติดตาม" />
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}