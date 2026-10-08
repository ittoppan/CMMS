"use client";

import { useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  Package,
  DollarSign,
  History,
  Power,
  GitBranch,
  ClipboardCheck,
} from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { KpiCard } from "@/components/dashboard/kit";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import {
  getDetail,
  getConfig,
  getOptions,
  transitionShutdown,
  saveScope,
  setScopeStatus,
  deleteScope,
  saveDependency,
  deleteDependency,
  createBaseline,
  refreshReadiness,
  waiveReadiness,
  refreshStartup,
  waiveStartup,
  saveAsset,
  deleteAsset,
  savePart,
  deletePart,
  reservePart,
  statusTone,
  riskTone,
  readinessStateTone,
  fmtHours,
  fmtMoney,
  fmtQty,
  fmtDateTime,
  type ConfigResponse,
  type OptionsResponse,
  type ShutdownStatus,
  type ShutdownDetail,
  type ScopeRow,
  type DependencyRow,
  type ReadinessCheck,
  type StartupStoredCheck,
  type StartupCheck,
  type CostWorkOrder,
  type ActivityRow,
  type SdAsset,
  type MaterialItem,
  type MutationResponse,
  type RawResult,
} from "@/lib/shutdown";
import AndonLamp from "@/components/AndonLamp";

/**
 * app/(dashboard)/shutdown/[id]/page.tsx — รายละเอียดงานหยุดเครื่อง (Phase 35)
 *
 * ทุกแท็บอ่านจาก action=detail&full=1 ครั้งเดียว แล้ว refresh หลัง mutation
 * ความพร้อม/การกลับเข้าสู่ระบบแสดงเป็นรายการพร้อมเหตุผลจริง ไม่มีคะแนนรวม
 * LOTO เป็นแบบอ่านเท่านั้น — ไม่มีปุ่มปลดในหน้านี้
 */

const INPUT = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";
const TEXTAREA = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm";

function dtLocal(s?: string | null): string {
  return s ? s.replace(" ", "T").slice(0, 16) : "";
}

type Dlg =
  | { t: "transition"; to: ShutdownStatus }
  | { t: "scope"; scope: Partial<ScopeRow> | null }
  | { t: "scope_status"; scope: ScopeRow }
  | { t: "scope_delete"; scope: ScopeRow }
  | { t: "dep" }
  | { t: "baseline" }
  | { t: "readiness_waive"; check: ReadinessCheck }
  | { t: "startup_waive"; check: StartupStoredCheck }
  | { t: "asset" }
  | { t: "asset_delete"; asset: SdAsset }
  | { t: "part" }
  | { t: "part_delete"; item: MaterialItem }
  | { t: "reserve"; item: MaterialItem }
  | null;

