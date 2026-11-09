"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Activity } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { KpiCard } from "@/components/dashboard/kit";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import {
  getDashboard,
  listShutdowns,
  getConfig,
  getOptions,
  saveShutdown,
  statusTone,
  riskTone,
  fmtDateTime,
  type ConfigResponse,
  type DashboardResult,
  type OptionsResponse,
  type ShutdownRow,
} from "@/lib/shutdown";

/**
 * app/(dashboard)/shutdown/page.tsx — Shutdown / Turnaround board (Phase 35)
 *
 * แสดงภาพรวมและรายการทั้งหมด + สถานะความพร้อมแบบรายการ (ไม่มีคะแนนรวม)
 * ตัวเลข LOTO อ่านจาก Phase 30 เท่านั้น — ระบบนี้ไม่ปลดล็อกอัตโนมัติ
 */

const EMPTY_FORM = {
  title: "",
  shutdown_type: "planned",
  risk_level: "medium",
  facility: "",
  objective: "",
  department_id: "",
  owner_user_id: "",
  planned_start_at: "",
  planned_end_at: "",
  notes: "",
};

export default function ShutdownBoardPage() {
  const hero = usePageHero("shutdown");
  const router = useRouter();

  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [q, setQ] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const { data: cfg } = useApiQuery<ConfigResponse>(["shutdown", "config"], "/api/v1/shutdown.php?action=config");
  const { data: opts } = useApiQuery<OptionsResponse>(["shutdown", "options"], "/api/v1/shutdown.php?action=options");
  const { data: dash, isLoading: dashLoading } = useApiQuery<DashboardResult>(
    ["shutdown", "dashboard", departmentId],
    `/api/v1/shutdown.php?action=dashboard${departmentId ? `&department_id=${departmentId}` : ""}`
  );
  const listParams: Record<string, string> = {};
  if (status) listParams.status = status;
  if (risk) listParams.risk_level = risk;
  if (departmentId) listParams.department_id = departmentId;
  if (q) listParams.q = q;
  const listQs = new URLSearchParams({ action: "list", ...listParams }).toString();
  const { data: list, isLoading, error } = useApiQuery<{ rows: ShutdownRow[] }>(
    ["shutdown", "list", status, risk, departmentId, q],
    `/api/v1/shutdown.php?${listQs}`
  );

  const can = cfg?.can;
  const riskLabels = opts?.options.risk_levels ?? {};
  const typeLabels = opts?.options.shutdown_types ?? {};
  const rows = list?.rows ?? [];

  const columns = useMemo<SimpleColumn<ShutdownRow>[]>(
    () => [
      {
        key: "shutdown_no",
        header: "เลขที่",
        renderCell: (r) => (
          <Link href={`/shutdown/${r.id}`} className="font-medium text-primary hover:underline">
            {r.shutdown_no}
          </Link>
        ),
      },
      {
        key: "title",
        header: "งาน",
        renderCell: (r) => (
          <div className="min-w-[14rem]">
            <div className="font-medium">{r.title}</div>
            <div className="text-xs text-muted-foreground">
              {typeLabels[r.shutdown_type] ?? r.shutdown_type}
              {r.facility ? ` · ${r.facility}` : ""}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        header: "สถานะ",
        renderCell: (r) => <Badge variant={statusTone(r.status)}>{r.status_label}</Badge>,
      },
      {
        key: "risk_level",
        header: "ความเสี่ยง",
        renderCell: (r) => <Badge variant={riskTone(r.risk_level)}>{riskLabels[r.risk_level] ?? r.risk_level}</Badge>,
      },
      {
        key: "owner_name",
        header: "ผู้รับผิดชอบ",
        renderCell: (r) => r.owner_name || <span className="text-muted-foreground">—</span>,
      },
      {
        key: "window",
        header: "ช่วงแผน",
        renderCell: (r) => (
          <div className="text-xs text-muted-foreground">
            {fmtDateTime(r.planned_start_at)} → {fmtDateTime(r.planned_end_at)}
          </div>
        ),
      },
      {
        key: "progress",
        header: "ความคืบหน้า",
        renderCell: (r) => {
          const p = r.progress.pct;
          return (
            <div className="min-w-[8rem] space-y-1">
              <div className="text-sm font-semibold">{p === null ? "—" : `${p}%`}</div>
              <Progress value={p ?? 0} className="h-1.5" aria-label={`ความคืบหน้า ${r.shutdown_no}`} />
              <div className="text-[0.7rem] text-muted-foreground">
                {r.progress.done}/{r.progress.scope_count} ขอบเขต
              </div>
            </div>
          );
        },
      },
    ],
    [riskLabels, typeLabels]
  );

  async function submit() {
    if (!form.title.trim()) {
      setFormError("ต้องระบุชื่อการหยุดเครื่อง");
      return;
    }
    setSaving(true);
    setFormError("");
    const res = await saveShutdown({
      title: form.title.trim(),
      shutdown_type: form.shutdown_type as ShutdownRow["shutdown_type"],
      risk_level: form.risk_level as ShutdownRow["risk_level"],
      facility: form.facility.trim(),
      objective: form.objective.trim(),
      department_id: form.department_id ? Number(form.department_id) : null,
      owner_user_id: form.owner_user_id ? Number(form.owner_user_id) : null,
      planned_start_at: form.planned_start_at || null,
      planned_end_at: form.planned_end_at || null,
      notes: form.notes.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      setFormError(res.data.error || res.data.message || "สร้างไม่สำเร็จ");
      return;
    }
    setOpen(false);
    setForm({ ...EMPTY_FORM });
    if (res.data.id) router.push(`/shutdown/${res.data.id}`);
  }

  if (error) {
    const st = (error as { status?: number }).status;
    return (
      <PageShell
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: hero.title }]}
        title={hero.title}
        description={hero.desc}
      >
        <Alert
          variant="danger"
          title={st === 403 || st === 401 ? "ไม่มีสิทธิ์เข้าถึง" : "โหลดรายการไม่สำเร็จ"}
          description={
            st === 403 || st === 401
              ? "ต้องมีสิทธิ์ shutdown.view จึงจะดูกิจกรรมการหยุดเครื่องได้"
              : "เกิดข้อผิดพลาดในการดึงข้อมูลจากเซิร์ฟเวอร์"
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: hero.title }]}
      title={hero.title}
      description={hero.desc}
      actions={
        can?.plan ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            สร้างการหยุดเครื่อง
          </Button>
        ) : null
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="ทั้งหมด" value={dash?.total ?? 0} unit="งาน" sub="ทุกสถานะ" />
          <KpiCard
            label="กำลังดำเนินการ"
            value={dash?.active_count ?? 0}
            unit="งาน"
            tone={(dash?.active_count ?? 0) > 0 ? "blue" : ""}
            sub="ตั้งแต่วางแผนถึงปิดงาน"
          />
          <KpiCard
            label="ติด Readiness"
            value={dash?.readiness_blocked ?? 0}
            unit="งาน"
            tone={(dash?.readiness_blocked ?? 0) > 0 ? "amber" : ""}
            sub="ยังไม่ผ่านเกณฑ์ความพร้อม"
          />
          <KpiCard
            label="จุดแยกพลังที่ล็อกอยู่"
            value={dash?.loto_live_permits ?? 0}
            unit="ใบอนุญาต"
            tone={(dash?.loto_live_permits ?? 0) > 0 ? "red" : ""}
            sub="อ่านจาก Phase 30 เท่านั้น"
          />
        </div>

        {(dash?.readiness_blocked ?? 0) > 0 && (
          <Alert variant="warning" title={`มี ${dash?.readiness_blocked} งานที่ยังไม่ผ่านความพร้อม`}>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(dash?.readiness_blocked_list ?? []).map((b) => (
                <Link key={b.id} href={`/shutdown/${b.id}`} className="underline">
                  {b.shutdown_no} ({b.blocking})
                </Link>
              ))}
            </div>
          </Alert>
        )}

        {(dash?.loto_live_permits ?? 0) > 0 && (
          <Alert
            variant="info"
            title="การปลดจุดแยกพลัง (LOTO) เป็นของ Phase 30"
            description="ระบบอ่านสถานะจาก Phase 30 เท่านั้น ไม่มีการปลดล็อกอัตโนมัติ — การกลับเข้าสู่ระบบจะถูกปิดกั้นจนกว่าจะปลดผ่าน Phase 30 โดยผู้มีอำนาจ"
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              รายการหยุดเครื่อง / Turnaround
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="sd-status" className="text-xs text-muted-foreground">
                  สถานะ
                </label>
                <select
                  id="sd-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 h-10 w-[12rem] rounded-lg border border-input bg-card px-3 text-sm"
                >
                  <option value="">ทั้งหมด</option>
                  {opts?.options.statuses.map((s) => (
                    <option key={s} value={s}>
                      {opts.options.status_labels[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sd-risk" className="text-xs text-muted-foreground">
                  ระดับความเสี่ยง
                </label>
                <select
                  id="sd-risk"
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                  className="mt-1 h-10 w-[10rem] rounded-lg border border-input bg-card px-3 text-sm"
                >
                  <option value="">ทั้งหมด</option>
                  {Object.entries(riskLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sd-dept" className="text-xs text-muted-foreground">
                  แผนก
                </label>
                <select
                  id="sd-dept"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="mt-1 h-10 w-[13rem] rounded-lg border border-input bg-card px-3 text-sm"
                >
                  <option value="">ทั้งหมด</option>
                  {opts?.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sd-q" className="text-xs text-muted-foreground">
                  ค้นหา
                </label>
                <Input
                  id="sd-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="เลขที่หรือชื่อ"
                  className="mt-1 w-[14rem]"
                />
              </div>
            </div>

            {dashLoading && <p className="text-xs text-muted-foreground">กำลังโหลดภาพรวม…</p>}

            <SimpleDataTable<ShutdownRow>
              columns={columns}
              data={rows}
              idKey="id"
              loading={isLoading}
              skeletonRows={8}
              pageSize={15}
              caption="รายการหยุดเครื่อง"
              emptyTitle="ยังไม่มีการหยุดเครื่อง"
              emptyDescription="เริ่มสร้างการหยุดเครื่องครั้งแรกเพื่อวางแผนขอบเขตงาน ความพร้อม และการกลับเข้าสู่ระบบ"
            />
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="สร้างการหยุดเครื่อง"
        description="ระบุข้อมูลหลัก จากนั้นไปเพิ่มขอบเขตงานและเครื่องจักรในหน้ารายละเอียด"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={submit} loading={saving} loadingText="กำลังบันทึก…">
              สร้าง
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert variant="danger" title="สร้างไม่สำเร็จ" description={formError} />}
          <div>
            <label htmlFor="f-title" className="text-sm font-medium">
              ชื่อการหยุดเครื่อง <span className="text-danger">*</span>
            </label>
            <Input
              id="f-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="เช่น Overhaul Boiler #2"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-type" className="text-sm font-medium">
                ประเภท
              </label>
              <select
                id="f-type"
                value={form.shutdown_type}
                onChange={(e) => setForm({ ...form, shutdown_type: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                {Object.entries(typeLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-risk" className="text-sm font-medium">
                ระดับความเสี่ยง
              </label>
              <select
                id="f-risk"
                value={form.risk_level}
                onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                {Object.entries(riskLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-start" className="text-sm font-medium">
                เริ่มตามแผน
              </label>
              <Input
                id="f-start"
                type="datetime-local"
                value={form.planned_start_at}
                onChange={(e) => setForm({ ...form, planned_start_at: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="f-end" className="text-sm font-medium">
                สิ้นสุดตามแผน
              </label>
              <Input
                id="f-end"
                type="datetime-local"
                value={form.planned_end_at}
                onChange={(e) => setForm({ ...form, planned_end_at: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-dept" className="text-sm font-medium">
                แผนก
              </label>
              <select
                id="f-dept"
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">— ไม่ระบุ —</option>
                {opts?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-owner" className="text-sm font-medium">
                ผู้รับผิดชอบ
              </label>
              <select
                id="f-owner"
                value={form.owner_user_id}
                onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">— ไม่ระบุ —</option>
                {opts?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="f-fac" className="text-sm font-medium">
              พื้นที่ / โรงงาน
            </label>
            <Input
              id="f-fac"
              value={form.facility}
              onChange={(e) => setForm({ ...form, facility: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="f-obj" className="text-sm font-medium">
              วัตถุประสงค์
            </label>
            <textarea
              id="f-obj"
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
            />
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}