export default function ShutdownDetailPage() {
  const hero = usePageHero("shutdown");
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const qc = useQueryClient();
  const router = useRouter();

  const { data: cfg } = useApiQuery<ConfigResponse>(["shutdown", "config"], "/api/v1/shutdown.php?action=config");
  const { data: opts } = useApiQuery<OptionsResponse>(["shutdown", "options"], "/api/v1/shutdown.php?action=options");
  const { data, isLoading, error, refetch, isFetching } = useApiQuery<ShutdownDetail>(
    ["shutdown", "detail", id],
    `/api/v1/shutdown.php?action=detail&id=${id}&full=1`,
    { enabled: Number.isFinite(id) && id > 0 }
  );

  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);

  const can = cfg?.can;
  const opt = opts?.options;

  async function act(p: Promise<RawResult<MutationResponse>>, okMsg: string): Promise<boolean> {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) {
      toast.error(res.data.error || res.data.message || "ดำเนินการไม่สำเร็จ");
      return false;
    }
    toast.success(okMsg);
    await qc.invalidateQueries({ queryKey: ["shutdown", "detail", id] });
    await qc.invalidateQueries({ queryKey: ["shutdown", "dashboard"] });
    await qc.invalidateQueries({ queryKey: ["shutdown", "list"] });
    setDlg(null);
    return true;
  }

  if (error) {
    const st = (error as { status?: number }).status;
    return (
      <PageShell title="การหยุดเครื่อง">
        <Alert
          variant="danger"
          title={st === 404 ? "ไม่พบงาน" : st === 403 ? "ไม่มีสิทธิ์เข้าถึง" : "โหลดไม่สำเร็จ"}
          description={
            st === 404
              ? "ไม่พบงานหยุดเครื่องตามรหัสที่ระบุ"
              : st === 403
                ? "ต้องมีสิทธิ์ shutdown.view"
                : "เกิดข้อผิดพลาดในการดึงข้อมูล"
          }
          action={
            <Button variant="outline" size="sm" onClick={() => router.push("/shutdown")}>
              กลับรายการ
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (isLoading || !data) {
    return (
      <PageShell title="กำลังโหลด…">
        <Card>
          <CardContent className="space-y-3">
            <div className="h-5 w-1/3 animate-pulse rounded bg-secondary" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const d = data;
  const p = d.progress;
  const cp = d.critical_path;
  const rd = d.readiness;
  const su = d.startup;
  const mat = d.material;
  const cost = d.cost;

  const transitions = (d.allowed_transitions ?? []).filter((t) => {
    if (t === "cancelled") return can?.cancel;
    if (t === "startup") return can?.startup;
    if (t === "closeout" || t === "completed") return can?.closeout;
    if (t === "execution") return can?.execute;
    return can?.plan;
  });

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/shutdown" },
        { label: d.shutdown_no },
      ]}
      title={
        <span className="flex flex-wrap items-center gap-3">
          {d.title}
          <AndonLamp status={statusTone(d.status) === "success" ? "ok" : statusTone(d.status) === "danger" ? "down" : "warn"} size="sm" showLabel />
          <AndonLamp status={riskTone(d.risk_level) === "danger" ? "down" : riskTone(d.risk_level) === "warning" ? "warn" : "idle"} size="sm" showLabel />
        </span>
      }
      description={`${d.shutdown_no} · ${opt?.shutdown_types[d.shutdown_type] ?? d.shutdown_type}${d.facility ? ` · ${d.facility}` : ""}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/shutdown")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            กลับ
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching && !busy} loadingText="…">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            รีเฟรช
          </Button>
          {transitions.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={t === "cancelled" ? "danger" : t === "execution" || t === "startup" ? "primary" : "secondary"}
              onClick={() =>
                t === "cancelled" ? setDlg({ t: "transition", to: t }) : act(transitionShutdown(id, t), `เปลี่ยนสถานะเป็น ${opt?.status_labels[t] ?? t} แล้ว`)
              }
              disabled={busy}
            >
              {opt?.status_labels[t] ?? t}
            </Button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="ความคืบหน้า"
          value={p.pct === null ? "—" : `${p.pct}%`}
          sub={`${p.done}/${p.scope_count} ขอบเขต${p.pct_basis ? ` · ${p.pct_basis}` : ""}`}
        />
        <KpiCard
          label="ความพร้อม"
          value={rd.ready ? "พร้อม" : `${rd.blocking} ติด`}
          tone={rd.ready ? "green" : "amber"}
          sub={`ผ่าน ${rd.pass} · ไม่ผ่าน ${rd.fail} · รอ ${rd.pending}`}
        />
        <KpiCard
          label="Critical Path"
          value={cp.critical_path_hours != null ? fmtHours(cp.critical_path_hours) : "—"}
          sub={cp.note}
        />
        <KpiCard
          label="LOTO ที่ยังล็อก"
          value={su?.loto_total_live ?? 0}
          tone={(su?.loto_total_live ?? 0) > 0 ? "red" : ""}
          sub="อ่านจาก Phase 30 (อ่านเท่านั้น)"
        />
      </div>

      {!d.is_baselined && d.status !== "draft" && (
        <Alert
          variant="info"
          title="ยังไม่มี baseline"
          description="กดสร้าง Baseline เพื่อตรึงแผนงานปัจจุบันไว้เปรียบเทียบ (baseline เดิมจะไม่ถูกแก้ไข)"
          className="mt-4"
          action={
            can?.baseline_create ? (
              <Button size="sm" variant="outline" onClick={() => setDlg({ t: "baseline" })} disabled={busy}>
                สร้าง Baseline
              </Button>
            ) : null
          }
        />
      )}

      <Tabs defaultValue="overview" className="mt-5">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="scopes">ขอบเขตงาน</TabsTrigger>
          <TabsTrigger value="deps">ความสัมพันธ์</TabsTrigger>
          <TabsTrigger value="assets">เครื่องจักร</TabsTrigger>
          <TabsTrigger value="readiness">ความพร้อม</TabsTrigger>
          <TabsTrigger value="startup">กลับเข้าสู่ระบบ</TabsTrigger>
          <TabsTrigger value="material">วัสดุ</TabsTrigger>
          <TabsTrigger value="cost">ต้นทุน</TabsTrigger>
          <TabsTrigger value="activity">ประวัติ</TabsTrigger>
        </TabsList>

        {/* ───────────── overview ───────────── */}
        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>ข้อมูลงาน</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <Info label="วัตถุประสงค์" value={d.objective || "—"} full />
                <Info label="แผนก" value={d.department_name || "—"} />
                <Info label="ผู้รับผิดชอบ" value={d.owner_name || "—"} />
                <Info label="เริ่มตามแผน" value={fmtDateTime(d.planned_start_at)} />
                <Info label="สิ้นสุดตามแผน" value={fmtDateTime(d.planned_end_at)} />
                <Info label="เริ่มจริง" value={fmtDateTime(d.actual_start_at)} />
                <Info label="สิ้นสุดจริง" value={fmtDateTime(d.actual_end_at)} />
                <Info label="สร้างโดย" value={d.created_by_name || "—"} />
                {d.notes && <Info label="บันทึก" value={d.notes} full />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>เทียบ Baseline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!d.baseline_diff.available ? (
                  <p className="text-muted-foreground">{d.baseline_diff.note}</p>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Critical Path</span>
                      <span className="font-semibold">
                        {fmtHours(d.baseline_diff.baseline_critical_path_hours)} →{" "}
                        {fmtHours(d.baseline_diff.current_critical_path_hours)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ผลต่าง</span>
                      <span className={`font-semibold ${(d.baseline_diff.critical_path_delta ?? 0) > 0 ? "text-danger" : "text-success-dark"}`}>
                        {d.baseline_diff.critical_path_delta ?? 0} ชม.
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <Stat label="เพิ่ม" value={d.baseline_diff.added?.length ?? 0} />
                      <Stat label="เปลี่ยน" value={d.baseline_diff.changed?.length ?? 0} />
                      <Stat label="ตัดออก" value={d.baseline_diff.removed?.length ?? 0} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ───────────── scopes ───────────── */}
        <TabsContent value="scopes">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>ขอบเขตงาน ({d.scopes?.length ?? 0})</CardTitle>
              {can?.plan && (
                <Button size="sm" onClick={() => setDlg({ t: "scope", scope: null })} disabled={busy}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  เพิ่มขอบเขต
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <SimpleDataTable<ScopeRow>
                columns={scopeColumns(opt, can, (s) => setDlg({ t: "scope", scope: s }), (s) => setDlg({ t: "scope_status", scope: s }), (s) => setDlg({ t: "scope_delete", scope: s }))}
                data={d.scopes ?? []}
                idKey="id"
                pageSize={20}
                caption="ขอบเขตงาน"
                emptyTitle="ยังไม่มีขอบเขตงาน"
                emptyDescription="เพิ่มขอบเขตงานเพื่อวางแผนความสัมพันธ์ ความพร้อม และ Critical Path"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────── dependencies + critical path ───────────── */}
        <TabsContent value="deps">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>ความสัมพันธ์ก่อน-หลัง ({(d.dependencies ?? []).length})</CardTitle>
                {can?.plan && (
                  <Button size="sm" onClick={() => setDlg({ t: "dep" })} disabled={busy}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    เพิ่มความสัมพันธ์
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <SimpleDataTable<DependencyRow>
                  columns={depColumns(d.scopes ?? [], opt, (r) => act(deleteDependency(r.id), "ลบความสัมพันธ์แล้ว"))}
                  data={(d.dependencies ?? []).map((r) => r)}
                  idKey="id"
                  pageSize={20}
                  caption="ความสัมพันธ์"
                  emptyTitle="ยังไม่มีความสัมพันธ์"
                  emptyDescription="ระบุงานที่ต้องทำก่อน-หลังเพื่อคำนวณ Critical Path"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                  Critical Path Analysis (CPM)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{cp.note}</p>
                {cp.status === "not_estimated" && (
                  <Alert
                    variant="warning"
                    title="ยังประเมินเวลาไม่ครบ (not_estimated)"
                    description={`มี ${cp.unestimated_count} ขอบเขตที่ยังไม่ระบุชั่วโมงประมาณ: ${cp.unestimated_titles.join(", ")}`}
                  />
                )}
                {cp.status === "cycle_detected" && (
                  <Alert variant="danger" title="พบวงจรในความสัมพันธ์" description="ไม่สามารถคำนวณ Critical Path ได้ ต้องแก้ความสัมพันธ์ก่อน" />
                )}
                {cp.nodes.length > 0 && (
                  <SimpleDataTable<(typeof cp.nodes)[number]>
                    columns={[
                      { key: "wbs_code", header: "WBS" },
                      { key: "title", header: "งาน" },
                      { key: "duration", header: "ระยะเวลา", align: "right", renderCell: (n) => fmtHours(n.duration) },
                      { key: "float", header: "Float", align: "right", renderCell: (n) => (n.float === null ? "—" : `${n.float} ชม.`) },
                      { key: "critical", header: "วิกฤต", renderCell: (n) => (n.critical ? <AndonLamp status="down" size="sm" showLabel /> : <AndonLamp status="ok" size="sm" showLabel />) },
                    ]}
                    data={cp.nodes}
                    idKey="scope_id"
                    pageSize={20}
                    caption="โหนด Critical Path"
                    emptyTitle="ไม่มีโหนด"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ───────────── assets ───────────── */}
        <TabsContent value="assets">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>เครื่องจักรในงาน ({(d.assets ?? []).length})</CardTitle>
              {can?.plan && (
                <Button size="sm" onClick={() => setDlg({ t: "asset" })} disabled={busy}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  เพิ่มเครื่องจักร
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <SimpleDataTable<SdAsset>
                columns={assetColumns((a) => setDlg({ t: "asset_delete", asset: a }), can)}
                data={d.assets ?? []}
                idKey="id"
                pageSize={20}
                caption="เครื่องจักร"
                emptyTitle="ยังไม่มีเครื่องจักร"
                emptyDescription="เพิ่มเครื่องจักรเพื่อประเมินความพร้อมและการกลับเข้าสู่ระบบ"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────── readiness ───────────── */}
        <TabsContent value="readiness">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                ความพร้อม ({rd.pass} ผ่าน · {rd.fail} ไม่ผ่าน · {rd.pending} รอ · {rd.waived} ยกเว้น)
              </CardTitle>
              {can?.readiness_manage && (
                <Button size="sm" variant="outline" onClick={() => act(refreshReadiness(id), "ประเมินความพร้อมใหม่แล้ว")} disabled={busy}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  ประเมินใหม่
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{rd.note}</p>
              {rd.blocking > 0 && (
                <Alert variant="warning" title={`มี ${rd.blocking} รายการที่ปิดกั้น`} description="รายการที่ปิดกั้นต้องผ่านหรือได้รับอนุมัติยกเว้นก่อนเข้าสู่สถานะ execution" />
              )}
              <SimpleDataTable<ReadinessCheck>
                columns={readinessColumns(rd.can_waive_blocking, (c) => setDlg({ t: "readiness_waive", check: c }))}
                data={rd.checks}
                idKey="id"
                pageSize={25}
                caption="รายการความพร้อม"
                emptyTitle="ยังไม่มีการประเมินความพร้อม"
                emptyDescription="กดประเมินใหม่เพื่อสร้างรายการตรวจสอบอัตโนมัติจากเครื่องจักรและงานที่วางแผนไว้"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────── startup ───────────── */}
        <TabsContent value="startup">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Power className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                การกลับเข้าสู่ระบบ {su?.ready ? "— พร้อม" : ""}
              </CardTitle>
              {can?.startup && (
                <Button size="sm" variant="outline" onClick={() => act(refreshStartup(id), "ประเมินการกลับเข้าสู่ระบบใหม่แล้ว")} disabled={busy}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  ประเมินใหม่
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert
                variant="info"
                title="LOTO ต้องปลดผ่าน Phase 30 เท่านั้น"
                description={`พบจุดแยกพลังที่ยังล็อกอยู่ ${su?.loto_total_live ?? 0} จุด · ระบบนี้ไม่มีการปลดอัตโนมัติ (auto_release: ${su?.auto_release ? "เปิด" : "ปิด"})`}
              />
              {su && su.blocking > 0 && (
                <Alert variant="danger" title={`มี ${su.blocking} รายการที่ปิดกั้นการกลับเข้าสู่ระบบ`} description="รวมถึง LOTO ที่ยังไม่ได้ปลด (ยกเว้นไม่ได้)" />
              )}
              <h4 className="text-sm font-semibold">ผลประเมินสด (live)</h4>
              <SimpleDataTable<StartupCheck>
columns={[
                    { key: "asset_code", header: "เครื่องจักร" },
                    { key: "check_label", header: "รายการ" },
                    { key: "state", header: "ผล", renderCell: (r) => <AndonLamp status={readinessStateTone(r.state) === "success" ? "ok" : readinessStateTone(r.state) === "danger" ? "down" : "warn"} size="sm" showLabel /> },
                    { key: "reason_code", header: "รหัสเหตุผล" },
                    { key: "detail", header: "รายละเอียด" },
                    { key: "is_blocking", header: "ปิดกั้น", renderCell: (r) => (r.is_blocking ? <AndonLamp status="down" size="sm" showLabel /> : "—") },
                  ]}
                data={su?.checks ?? []}
                idKey="check_key"
                pageSize={25}
                caption="ผลประเมินการกลับเข้าสู่ระบบ"
                emptyTitle="ยังไม่มีเครื่องจักรในงาน"
                emptyDescription="เพิ่มเครื่องจักรก่อนจึงจะประเมินการกลับเข้าสู่ระบบได้"
              />
              <h4 className="text-sm font-semibold">บันทึกผลล่าสุด (ใช้สำหรับขออนุมัติยกเว้น)</h4>
              <SimpleDataTable<StartupStoredCheck>
columns={[
                    { key: "asset_code", header: "เครื่องจักร" },
                    { key: "check_label", header: "รายการ" },
                    { key: "state", header: "ผล", renderCell: (r) => <AndonLamp status={readinessStateTone(r.state) === "success" ? "ok" : readinessStateTone(r.state) === "danger" ? "down" : "warn"} size="sm" showLabel /> },
                    { key: "reason_label", header: "เหตุผล" },
                    { key: "is_blocking", header: "ปิดกั้น", renderCell: (r) => (r.is_blocking ? <AndonLamp status="down" size="sm" showLabel /> : "—") },
                    {
                      key: "act",
                      header: "อนุมัติยกเว้น",
                      renderCell: (r) =>
                        can?.startup && r.waivable ? (
                          <Button size="sm" variant="outline" onClick={() => setDlg({ t: "startup_waive", check: r })} disabled={busy}>
                            ขอยกเว้น
                          </Button>
                        ) : r.waivable ? (
                          <span className="text-xs text-muted-foreground">ไม่มีสิทธิ์</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">ยกเว้นไม่ได้</span>
                        ),
                    },
                  ]}
                data={su?.stored_checks ?? []}
                idKey="id"
                pageSize={25}
                caption="บันทึกผลการกลับเข้าสู่ระบบ"
                emptyTitle="ยังไม่มีบันทึกผล"
                emptyDescription="กดประเมินใหม่เพื่อบันทึกผล"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────── material ───────────── */}
        <TabsContent value="material">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                วัสดุ ({mat?.covered ?? 0} ครบ · {mat?.short ?? 0} ขาด)
              </CardTitle>
              {can?.plan && (
                <Button size="sm" onClick={() => setDlg({ t: "part" })} disabled={busy}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  เพิ่มวัสดุ
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {mat?.note && <p className="text-sm text-muted-foreground">{mat.note}</p>}
              {!mat?.on_order_available && (
                <Alert variant="info" title="ไม่แสดงยอด on-order" description="ระบบไม่มีข้อมูลวัสดุที่สั่งซื้อแล้วยังไม่ถึง จึงไม่แสดงยอดดังกล่าว" />
              )}
              <SimpleDataTable<MaterialItem>
                columns={materialColumns((m) => setDlg({ t: "reserve", item: m }), (m) => setDlg({ t: "part_delete", item: m }), can)}
                data={mat?.items ?? []}
                idKey="plan_id"
                pageSize={25}
                caption="วัสดุที่วางแผน"
                emptyTitle="ยังไม่มีวัสดุที่วางแผน"
                emptyDescription="เพิ่มวัสดุที่ต้องใช้ เพื่อตรวจสอบความเพียงพอกับสต็อกจริงและจองไว้ล่วงหน้า"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────── cost ───────────── */}
        <TabsContent value="cost">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                ต้นทุนจากใบงานจริง
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{cost?.note}</p>
              {!cost?.available ? (
                <Alert variant="info" title="ยังไม่มีข้อมูลต้นทุน" description="เมื่อมีใบงานที่เชื่อมกับขอบเขตงาน ระบบจะสรุปต้นทุนให้ที่นี่" />
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard label="ค่าอะไหล่" value={fmtMoney(cost.parts_cost)} unit="บาท" count={false} />
                    <KpiCard label="ค่าจ้างภายนอก" value={fmtMoney(cost.outsource_cost)} unit="บาท" count={false} />
                    <KpiCard label="ชั่วโมงจริง" value={fmtHours(cost.actual_hours)} count={false} />
                    <KpiCard label="ชั่วโมงประมาณ" value={fmtHours(cost.estimated_hours)} count={false} />
                  </div>
                  {cost.labor_money_shown ? (
                    <KpiCard label="ค่าแรง (จากใบงาน)" value={fmtMoney(cost.labor_cost)} unit="บาท" count={false} />
                  ) : (
                    <Alert variant="info" title="ไม่แสดงค่าแรงเป็นตัวเงิน" description={cost.labor_money_withheld_reason ?? "ปิดการแสดงค่าแรงเป็นเงินไว้ (shutdown_report_labor_money = 0)"} />
                  )}
                  {cost.data_warning && <Alert variant="warning" title="ข้อควรระวังของข้อมูล" description={cost.data_warning} />}
                  <SimpleDataTable<CostWorkOrder>
                    columns={[
                      { key: "work_order_no", header: "ใบงาน" },
                      { key: "status", header: "สถานะ" },
                      { key: "parts_cost", header: "ค่าอะไหล่", align: "right", renderCell: (r) => fmtMoney(r.parts_cost) },
                      { key: "labor_cost", header: "ค่าแรง", align: "right", renderCell: (r) => fmtMoney(r.labor_cost) },
                      { key: "outsource_cost", header: "ภายนอก", align: "right", renderCell: (r) => fmtMoney(r.outsource_cost) },
                      { key: "total_cost", header: "รวม", align: "right", renderCell: (r) => fmtMoney(r.total_cost) },
                    ]}
                    data={cost.work_orders ?? []}
                    idKey="id"
                    pageSize={20}
                    caption="ใบงาน"
                    emptyTitle="ไม่มีใบงาน"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────────── activity ───────────── */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                ประวัติการดำเนินการ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleDataTable<ActivityRow>
                columns={[
                  { key: "created_at", header: "เวลา", renderCell: (r) => fmtDateTime(r.created_at) },
                  { key: "user_name", header: "ผู้ใช้", renderCell: (r) => r.user_name || "—" },
                  { key: "action", header: "การกระทำ" },
                  { key: "description", header: "รายละเอียด" },
                  { key: "to_state", header: "ไปสถานะ", renderCell: (r) => r.to_state || "—" },
                ]}
                data={d.activity ?? []}
                idKey="id"
                pageSize={30}
                caption="ประวัติ"
                emptyTitle="ยังไม่มีประวัติ"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DialogBody
        dlg={dlg}
        busy={busy}
        id={id}
        opt={opt}
        opts={opts}
        scopes={d.scopes ?? []}
        onAct={act}
        onClose={() => setDlg(null)}
      />
    </PageShell>
  );
}

/* ───────────────────────── column builders ───────────────────────── */

function scopeColumns(
  opt: OptionsResponse["options"] | undefined,
  can: ConfigResponse["can"] | undefined,
  onEdit: (s: ScopeRow) => void,
  onStatus: (s: ScopeRow) => void,
  onDelete: (s: ScopeRow) => void
): SimpleColumn<ScopeRow>[] {
  return [
    { key: "wbs_code", header: "WBS", renderCell: (s) => <span className="font-mono text-xs">{s.wbs_code}</span> },
    {
      key: "title",
      header: "งาน",
      renderCell: (s) => (
        <div className="min-w-[12rem]">
          <div className="font-medium">{s.title}</div>
          <div className="text-xs text-muted-foreground">
            {[s.discipline, s.owner_name, s.work_order_no ? `WO ${s.work_order_no}` : ""].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      ),
    },
    { key: "status", header: "สถานะ", renderCell: (s) => <AndonLamp status={s.status === "done" ? "ok" : s.status === "in_progress" ? "warn" : "idle"} size="sm" showLabel /> },
    { key: "estimate_hours", header: "ชั่วโมง", align: "right", renderCell: (s) => fmtHours(s.estimate_hours) },
    { key: "progress_pct", header: "คืบหน้า", align: "right", renderCell: (s) => `${s.progress_pct}%` },
    {
      key: "data",
      header: "ที่มา",
      renderCell: (s) => (s.has_real_data ? <AndonLamp status="idle" size="sm" showLabel /> : <AndonLamp status="idle" size="sm" showLabel />),
    },
    {
      key: "act",
      header: "",
      renderCell: (s) => (
        <div className="flex gap-1">
          {can?.plan && (
            <>
              <Button size="sm" variant="ghost" onClick={() => onEdit(s)} aria-label={`แก้ไข ${s.title}`}>
                แก้ไข
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onStatus(s)} aria-label={`เปลี่ยนสถานะ ${s.title}`}>
                สถานะ
              </Button>
            </>
          )}
          {can?.plan && (
            <Button size="icon-xs" variant="ghost" onClick={() => onDelete(s)} aria-label={`ลบ ${s.title}`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      ),
    },
  ];
}

function depColumns(
  scopes: ScopeRow[],
  opt: OptionsResponse["options"] | undefined,
  onDelete: (r: DependencyRow) => void
): SimpleColumn<DependencyRow>[] {
  const name = (sid: number) => scopes.find((s) => s.id === sid)?.title ?? `#${sid}`;
  return [
    { key: "predecessor_scope_id", header: "ก่อน", renderCell: (r) => name(r.predecessor_scope_id) },
    { key: "successor_scope_id", header: "หลัง", renderCell: (r) => name(r.successor_scope_id) },
    { key: "dep_type", header: "ประเภท", renderCell: (r) => opt?.dep_types[r.dep_type] ?? r.dep_type },
    { key: "lag_hours", header: "Lag (ชม.)", align: "right" },
    {
      key: "act",
      header: "",
      renderCell: (r) => (
        <Button size="icon-xs" variant="ghost" onClick={() => onDelete(r)} aria-label="ลบความสัมพันธ์">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      ),
    },
  ];
}

function assetColumns(onDelete: (a: SdAsset) => void, can: ConfigResponse["can"] | undefined): SimpleColumn<SdAsset>[] {
  return [
    { key: "asset_code", header: "รหัส", renderCell: (a) => <span className="font-mono text-xs">{a.asset_code}</span> },
    { key: "asset_name", header: "เครื่องจักร" },
    { key: "is_critical", header: "วิกฤต", renderCell: (a) => (a.is_critical ? <AndonLamp status="down" size="sm" showLabel /> : "—") },
    { key: "isolation_required", header: "ต้องแยกพลัง", renderCell: (a) => (a.isolation_required ? <AndonLamp status="warn" size="sm" showLabel /> : "—") },
    { key: "loto", header: "LOTO", renderCell: (a) => (a.loto_live_count > 0 ? <AndonLamp status="down" size="sm" showLabel /> : <span className="text-muted-foreground">—</span>) },
    { key: "status", header: "สถานะ" },
    {
      key: "act",
      header: "",
      renderCell: (a) =>
        can?.plan ? (
          <Button size="icon-xs" variant="ghost" onClick={() => onDelete(a)} aria-label={`ลบ ${a.asset_code}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null,
    },
  ];
}

function readinessColumns(canWaive: boolean, onWaive: (c: ReadinessCheck) => void): SimpleColumn<ReadinessCheck>[] {
  return [
    { key: "target_label", header: "เป้าหมาย" },
    { key: "category_label", header: "หมวด" },
    { key: "check_label", header: "รายการ" },
    { key: "state", header: "ผล", renderCell: (c) => <AndonLamp status={readinessStateTone(c.state) === "success" ? "ok" : readinessStateTone(c.state) === "danger" ? "down" : "warn"} size="sm" showLabel /> },
    { key: "reason_label", header: "เหตุผล" },
    { key: "is_blocking", header: "ปิดกั้น", renderCell: (c) => (c.is_blocking ? <AndonLamp status="down" size="sm" showLabel /> : "—") },
    {
      key: "detail",
      header: "รายละเอียด",
      renderCell: (c) => <span className="text-xs text-muted-foreground">{c.detail || "—"}</span>,
    },
    {
      key: "act",
      header: "ยกเว้น",
      renderCell: (c) =>
        c.is_blocking && c.state !== "waived" ? (
          canWaive ? (
            <Button size="sm" variant="outline" onClick={() => onWaive(c)}>
              ยกเว้น
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">ต้องมีสิทธิ์ readiness_manage</span>
          )
        ) : c.state === "waived" ? (
          <span className="text-xs text-muted-foreground">ยกเว้นแล้ว</span>
        ) : (
          "—"
        ),
    },
  ];
}

function materialColumns(
  onReserve: (m: MaterialItem) => void,
  onDelete: (m: MaterialItem) => void,
  can: ConfigResponse["can"] | undefined
): SimpleColumn<MaterialItem>[] {
  return [
    { key: "part_code", header: "รหัส", renderCell: (m) => <span className="font-mono text-xs">{m.part_code}</span> },
    { key: "part_name", header: "อะไหล่" },
    { key: "planned_qty", header: "แผน", align: "right", renderCell: (m) => `${fmtQty(m.planned_qty)} ${m.unit}` },
    { key: "available", header: "พร้อมใช้", align: "right", renderCell: (m) => fmtQty(m.available) },
    { key: "gap", header: "ขาด", align: "right", renderCell: (m) => (m.gap > 0 ? <span className="font-semibold text-danger">{fmtQty(m.gap)}</span> : "0") },
    { key: "state", header: "สถานะ", renderCell: (m) => (m.state === "covered" ? <AndonLamp status="ok" size="sm" showLabel /> : <AndonLamp status="down" size="sm" showLabel />) },
    { key: "reserved", header: "จองแล้ว", align: "right", renderCell: (m) => `${m.reservation_count} ครั้ง` },
    {
      key: "act",
      header: "",
      renderCell: (m) => (
        <div className="flex gap-1">
          {can?.execute && m.gap > 0 && (
            <Button size="sm" variant="outline" onClick={() => onReserve(m)} disabled={m.data_stale}>
              จอง
            </Button>
          )}
          {can?.plan && (
            <Button size="icon-xs" variant="ghost" onClick={() => onDelete(m)} aria-label={`ลบ ${m.part_code}`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      ),
    },
  ];
}

/* ───────────────────────── small pieces ───────────────────────── */

function Info({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--cmms-bg-muted)] p-2">
      <div className="text-base font-bold">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

/* ───────────────────────── dialog body ───────────────────────── */

interface DialogBodyProps {
  dlg: Dlg;
  busy: boolean;
  id: number;
  opt: OptionsResponse["options"] | undefined;
  opts: OptionsResponse | undefined;
  scopes: ScopeRow[];
  onAct: (p: Promise<RawResult<MutationResponse>>, ok: string) => Promise<boolean>;
  onClose: () => void;
}

function DialogBody({ dlg, busy, id, opt, opts, scopes, onAct, onClose }: DialogBodyProps) {
  const [scopeForm, setScopeForm] = useState<Partial<ScopeRow>>(dlg?.t === "scope" ? (dlg.scope ?? {}) : {});
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [depForm, setDepForm] = useState({ predecessor_scope_id: "", successor_scope_id: "", dep_type: "fs", lag_hours: "0" });
  const [assetForm, setAssetForm] = useState({ asset_id: "", is_critical: false, isolation_required: false, loto_permit_id: "", note: "" });
  const [partForm, setPartForm] = useState({ spare_part_id: "", planned_qty: "1", scope_id: "", needed_by: "", note: "" });
  const [reserveQty, setReserveQty] = useState("1");

  if (!dlg) return null;

  const footer = (onConfirm: () => void, confirmLabel: string, danger = false, disabled = false) => (
    <>
      <Button variant="outline" onClick={onClose} disabled={busy}>
        ยกเลิก
      </Button>
      <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy} disabled={disabled}>
        {confirmLabel}
      </Button>
    </>
  );

  /* transition with reason (cancel) */
  if (dlg.t === "transition") {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`เปลี่ยนสถานะเป็น ${opt?.status_labels[dlg.to] ?? dlg.to}`}
        description="การยกเลิกต้องระบุเหตุผล (อย่างน้อย 10 ตัวอักษร)"
        footer={footer(
          () => {
            if (reason.trim().length < 10) {
              toast.error("กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
              return;
            }
            onAct(transitionShutdown(id, dlg.to, { reason: reason.trim() }), "ยกเลิกงานแล้ว");
          },
          "ยืนยันยกเลิก",
          true
        )}
      >
        <label htmlFor="t-reason" className="text-sm font-medium">
          เหตุผล
        </label>
        <textarea id="t-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={`mt-1 ${TEXTAREA}`} />
      </Dialog>
    );
  }

  /* scope create/edit */
  if (dlg.t === "scope") {
    return (
      <Dialog
        open
        onClose={onClose}
        title={dlg.scope?.id ? "แก้ไขขอบเขตงาน" : "เพิ่มขอบเขตงาน"}
        footer={footer(
          () => {
            if (!scopeForm.title?.trim()) {
              toast.error("ต้องระบุชื่องาน");
              return;
            }
            onAct(
              saveScope({
                id: scopeForm.id,
                shutdown_id: id,
                title: scopeForm.title.trim(),
                parent_id: scopeForm.parent_id ?? null,
                discipline: scopeForm.discipline ?? "",
                owner_user_id: scopeForm.owner_user_id ?? null,
                repair_id: scopeForm.repair_id ?? null,
                permit_id: scopeForm.permit_id ?? null,
                estimate_hours: scopeForm.estimate_hours ?? 0,
                planned_start_at: scopeForm.planned_start_at ? String(scopeForm.planned_start_at).replace("T", " ") : null,
                planned_end_at: scopeForm.planned_end_at ? String(scopeForm.planned_end_at).replace("T", " ") : null,
                description: scopeForm.description ?? "",
              }),
              dlg.scope?.id ? "บันทึกขอบเขตงานแล้ว" : "เพิ่มขอบเขตงานแล้ว"
            );
          },
          "บันทึก"
        )}
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="s-title" className="text-sm font-medium">
              ชื่องาน <span className="text-danger">*</span>
            </label>
            <Input id="s-title" value={scopeForm.title ?? ""} onChange={(e) => setScopeForm({ ...scopeForm, title: e.target.value })} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="s-disc" className="text-sm font-medium">
                งาน/สาขา
              </label>
              <Input id="s-disc" value={scopeForm.discipline ?? ""} onChange={(e) => setScopeForm({ ...scopeForm, discipline: e.target.value })} className="mt-1" />
            </div>
            <div>
              <label htmlFor="s-hours" className="text-sm font-medium">
                ชั่วโมงประมาณ
              </label>
              <Input
                id="s-hours"
                type="number"
                min={0}
                step="0.5"
                value={scopeForm.estimate_hours ?? 0}
                onChange={(e) => setScopeForm({ ...scopeForm, estimate_hours: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="s-wo" className="text-sm font-medium">
                ใบงาน (ซ่อม)
              </label>
              <select
                id="s-wo"
                value={scopeForm.repair_id ?? ""}
                onChange={(e) => setScopeForm({ ...scopeForm, repair_id: e.target.value ? Number(e.target.value) : null })}
                className={`mt-1 ${INPUT}`}
              >
                <option value="">— ไม่เชื่อม —</option>
                {(opts?.work_orders ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.work_order_no} · {w.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="s-est-start" className="text-sm font-medium">
                เริ่มตามแผน
              </label>
              <Input
                id="s-est-start"
                type="datetime-local"
                value={dtLocal(scopeForm.planned_start_at)}
                onChange={(e) => setScopeForm({ ...scopeForm, planned_start_at: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label htmlFor="s-desc" className="text-sm font-medium">
              รายละเอียด
            </label>
            <textarea id="s-desc" rows={2} value={scopeForm.description ?? ""} onChange={(e) => setScopeForm({ ...scopeForm, description: e.target.value })} className={`mt-1 ${TEXTAREA}`} />
          </div>
        </div>
      </Dialog>
    );
  }

  /* scope status */
  if (dlg.t === "scope_status") {
    const nexts = opt?.scope_transitions[dlg.scope.status] ?? [];
    return (
      <Dialog open onClose={onClose} title={`เปลี่ยนสถานะ: ${dlg.scope.title}`} description="ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร">
        <div className="space-y-3">
          {nexts.length === 0 ? (
            <Alert variant="info" title="ไม่มีสถานะถัดไป" description="ขอบเขตนี้อยู่ในสถานะสุดท้ายแล้ว" />
          ) : (
            <div>
              <span className="text-sm font-medium">ไปสถานะ</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {nexts.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (reason.trim().length < 10) {
                        toast.error("กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
                        return;
                      }
                      onAct(setScopeStatus(dlg.scope.id, n, reason.trim()), `เปลี่ยนสถานะเป็น ${opt?.scope_statuses[n] ?? n} แล้ว`);
                    }}
                  >
                    {opt?.scope_statuses[n] ?? n}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label htmlFor="ss-reason" className="text-sm font-medium">
              เหตุผล
            </label>
            <textarea id="ss-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1 ${TEXTAREA}`} />
          </div>
        </div>
      </Dialog>
    );
  }

  /* scope delete */
  if (dlg.t === "scope_delete") {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`ลบขอบเขต: ${dlg.scope.title}`}
        description="การลบต้องระบุเหตุผล (อย่างน้อย 10 ตัวอักษร)"
        footer={footer(() => {
          if (reason.trim().length < 10) {
            toast.error("กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
            return;
          }
          onAct(deleteScope(dlg.scope.id, reason.trim()), "ลบขอบเขตงานแล้ว");
        }, "ลบ", true)}
      >
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={TEXTAREA} aria-label="เหตุผลการลบ" />
      </Dialog>
    );
  }

  /* dependency add */
  if (dlg.t === "dep") {
    return (
      <Dialog
        open
        onClose={onClose}
        title="เพิ่มความสัมพันธ์"
        footer={footer(() => {
          if (!depForm.predecessor_scope_id || !depForm.successor_scope_id) {
            toast.error("เลือกงานก่อนและงานหลัง");
            return;
          }
          if (depForm.predecessor_scope_id === depForm.successor_scope_id) {
            toast.error("งานก่อนและงานหลังต้องไม่ใช่งานเดียวกัน");
            return;
          }
          onAct(
            saveDependency({
              shutdown_id: id,
              predecessor_scope_id: Number(depForm.predecessor_scope_id),
              successor_scope_id: Number(depForm.successor_scope_id),
              dep_type: depForm.dep_type,
              lag_hours: Number(depForm.lag_hours || 0),
            }),
            "เพิ่มความสัมพันธ์แล้ว"
          );
        }, "บันทึก")}
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="d-pre" className="text-sm font-medium">
              งานก่อน (predecessor)
            </label>
            <select id="d-pre" value={depForm.predecessor_scope_id} onChange={(e) => setDepForm({ ...depForm, predecessor_scope_id: e.target.value })} className={`mt-1 ${INPUT}`}>
              <option value="">— เลือก —</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.wbs_code} · {s.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="d-suc" className="text-sm font-medium">
              งานหลัง (successor)
            </label>
            <select id="d-suc" value={depForm.successor_scope_id} onChange={(e) => setDepForm({ ...depForm, successor_scope_id: e.target.value })} className={`mt-1 ${INPUT}`}>
              <option value="">— เลือก —</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.wbs_code} · {s.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="d-type" className="text-sm font-medium">
                ประเภท
              </label>
              <select id="d-type" value={depForm.dep_type} onChange={(e) => setDepForm({ ...depForm, dep_type: e.target.value })} className={`mt-1 ${INPUT}`}>
                {Object.entries(opt?.dep_types ?? {}).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="d-lag" className="text-sm font-medium">
                Lag (ชม.)
              </label>
              <Input id="d-lag" type="number" value={depForm.lag_hours} onChange={(e) => setDepForm({ ...depForm, lag_hours: e.target.value })} className="mt-1" />
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  /* baseline */
  if (dlg.t === "baseline") {
    return (
      <Dialog
        open
        onClose={onClose}
        title="สร้าง Baseline"
        description="ระบบจะตรึงแผนงานปัจจุบันเป็น baseline ใหม่ (baseline เดิมจะไม่ถูกแก้ไข)"
        footer={footer(() => onAct(createBaseline(id, reason.trim()), "สร้าง baseline แล้ว"), "สร้าง")}
      >
        <label htmlFor="b-note" className="text-sm font-medium">
          บันทึก (ไม่บังคับ)
        </label>
        <textarea id="b-note" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1 ${TEXTAREA}`} />
      </Dialog>
    );
  }

  /* readiness waive */
  if (dlg.t === "readiness_waive") {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`ยกเว้นรายการ: ${dlg.check.check_label}`}
        description="ระบุเหตุผลและรหัสเหตุผล (บังคับ)"
        footer={footer(() => {
          if (reason.trim().length < 10 || !reasonCode) {
            toast.error("กรุณาระบุรหัสเหตุผลและเหตุผลอย่างน้อย 10 ตัวอักษร");
            return;
          }
          onAct(waiveReadiness(dlg.check.id, reason.trim(), reasonCode), "อนุมัติยกเว้นแล้ว");
        }, "อนุมัติยกเว้น")}
      >
        <ReasonForm reason={reason} setReason={setReason} reasonCode={reasonCode} setReasonCode={setReasonCode} codes={opt?.reason_codes ?? {}} />
      </Dialog>
    );
  }

  /* startup waive */
  if (dlg.t === "startup_waive") {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`ยกเว้นการกลับเข้าสู่ระบบ: ${dlg.check.check_label}`}
        description="LOTO ที่ยังล็อกอยู่ยกเว้นไม่ได้"
        footer={footer(() => {
          if (reason.trim().length < 10 || !reasonCode) {
            toast.error("กรุณาระบุรหัสเหตุผลและเหตุผลอย่างน้อย 10 ตัวอักษร");
            return;
          }
          onAct(waiveStartup(dlg.check.id, reason.trim(), reasonCode), "อนุมัติยกเว้นแล้ว");
        }, "อนุมัติยกเว้น")}
      >
        <ReasonForm reason={reason} setReason={setReason} reasonCode={reasonCode} setReasonCode={setReasonCode} codes={opt?.reason_codes ?? {}} />
      </Dialog>
    );
  }

  /* asset add */
  if (dlg.t === "asset") {
    return (
      <Dialog
        open
        onClose={onClose}
        title="เพิ่มเครื่องจักร"
        footer={footer(() => {
          if (!assetForm.asset_id) {
            toast.error("เลือกเครื่องจักร");
            return;
          }
          onAct(
            saveAsset({
              shutdown_id: id,
              asset_id: Number(assetForm.asset_id),
              is_critical: assetForm.is_critical,
              isolation_required: assetForm.isolation_required,
              loto_permit_id: assetForm.loto_permit_id ? Number(assetForm.loto_permit_id) : null,
              note: assetForm.note,
            }),
            "เพิ่มเครื่องจักรแล้ว"
          );
        }, "บันทึก")}
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="a-asset" className="text-sm font-medium">
              เครื่องจักร <span className="text-danger">*</span>
            </label>
            <select id="a-asset" value={assetForm.asset_id} onChange={(e) => setAssetForm({ ...assetForm, asset_id: e.target.value })} className={`mt-1 ${INPUT}`}>
              <option value="">— เลือก —</option>
              {(opts?.assets ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={assetForm.is_critical} onChange={(e) => setAssetForm({ ...assetForm, is_critical: e.target.checked })} />
            เครื่องจักรวิกฤต
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={assetForm.isolation_required} onChange={(e) => setAssetForm({ ...assetForm, isolation_required: e.target.checked })} />
            ต้องแยกพลังงาน (LOTO)
          </label>
          <div>
            <label htmlFor="a-note" className="text-sm font-medium">
              บันทึก
            </label>
            <textarea id="a-note" rows={2} value={assetForm.note} onChange={(e) => setAssetForm({ ...assetForm, note: e.target.value })} className={`mt-1 ${TEXTAREA}`} />
          </div>
        </div>
      </Dialog>
    );
  }

  /* asset delete */
  if (dlg.t === "asset_delete") {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`ลบเครื่องจักร: ${dlg.asset.asset_code}`}
        description="ต้องระบุเหตุผล (อย่างน้อย 10 ตัวอักษร)"
        footer={footer(() => {
          if (reason.trim().length < 10) {
            toast.error("กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
            return;
          }
          onAct(deleteAsset(dlg.asset.id, reason.trim()), "ลบเครื่องจักรแล้ว");
        }, "ลบ", true)}
      >
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={TEXTAREA} aria-label="เหตุผลการลบ" />
      </Dialog>
    );
  }

  /* part add */
  if (dlg.t === "part") {
    return (
      <Dialog
        open
        onClose={onClose}
        title="เพิ่มวัสดุที่วางแผน"
        footer={footer(() => {
          if (!partForm.spare_part_id || Number(partForm.planned_qty) <= 0) {
            toast.error("เลือกอะไหล่และระบุจำนวนมากกว่า 0");
            return;
          }
          onAct(
            savePart({
              shutdown_id: id,
              spare_part_id: Number(partForm.spare_part_id),
              planned_qty: Number(partForm.planned_qty),
              scope_id: partForm.scope_id ? Number(partForm.scope_id) : 0,
              needed_by: partForm.needed_by ? partForm.needed_by.replace("T", " ") : null,
              note: partForm.note,
            }),
            "เพิ่มวัสดุแล้ว"
          );
        }, "บันทึก")}
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="p-part" className="text-sm font-medium">
              อะไหล่ <span className="text-danger">*</span>
            </label>
            <select id="p-part" value={partForm.spare_part_id} onChange={(e) => setPartForm({ ...partForm, spare_part_id: e.target.value })} className={`mt-1 ${INPUT}`}>
              <option value="">— เลือก —</option>
              {(opts?.spare_parts ?? []).map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.code} · {sp.name} (คงเหลือ {fmtQty(sp.stock_qty)} {sp.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="p-qty" className="text-sm font-medium">
                จำนวน
              </label>
              <Input id="p-qty" type="number" min={0} step="0.01" value={partForm.planned_qty} onChange={(e) => setPartForm({ ...partForm, planned_qty: e.target.value })} className="mt-1" />
            </div>
            <div>
              <label htmlFor="p-scope" className="text-sm font-medium">
                ขอบเขตงาน
              </label>
              <select id="p-scope" value={partForm.scope_id} onChange={(e) => setPartForm({ ...partForm, scope_id: e.target.value })} className={`mt-1 ${INPUT}`}>
                <option value="">— ไม่ระบุ —</option>
                {scopes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.wbs_code} · {s.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="p-need" className="text-sm font-medium">
              ต้องใช้ภายใน
            </label>
            <Input id="p-need" type="datetime-local" value={partForm.needed_by} onChange={(e) => setPartForm({ ...partForm, needed_by: e.target.value })} className="mt-1" />
          </div>
        </div>
      </Dialog>
    );
  }

  /* part delete */
  if (dlg.t === "part_delete") {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`ลบวัสดุ: ${dlg.item.part_code}`}
        description="ต้องระบุเหตุผล (อย่างน้อย 10 ตัวอักษร)"
        footer={footer(() => {
          if (reason.trim().length < 10) {
            toast.error("กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
            return;
          }
          onAct(deletePart(dlg.item.plan_id, reason.trim()), "ลบวัสดุแล้ว");
        }, "ลบ", true)}
      >
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={TEXTAREA} aria-label="เหตุผลการลบ" />
      </Dialog>
    );
  }

  /* reserve */
  if (dlg.t === "reserve") {
    const m = dlg.item;
    return (
      <Dialog
        open
        onClose={onClose}
        title={`จองอะไหล่: ${m.part_code}`}
        description={`พร้อมใช้ ${fmtQty(m.available)} ${m.unit} · ขาด ${fmtQty(m.gap)} ${m.unit} — การจองทำออนไลน์เท่านั้น`}
        footer={footer(() => {
          if (Number(reserveQty) <= 0) {
            toast.error("จำนวนต้องมากกว่า 0");
            return;
          }
          onAct(
            reservePart({ shutdown_id: id, spare_part_id: m.spare_part_id, qty: Number(reserveQty), scope_id: m.scope_id }),
            "จองอะไหล่แล้ว"
          );
        }, "จอง")}
      >
        <div className="space-y-2">
          <label htmlFor="r-qty" className="text-sm font-medium">
            จำนวนที่จอง
          </label>
          <Input id="r-qty" type="number" min={0} step="0.01" value={reserveQty} onChange={(e) => setReserveQty(e.target.value)} />
          {m.data_stale && <Alert variant="warning" title="ข้อมูลสต็อกอาจไม่เป็นปัจจุบัน" description={m.note} />}
        </div>
      </Dialog>
    );
  }

  return null;
}

function ReasonForm({
  reason,
  setReason,
  reasonCode,
  setReasonCode,
  codes,
}: {
  reason: string;
  setReason: (v: string) => void;
  reasonCode: string;
  setReasonCode: (v: string) => void;
  codes: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="w-code" className="text-sm font-medium">
          รหัสเหตุผล
        </label>
        <select id="w-code" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className={`mt-1 ${INPUT}`}>
          <option value="">— เลือก —</option>
          {Object.entries(codes).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="w-reason" className="text-sm font-medium">
          เหตุผล (อย่างน้อย 10 ตัวอักษร)
        </label>
        <textarea id="w-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1 ${TEXTAREA}`} />
      </div>
    </div>
  );
}
