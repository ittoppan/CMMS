"use client";

// asset-reliability/[id] — Phase 28 Unified Reliability Profile
// Tab เดียว: Overview / Reliability / Health / Failures & Cost / Lifecycle / Components & Replacement /
//          Overhaul & Condition / Data Quality / Decision Support
// ทุกตัวเลขมาจาก API จริง (asset_reliability.php?id=...) — ถ้า INSUFFICIENT_DATA จะแสดงแบนเนอร์ ไม่เดา

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { Grid, VStack } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { apiJson } from "@/lib/api";
import {
  Building2, Activity, Gauge, HeartPulse, Wrench, CircleDollarSign, CalendarClock,
  Box, PackageOpen, ClipboardCheck, ShieldAlert, ArrowLeft, Plus, Trash2, RefreshCw,
  TriangleAlert, CheckCircle2, Info,
} from "lucide-react";
import AndonLamp from "@/components/AndonLamp";

interface ReliabilityProfile {
  asset: Record<string, any>;
  criticality: {
    level?: string; score?: number | null; last_reviewed_at?: string | null;
    review_due?: { due: boolean; due_date?: string | null; days_overdue?: number };
    history?: any[];
  };
  lifecycle: {
    current?: string; label?: string; changed_at?: string | null; reason?: string | null;
    transitions?: Record<string, string[]>; history?: any[];
  };
  health: Record<string, any>;
  reliability: {
    status: string; note?: string; failures?: number; downtime_minutes?: number;
    operating_hours?: number; operating_hours_note?: string;
    mtbf_hours?: number | null; mttr_minutes?: number | null; availability_pct?: number | null;
    window_months?: number; requirements?: Record<string, any>;
  };
  trend?: { ym: string; failures: number; downtime_minutes: number; cost: number; wos: number }[];
  maintenance?: Record<string, any>;
  cost?: Record<string, any>;
  decision_support?: Record<string, any>;
  relationships?: any[];
  components?: any[];
  replacements?: any[];
  overhauls?: any[];
  measurements?: any[];
  failure_events?: { items?: any[]; total?: number };
  data_quality?: { score?: number; checks?: { key: string; label: string; ok: boolean; detail?: string }[]; has_data?: boolean; notes?: string };
  config?: Record<string, any>;
  generated_at?: string;
}

const LIFE_LABELS: Record<string, string> = {
  planned: "วางแผน", procurement: "จัดซื้อ", installed: "ติดตั้ง", commissioned: "ทดลองเดิน",
  operating: "ใช้งานปกติ", under_maintenance: "กำลังซ่อมบำรุง", overhauled: "ยกเครื่อง",
  retired: "ปลดระวาง", disposed: "จำหน่าย",
};

const critBadgeVariant: Record<string, "danger" | "warning" | "info" | "neutral"> = { A: "danger", B: "warning", C: "info", D: "neutral" };

function BadgeOrDash({ v, suffix = "" }: { v: number | null | undefined; suffix?: string }) {
  return v == null ? <span className="text-muted-foreground">—</span> : <span className="font-semibold tabular-nums">{v}{suffix}</span>;
}

function InsufficientBanner({ note }: { note?: string }) {
  return (
    <Alert variant="warning" title="ข้อมูลไม่พอสำหรับการคำนวณ (INSUFFICIENT DATA)" description={note || "ยังไม่สามารถคำนวณค่าดัชนีนี้ได้จากข้อมูลจริงในระบบ — ระบบไม่ทำการคาดเดาค่า"} />
  );
}

function StatRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}{hint && <span className="ml-1 text-xs text-muted-foreground">{hint}</span>}</span>
    </div>
  );
}

export default function AssetReliabilityProfilePage() {
  const hero = usePageHero("asset-reliability/profile");
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  const { data, isLoading, error, refetch } = useApiQuery<ReliabilityProfile>(
    ["asset-reliability", "profile", id],
    `/api/v1/asset_reliability.php?id=${id}`
  );

  const [lifecycleDialog, setLifecycleDialog] = useState(false);
  const [lifeTo, setLifeTo] = useState("");
  const [lifeReason, setLifeReason] = useState("");
  const [lifeBusy, setLifeBusy] = useState(false);
  const [lifeError, setLifeError] = useState("");
  const [lifeOk, setLifeOk] = useState("");

  const [critDialog, setCritDialog] = useState(false);
  const [critBusy, setCritBusy] = useState(false);
  const [critError, setCritError] = useState("");
  const [critOk, setCritOk] = useState("");
  const [critFactors, setCritFactors] = useState<Record<string, string>>({});

  const [compDialog, setCompDialog] = useState(false);
  const [compBusy, setCompBusy] = useState(false);
  const [compError, setCompError] = useState("");
  const [compForm, setCompForm] = useState<Record<string, string>>({});

  const [replDialog, setReplDialog] = useState<{ component: any } | null>(null);
  const [replForm, setReplForm] = useState<Record<string, string>>({});
  const [replBusy, setReplBusy] = useState(false);
  const [replError, setReplError] = useState("");

  const [measDialog, setMeasDialog] = useState(false);
  const [measForm, setMeasForm] = useState<Record<string, string>>({});
  const [measBusy, setMeasBusy] = useState(false);
  const [measError, setMeasError] = useState("");

  const [ohDialog, setOhDialog] = useState(false);
  const [ohForm, setOhForm] = useState<Record<string, string>>({});
  const [ohBusy, setOhBusy] = useState(false);
  const [ohError, setOhError] = useState("");

  const [globalMsg, setGlobalMsg] = useState("");

  if (isLoading) {
    return (
      <PageShell title={hero.title} description="กำลังโหลดโปรไฟล์..." breadcrumbs={[{ label: hero.title }]}>
        <div className="flex items-center justify-center py-16"><Spinner label="กำลังโหลด..." /></div>
      </PageShell>
    );
  }
  if (error || !data) {
    return (
      <PageShell title={hero.title} breadcrumbs={[{ label: hero.title }]}>
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error?.message || "ไม่พบข้อมูล"} />
      </PageShell>
    );
  }

  const asset = data.asset || {};
  const displayName = asset.display_name || `${asset.code || ""} — ${asset.name || ""}`;
  const transitions = data.lifecycle?.transitions || {};
  const canLifeChange: string[] = (data.lifecycle?.transitions?.[data.lifecycle?.current || ""]) || [];
  const factors = { ...(asset.criticality_score != null ? {} : {}) };

  const submitLifecycle = async () => {
    setLifeBusy(true); setLifeError(""); setLifeOk("");
    try {
      const res = await apiJson<{ success: boolean; error?: string }>("/api/v1/asset_lifecycle.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change", asset_id: id, to: lifeTo, reason: lifeReason }),
      });
      if (!res.success) throw new Error(res.error || "เปลี่ยนสถานะไม่สำเร็จ");
      setLifeOk(`เปลี่ยนสถานะเป็น "${LIFE_LABELS[lifeTo] || lifeTo}" แล้ว`);
      setLifecycleDialog(false);
      refetch();
    } catch (e: any) {
      setLifeError(String(e.message || e));
    } finally {
      setLifeBusy(false);
    }
  };

  const openCrit = () => {
    setCritDialog(true); setCritError(""); setCritOk("");
    const def: Record<string, [string, number]> = {
      production: ["ผลกระทบต่อการผลิต", 50], safety: ["ความเสี่ยงความปลอดภัย", 50], quality: ["ผลกระทบคุณภาพ", 50],
      cost: ["ค่าเสียหาย", 50], downtime: ["ระยะเวลาหยุด", 50], frequency: ["ความถี่การเสีย", 50], redundancy: ["การมีเครื่องสำรอง", 50],
    };
    setCritFactors(Object.fromEntries(Object.keys(def).map((k) => [k, "50"])));
  };

  const submitCriticality = async () => {
    setCritBusy(true); setCritError(""); setCritOk("");
    try {
      const res = await apiJson<{ success: boolean; error?: string }>("/api/v1/asset_criticality.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assess", asset_id: id,
          factors: Object.fromEntries(Object.entries(critFactors).map(([k, v]) => [k, Number(v)])),
          method: "manual", apply: true, note: "ประเมินจากหน้าโปรไฟล์",
        }),
      });
      if (!res.success) throw new Error(res.error || "บันทึกไม่สำเร็จ");
      setCritOk("บันทึกการประเมินแล้ว — อัปเดตระดับความสำคัญแล้ว");
      setCritDialog(false);
      refetch();
    } catch (e: any) {
      setCritError(String(e.message || e));
    } finally {
      setCritBusy(false);
    }
  };

  const submitComponent = async () => {
    setCompBusy(true); setCompError("");
    try {
      const res = await apiJson<{ success: boolean; error?: string }>("/api/v1/asset_components.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", asset_id: id, ...compForm }),
      });
      if (!res.success) throw new Error(res.error || "เพิ่มไม่สำเร็จ");
      setCompDialog(false);
      refetch();
    } catch (e: any) {
      setCompError(String(e.message || e));
    } finally {
      setCompBusy(false);
    }
  };

  const submitReplacement = async () => {
    if (!replDialog) return;
    setReplBusy(true); setReplError("");
    try {
      const res = await apiJson<{ success: boolean; error?: string }>("/api/v1/asset_components.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replace", component_id: Number(replDialog.component.id), ...replForm }),
      });
      if (!res.success) throw new Error(res.error || "บันทึกไม่สำเร็จ");
      setReplDialog(null);
      refetch();
    } catch (e: any) {
      setReplError(String(e.message || e));
    } finally {
      setReplBusy(false);
    }
  };

  const submitMeasurement = async () => {
    setMeasBusy(true); setMeasError("");
    try {
      const res = await apiJson<{ success: boolean; error?: string }>("/api/v1/asset_measurements.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", asset_id: id, ...measForm, value_numeric: Number(measForm.value_numeric) }),
      });
      if (!res.success) throw new Error(res.error || "บันทึกไม่สำเร็จ");
      setMeasDialog(false);
      refetch();
    } catch (e: any) {
      setMeasError(String(e.message || e));
    } finally {
      setMeasBusy(false);
    }
  };

  const submitOverhaul = async () => {
    setOhBusy(true); setOhError("");
    try {
      const res = await apiJson<{ success: boolean; error?: string }>("/api/v1/asset_overhauls.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", asset_id: id, ...ohForm }),
      });
      if (!res.success) throw new Error(res.error || "บันทึกไม่สำเร็จ");
      setOhDialog(false);
      refetch();
    } catch (e: any) {
      setOhError(String(e.message || e));
    } finally {
      setOhBusy(false);
    }
  };

  const deleteComponent = async (cid: number) => {
    await apiJson(`/api/v1/asset_components.php?asset_id=${id}&component_id=${cid}`, { method: "DELETE" });
    refetch();
  };
  const deleteMeasurement = async (mid: number) => {
    await apiJson(`/api/v1/asset_measurements.php?id=${mid}`, { method: "DELETE" });
    refetch();
  };

  const rel = data.reliability || {};
  const insufficient = rel.status === "INSUFFICIENT_DATA";
  const dq = data.data_quality;

  const compColumns: SimpleColumn<any>[] = [
    { key: "code", header: "รหัสชิ้นส่วน", renderCell: (r) => <div className="flex flex-col"><span className="font-semibold">{r.component_code || "—"}</span><span className="text-xs text-muted-foreground">{r.name}</span></div> },
    { key: "qty", header: "จำนวน", align: "right", renderCell: (r) => r.qty ?? "—" },
    { key: "unit", header: "หน่วย", renderCell: (r) => r.unit || "—" },
    { key: "serial", header: "Serial ล่าสุด", renderCell: (r) => r.current_serial || r.serial_number || "—" },
    { key: "installed", header: "ติดตั้งเมื่อ", renderCell: (r) => r.install_date || r.installed_at || "—" },
    { key: "status", header: "สถานะ", renderCell: (r) => <AndonLamp status={r.status === "active" ? "ok" : "idle"} size="sm" showLabel /> },
    {
      key: "actions", header: "จัดการ", align: "right",
      renderCell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-xs" title="เปลี่ยนชิ้นส่วน" onClick={() => { setReplDialog({ component: r }); setReplForm({ reason: "" }); setReplError(""); }}>
            <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-xs" className="text-destructive" title="ลบชิ้นส่วน" onClick={() => void deleteComponent(r.id)}>
            <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  const replColumns: SimpleColumn<any>[] = [
    { key: "code", header: "ชิ้นส่วน", renderCell: (r) => <div className="flex flex-col"><span className="font-semibold">{r.component_code || "—"}</span><span className="text-xs text-muted-foreground">{r.name}</span></div> },
    { key: "replaced_at", header: "วันที่เปลี่ยน", renderCell: (r) => r.replaced_at || "—" },
    { key: "old", header: "Serial เดิม", renderCell: (r) => r.old_serial || "—" },
    { key: "new", header: "Serial ใหม่", renderCell: (r) => r.new_serial || "—" },
    { key: "cost", header: "ค่าใช้จ่าย", align: "right", renderCell: (r) => r.cost != null ? `${Number(r.cost).toLocaleString("th-TH")} ฿` : "—" },
    { key: "reason", header: "เหตุผล", renderCell: (r) => <span className="line-clamp-2">{r.reason || "—"}</span> },
  ];

  const trendTotalFailures = (data.trend || []).reduce((s, m) => s + m.failures, 0);
  const trendTotalCost = (data.trend || []).reduce((s, m) => s + m.cost, 0);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: displayName }]}
      title={displayName}
      description={`โปรไฟล์ความน่าเชื่อถือของเครื่องจักร — ข้อมูลจริงในระบบ ${data.generated_at ? `(อัปเดต ${new Date(data.generated_at).toLocaleString("th-TH")})` : ""}`}
      actions={
        <>
          <Button variant="secondary" onClick={() => window.history.back()}>
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> ย้อนกลับ
          </Button>
          <Button variant="secondary" onClick={() => void refetch()}>
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" /> รีเฟรช
          </Button>
        </>
      }
    >
      {globalMsg && <Alert variant="success" title="บันทึกสำเร็จ" description={globalMsg} />}

      {/* ── Summary ── */}
      <Grid columns={{ minWidth: 240, max: 4 }} gap={4}>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]">
              <Gauge size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ความสำคัญ (Criticality)</p>
              <p className="flex items-center gap-2">
                <AndonLamp status={data.criticality?.level === "A" ? "down" : data.criticality?.level === "B" ? "warn" : data.criticality?.level === "C" ? "idle" : "ok"} size="sm" showLabel />
                <span className="text-xs text-muted-foreground">คะแนน: {data.criticality?.score ?? "—"}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary)]">
              <CalendarClock size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">วงจรชีวิต (Lifecycle)</p>
              <p className="font-semibold">{data.lifecycle?.label || "ยังไม่ระบุ"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success)]">
              <Activity size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">สุขภาพ (Health)</p>
              <p className="font-semibold">{data.health?.health === "INSUFFICIENT_DATA" ? "ข้อมูลไม่พอ" : data.health?.health || "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)]">
              <Box size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">อายุเครื่อง</p>
              <p className="font-semibold">{asset.age_years != null ? `${asset.age_years} ปี` : "ไม่มีข้อมูล"}</p>
            </div>
          </CardContent>
        </Card>
      </Grid>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full flex-wrap">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="reliability">Reliability</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="failures">Failures & Cost</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="components">Component & Replacement</TabsTrigger>
          <TabsTrigger value="overhaul">Overhaul & Condition</TabsTrigger>
          <TabsTrigger value="quality">Data Quality</TabsTrigger>
          <TabsTrigger value="decision">Decision Support</TabsTrigger>
        </TabsList>

        {/* ═══════ OVERVIEW ═══════ */}
        <TabsContent value="overview">
          <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 size={16} strokeWidth={1.75} aria-hidden="true" /> ข้อมูลเครื่องจักร</CardTitle>
              </CardHeader>
              <CardContent>
                <VStack gap={1}>
                  <StatRow label="รหัสเครื่อง" value={asset.code || "—"} />
                  <StatRow label="ชื่อเครื่อง" value={asset.name || "—"} />
                  <StatRow label="หมวดหมู่" value={asset.category || asset.category_name || "—"} />
                  <StatRow label="แผนก" value={asset.dept_name || asset.department || "—"} />
                  <StatRow label="สถานที่" value={asset.location_name_join || asset.location || "—"} />
                  <StatRow label="Serial No." value={asset.serial_number || "—"} />
                  <StatRow label="วันที่ติดตั้ง" value={asset.installation_date || "—"} />
                  <StatRow label="วันที่ทดลองเดิน" value={asset.commission_date || "—"} />
                  <StatRow label="อายุการใช้งานโดยประมาณ" value={asset.expected_life_months ? `${asset.expected_life_months} เดือน` : "—"} />
                  <StatRow label="อายุการใช้งานที่เหลือ" value={asset.remaining_life_years != null ? `${asset.remaining_life_years} ปี` : "—"} />
                </VStack>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><HeartPulse size={16} strokeWidth={1.75} aria-hidden="true" /> สรุปด่วน (จากข้อมูลจริง)</CardTitle>
              </CardHeader>
              <CardContent>
                <VStack gap={1}>
                  <StatRow label="MTBF (ชม.)" value={<BadgeOrDash v={rel.mtbf_hours} />} />
                  <StatRow label="MTTR (นาที)" value={<BadgeOrDash v={rel.mttr_minutes} />} />
                  <StatRow label="Availability" value={rel.availability_pct != null ? `${rel.availability_pct}%` : <span className="text-muted-foreground">—</span>} />
                  <StatRow label="Failures 12 เดือน" value={<BadgeOrDash v={rel.failures} />} />
                  <StatRow label="Downtime 12 เดือน" value={<>{rel.downtime_minutes != null ? `${rel.downtime_minutes.toLocaleString("th-TH")} นาที` : "—"}</>} />
                  <StatRow label="ค่ารวมซ่อมบำรุง" value={data.cost?.total_cost != null ? `${Number(data.cost.total_cost).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="ค่าใช้จ่ายต่อปี" value={data.cost?.cost_per_year != null ? `${Number(data.cost.cost_per_year).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="PM compliance" value={data.maintenance?.pm_compliance_pct != null ? `${data.maintenance.pm_compliance_pct}%` : "—"} />
                </VStack>
              </CardContent>
            </Card>
          </Grid>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>แนวโน้มรายเดือน (งานซ่อม / Downtime / ค่าใช้จ่าย)</CardTitle>
                <CardDescription>12 เดือนล่าสุดจาก repair + v_maintenance_cost จริง</CardDescription>
              </div>
              <div className="flex gap-3 text-right text-sm">
                <div><div className="text-muted-foreground">Failures รวม</div><div className="font-bold tabular-nums">{trendTotalFailures}</div></div>
                <div><div className="text-muted-foreground">ค่าใช้จ่ายรวม</div><div className="font-bold tabular-nums">{trendTotalCost.toLocaleString("th-TH")} ฿</div></div>
              </div>
            </CardHeader>
            <CardContent>
              {data.trend && data.trend.length > 0 ? (
                <div className="grid grid-cols-3 gap-y-3 sm:grid-cols-6">
                  {data.trend.map((m) => (
                    <div key={m.ym} className="space-y-1 border-r border-border/60 pr-3 last:border-r-0">
                      <p className="text-[0.7rem] font-semibold uppercase text-muted-foreground">{m.ym}</p>
                      <p className="text-sm"><TriangleAlert size={13} strokeWidth={1.75} aria-hidden="true" className="mr-1 inline text-[var(--cmms-danger)]" />{m.failures}</p>
                      <p className="text-xs text-muted-foreground">{m.downtime_minutes.toLocaleString("th-TH")} นาที</p>
                      <p className="text-xs tabular-nums">{m.cost.toLocaleString("th-TH")} ฿</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="ไม่มีข้อมูลแนวโน้ม" description="ยังไม่มีงานซ่อมใน 12 เดือนล่าสุด" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ RELIABILITY ═══════ */}
        <TabsContent value="reliability">
          {insufficient && <InsufficientBanner note={rel.note} />}
          <Grid columns={{ minWidth: 260, max: 3 }} gap={4}>
            <Card>
              <CardContent className="space-y-1 p-5">
                <p className="text-sm text-muted-foreground">MTBF (Mean Time Between Failures)</p>
                <p className="text-2xl font-bold tabular-nums">{rel.mtbf_hours ?? "—"} <span className="text-sm font-normal">ชม.</span></p>
                <p className="text-xs text-muted-foreground">ชั่วโมงปฏิบัติการ ÷ จำนวนความเสียหาย</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5">
                <p className="text-sm text-muted-foreground">MTTR (Mean Time To Repair)</p>
                <p className="text-2xl font-bold tabular-nums">{rel.mttr_minutes ?? "—"} <span className="text-sm font-normal">นาที</span></p>
                <p className="text-xs text-muted-foreground">Downtime ÷ จำนวนความเสียหาย</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5">
                <p className="text-sm text-muted-foreground">Availability (ความพร้อม)</p>
                <p className="text-2xl font-bold tabular-nums">{rel.availability_pct != null ? `${rel.availability_pct}%` : "—"}</p>
                <p className="text-xs text-muted-foreground">op_hours ÷ (op_hours + downtime)</p>
              </CardContent>
            </Card>
          </Grid>
          <Card>
            <CardHeader><CardTitle>ข้อมูลที่ใช้คำนวณ</CardTitle></CardHeader>
            <CardContent>
              <VStack gap={1}>
                <StatRow label="จำนวนความเสียหาย (breakdown WO)" value={<BadgeOrDash v={rel.failures} />} />
                <StatRow label="Downtime รวม" value={rel.downtime_minutes != null ? `${rel.downtime_minutes.toLocaleString("th-TH")} นาที` : "—"} />
                <StatRow label="Operating hours" value={<><BadgeOrDash v={rel.operating_hours ?? null} /> <span className="text-xs text-muted-foreground">({rel.operating_hours_note || "—"})</span></>} />
                <StatRow label="กรอบเวลา" value={rel.window_months ? `12 เดือนล่าสุด (${rel.window_months} เดือน)` : "—"} />
                <StatRow label="เงื่อนไขขั้นต่ำ" value={rel.requirements ? `≥ ${rel.requirements.min_failures} failure` : "—"} />
              </VStack>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ HEALTH ═══════ */}
        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle>สุขภาพเครื่องจักร (Asset Health)</CardTitle>
              <CardDescription>จาก ana_asset_health — คำนวณด้วยข้อมูลจริงของเครื่องนี้</CardDescription>
            </CardHeader>
            <CardContent>
              {data.health?.health === "INSUFFICIENT_DATA" ? (
                <InsufficientBanner note={(data.health as any)?.note || data.health?.reasons?.join(" · ") || "ข้อมูลไม่พอ" } />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">ระดับสุขภาพ:</span>
                    <AndonLamp
                      status={data.health?.health === "good" ? "ok" : data.health?.health === "fair" ? "warn" : data.health?.health === "poor" ? "down" : "idle"}
                      size="sm"
                      showLabel
                    />
                    {data.health?.score != null && <span className="text-lg font-bold tabular-nums">{data.health.score}/100</span>}
                  </div>
                  <Progress value={data.health?.score ?? 0} className="h-2" />
                  {(data.health?.reasons as any)?.length > 0 && (
                    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                      {(data.health?.reasons as string[])?.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ FAILURES & COST ═══════ */}
        <TabsContent value="failures">
          <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign size={16} strokeWidth={1.75} aria-hidden="true" /> ค่าใช้จ่ายซ่อมบำรุง</CardTitle></CardHeader>
              <CardContent>
                <VStack gap={1}>
                  <StatRow label="ใบงานซ่อมทั้งหมด" value={<BadgeOrDash v={data.cost?.wos ?? null} />} />
                  <StatRow label="ใบงานซ่อมแบบ breakdown" value={<BadgeOrDash v={data.cost?.breakdown_wos ?? null} />} />
                  <StatRow label="ค่าอะไหล่รวม" value={data.cost?.parts_cost != null ? `${Number(data.cost.parts_cost).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="ค่าแรงรวม" value={data.cost?.labor_cost != null ? `${Number(data.cost.labor_cost).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="ค่างานภายนอกรวม" value={data.cost?.outsource_cost != null ? `${Number(data.cost.outsource_cost).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="ค่ารวมทั้งหมด" value={data.cost?.total_cost != null ? `${Number(data.cost.total_cost).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="ค่าใช้จ่ายต่อปี" value={data.cost?.cost_per_year != null ? `${Number(data.cost.cost_per_year).toLocaleString("th-TH")} ฿` : "—"} />
                </VStack>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" /> ภาระงานบำรุงรักษา</CardTitle>
              </CardHeader>
              <CardContent>
                <VStack gap={1}>
                  <StatRow label="ใบงาน 12 เดือน" value={<BadgeOrDash v={data.maintenance?.wos_total ?? null} />} />
                  <StatRow label="ใบงาน breakdown" value={<BadgeOrDash v={data.maintenance?.wos_breakdown ?? null} />} />
                  <StatRow label="ใบงาน PM" value={<BadgeOrDash v={data.maintenance?.wos_pm ?? null} />} />
                  <StatRow label="PM ทั้งหมด" value={<BadgeOrDash v={data.maintenance?.pm_total ?? null} />} />
                  <StatRow label="PM เกินกำหนด" value={<BadgeOrDash v={data.maintenance?.pm_overdue ?? null} />} />
                  <StatRow label="PM compliance" value={data.maintenance?.pm_compliance_pct != null ? `${data.maintenance.pm_compliance_pct}%` : "—"} />
                </VStack>
              </CardContent>
            </Card>
          </Grid>

          <Card>
            <CardHeader>
              <CardTitle>Failure Events ล่าสุด</CardTitle>
              <CardDescription>จากตาราง failure_events — ดูต่อในหน้าระบบ RCA</CardDescription>
            </CardHeader>
            <CardContent>
              {data.failure_events && Array.isArray(data.failure_events.items) && data.failure_events.items.length > 0 ? (
                <SimpleDataTable
                  columns={[
                    { key: "event_code", header: "รหัสเหตุการณ์", renderCell: (r) => r.event_code || "—" },
                    { key: "failure_date", header: "วันที่", renderCell: (r) => r.failure_date || "—" },
                    { key: "title", header: "คำอธิบาย", renderCell: (r) => r.title || r.notes || "—" },
                    { key: "type", header: "ประเภท", renderCell: (r) => <div className="flex flex-col"><span>{r.failure_type_name || "—"}</span>{r.failure_mode_name && <span className="text-xs text-muted-foreground">{r.failure_mode_name}</span>}</div> },
                    { key: "rca", header: "RCA", renderCell: (r) => r.rca_status ? <AndonLamp status="idle" size="sm" showLabel /> : <span className="text-muted-foreground">—</span> },
                  ]}
                  data={data.failure_events.items}
                  idKey="id"
                  pageSize={5}
                />
              ) : (
                <EmptyState title="ไม่มี Failure Events" description="ยังไม่มีเหตุการณ์ความเสียหายที่บันทึกในระบบ" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ LIFECYCLE ═══════ */}
        <TabsContent value="lifecycle">
          <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>สถานะวงจรชีวิตปัจจุบัน</CardTitle>
                  <CardDescription>เปลี่ยนสถานะได้ตามกฎการเปลี่ยน (transition)</CardDescription>
                </div>
                <Button size="sm" onClick={() => { setLifecycleDialog(true); setLifeReason(""); setLifeTo(canLifeChange[0] || ""); setLifeError(""); setLifeOk(""); }}>
                  <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" /> เปลี่ยนสถานะ
                </Button>
              </CardHeader>
              <CardContent>
<div className="flex flex-wrap gap-2">
                      <AndonLamp status="idle" size="sm" showLabel />
                      {data.lifecycle?.changed_at && <span className="text-xs text-muted-foreground">เปลี่ยนเมื่อ {new Date(data.lifecycle.changed_at).toLocaleString("th-TH")}</span>}
                      {data.lifecycle?.reason && <p className="w-full text-sm text-muted-foreground">เหตุผล: {data.lifecycle.reason}</p>}
                    </div>
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold">สถานะที่เปลี่ยนไปได้: {canLifeChange.length === 0 ? <span className="font-normal text-muted-foreground">ไม่มี (ปลายทาง/ไม่สามารถ)</span> : null}</p>
{canLifeChange.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {canLifeChange.map((s) => (
                          <AndonLamp key={s} status="idle" size="sm" showLabel />
                        ))}
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>ประวัติการเปลี่ยนสถานะ</CardTitle></CardHeader>
              <CardContent>
                {data.lifecycle?.history && data.lifecycle.history.length > 0 ? (
                  <div className="relative space-y-4 border-l border-border pl-4">
                    {data.lifecycle.history.map((h, i) => (
                      <div key={i} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                        <p className="text-sm"><AndonLamp status="idle" size="sm" showLabel /></p>
                        <p className="text-xs text-muted-foreground">{h.changed_at ? new Date(h.changed_at).toLocaleString("th-TH") : "—"} · โดย {h.changed_by_name || h.changed_by || "—"}</p>
                        {h.reason && <p className="text-sm text-muted-foreground">{h.reason}</p>}
                        {h.reference && <p className="text-xs text-muted-foreground">อ้างอิง: {h.reference}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="ยังไม่มีประวัติ" description="ยังไม่เคยเปลี่ยนสถานะวงจรชีวิตของเครื่องนี้" />
                )}
              </CardContent>
            </Card>
          </Grid>
        </TabsContent>

        {/* ═══════ COMPONENTS & REPLACEMENT ═══════ */}
        <TabsContent value="components">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle className="flex items-center gap-2"><Box size={16} strokeWidth={1.75} aria-hidden="true" /> ส่วนประกอบ (Components)</CardTitle><CardDescription>รายการชิ้นส่วนหลักของเครื่อง</CardDescription></div>
              <Button size="sm" onClick={() => { setCompDialog(true); setCompForm({}); setCompError(""); }}>
                <Plus size={15} strokeWidth={1.75} aria-hidden="true" /> เพิ่มชิ้นส่วน
              </Button>
            </CardHeader>
            <CardContent>
              {data.components && data.components.length > 0 ? (
                <SimpleDataTable columns={compColumns} data={data.components} idKey="id" pageSize={10} />
              ) : (
                <EmptyState title="ยังไม่มีชิ้นส่วน" description="เพิ่มชิ้นส่วนหลักของเครื่องเพื่อติดตามการเปลี่ยน" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" /> ประวัติการเปลี่ยนชิ้นส่วน</CardTitle>
              <CardDescription>บันทึกการเปลี่ยนชิ้นส่วนพร้อมเหตุผล — มี audit ทุกครั้ง</CardDescription>
            </CardHeader>
            <CardContent>
              {data.replacements && data.replacements.length > 0 ? (
                <SimpleDataTable columns={replColumns} data={data.replacements} idKey="id" pageSize={10} />
              ) : (
                <EmptyState title="ยังไม่มีการเปลี่ยนชิ้นส่วน" description="เมื่อเปลี่ยนชิ้นส่วนจะบันทึกประวัติไว้ที่นี่" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ OVERHAUL & CONDITION ═══════ */}
        <TabsContent value="overhaul">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle className="flex items-center gap-2"><Wrench size={16} strokeWidth={1.75} aria-hidden="true" /> งานยกเครื่อง (Overhaul)</CardTitle><CardDescription>รอบยกเครื่อง / บำรุงใหญ่ของเครื่อง</CardDescription></div>
              <Button size="sm" onClick={() => { setOhDialog(true); setOhForm({ status: "planned" }); setOhError(""); }}>
                <Plus size={15} strokeWidth={1.75} aria-hidden="true" /> วางแผน Overhaul
              </Button>
            </CardHeader>
            <CardContent>
              {data.overhauls && data.overhauls.length > 0 ? (
                <SimpleDataTable
                  columns={[
                    { key: "title", header: "ชื่องาน", renderCell: (r) => <div className="flex flex-col"><span className="font-semibold">{r.title || "—"}</span><span className="text-xs text-muted-foreground">{r.scope || "—"}</span></div> },
                    { key: "planned_start", header: "เริ่มตามแผน", renderCell: (r) => r.planned_start || r.actual_start || "—" },
                    { key: "completed", header: "ที่ทำจริง", renderCell: (r) => r.actual_start ? (r.actual_end || "ทำอยู่") : "—" },
                    { key: "status", header: "สถานะ", renderCell: (r) => {
                        const m: Record<string, any> = { planned: <AndonLamp status="idle" size="sm" showLabel />, in_progress: <AndonLamp status="warn" size="sm" showLabel />, completed: <AndonLamp status="ok" size="sm" showLabel />, cancelled: <AndonLamp status="idle" size="sm" showLabel /> };
                        return m[r.status] || <AndonLamp status="idle" size="sm" showLabel />;
                      } },
                    { key: "reason", header: "เหตุผล", renderCell: (r) => r.reason || "—" },
                  ]}
                  data={data.overhauls}
                  idKey="id"
                  pageSize={10}
                />
              ) : (
                <EmptyState title="ยังไม่มีงาน Overhaul" description="วางแผนงานยกเครื่องล่วงหน้าได้ที่นี่" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle className="flex items-center gap-2"><ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" /> ค่าวัดสภาพเครื่อง (Condition)</CardTitle><CardDescription>วัด manual — อุณหภูมิ แรงสั่นสะเทือน เสียง ฯลฯ</CardDescription></div>
              <Button size="sm" onClick={() => { setMeasDialog(true); setMeasForm({}); setMeasError(""); }}>
                <Plus size={15} strokeWidth={1.75} aria-hidden="true" /> บันทึกค่าวัด
              </Button>
            </CardHeader>
            <CardContent>
              {data.measurements && data.measurements.length > 0 ? (
                <SimpleDataTable
                  columns={[
                    { key: "parameter", header: "ดัชนี", renderCell: (r) => <span className="font-semibold">{r.parameter}</span> },
                    { key: "value", header: "ค่าวัด", align: "right", renderCell: (r) => <span className="tabular-nums font-semibold">{r.value_numeric}{r.unit ? ` ${r.unit}` : ""}</span> },
                    { key: "method", header: "วิธีวัด", renderCell: (r) => r.method || "—" },
                    { key: "measured_at", header: "วัดเมื่อ", renderCell: (r) => r.measured_at || r.created_at || "—" },
                    { key: "notes", header: "หมายเหตุ", renderCell: (r) => r.notes || "—" },
                    { key: "actions", header: "", align: "right", renderCell: (r) => <Button variant="ghost" size="icon-xs" className="text-destructive" title="ลบ" onClick={() => void deleteMeasurement(r.id)}><Trash2 size={15} strokeWidth={1.75} aria-hidden="true" /></Button> },
                  ]}
                  data={data.measurements}
                  idKey="id"
                  pageSize={10}
                />
              ) : (
                <EmptyState title="ยังไม่มีค่าวัดสภาพ" description="บันทึกค่าวัดตามรอบเพื่อติดตามแนวโน้มสภาพเครื่อง" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ DATA QUALITY ═══════ */}
        <TabsContent value="quality">
          <Card>
            <CardHeader>
              <CardTitle>คุณภาพข้อมูลของเครื่องนี้</CardTitle>
              <CardDescription>ตรวจความครบถ้วนของข้อมูลที่จำเป็นสำหรับการประเมิน reliability</CardDescription>
            </CardHeader>
            <CardContent>
              {dq?.score != null && (
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-border text-2xl font-bold tabular-nums" style={{ color: (dq.score as number) >= 80 ? "var(--cmms-success)" : (dq.score as number) >= 50 ? "var(--cmms-warning)" : "var(--cmms-danger)" }}>
                    {dq.score}
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">คะแนนความพร้อมข้อมูล / 100</p>
                    <p className="text-sm text-muted-foreground">{dq.notes || "ประเมินจากความครบถ้วนของข้อมูลที่จำเป็น"}</p>
                  </div>
                </div>
              )}
              {dq?.checks && dq.checks.length > 0 && (
                <div className="space-y-2">
                  {dq.checks.map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        {c.ok ? <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-success)]" /> : <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-warning)]" />}
                        <span className="text-sm">{c.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{c.detail || (c.ok ? "มีข้อมูล" : "ขาดข้อมูล")}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ DECISION SUPPORT ═══════ */}
        <TabsContent value="decision">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldAlert size={16} strokeWidth={1.75} aria-hidden="true" /> Decision Support (ข้อมูลประกอบการตัดสินใจ)</CardTitle>
              <CardDescription>จากข้อมูลจริงในระบบ — ไม่ใช่คำแนะนำอัตโนมัติให้เปลี่ยนหรือปลดระวางเครื่อง</CardDescription>
            </CardHeader>
            <CardContent>
              {data.decision_support?.disclaimer && (
                <Alert variant="info" title="ข้อความสำคัญ" description={data.decision_support.disclaimer} />
              )}
              <div className="mt-4">
                <VStack gap={1}>
                  <StatRow label="อายุเครื่อง" value={data.decision_support?.age_years != null ? `${data.decision_support.age_years} ปี` : "—"} />
                  <StatRow label="อายุการใช้งานที่เหลือ" value={data.decision_support?.remaining_life_years != null ? `${data.decision_support.remaining_life_years} ปี` : "—"} />
                  <StatRow label="ค่าใช้จ่ายรวมวงจร (LCC)" value={data.decision_support?.lifecycle_cost?.total != null ? `${Number(data.decision_support.lifecycle_cost.total).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="ค่าใช้จ่ายต่อปีทำการ" value={data.decision_support?.cost_per_operating_year != null ? `${Number(data.decision_support.cost_per_operating_year).toLocaleString("th-TH")} ฿/ปี` : "—"} />
                  <StatRow label="ค่าใช้จ่ายต่อความเสียหาย 1 ครั้ง" value={data.decision_support?.cost_per_failure_year != null ? `${Number(data.decision_support.cost_per_failure_year).toLocaleString("th-TH")} ฿/ครั้ง` : "—"} />
                  <StatRow label="ต้นทุนเครื่อง (purchase)" value={data.decision_support?.lifecycle_cost?.purchase_cost != null ? `${Number(data.decision_support.lifecycle_cost.purchase_cost).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="ต้นทุนติดตั้ง" value={data.decision_support?.lifecycle_cost?.installation_cost != null ? `${Number(data.decision_support.lifecycle_cost.installation_cost).toLocaleString("th-TH")} ฿` : "—"} />
                  <StatRow label="ค่าซ่อมบำรุงสะสม" value={data.decision_support?.lifecycle_cost?.maintenance_cost_total != null ? `${Number(data.decision_support.lifecycle_cost.maintenance_cost_total).toLocaleString("th-TH")} ฿` : "—"} />
                  {data.decision_support?.lifecycle_cost?.note && <p className="mt-2 text-xs text-muted-foreground">{data.decision_support.lifecycle_cost.note}</p>}
                </VStack>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Lifecycle change dialog ── */}
      <Dialog open={lifecycleDialog} onClose={() => setLifecycleDialog(false)} title="เปลี่ยนสถานะวงจรชีวิต">
        <div className="space-y-4">
          {lifeOk && <Alert variant="success" title="สำเร็จ" description={lifeOk} />}
          {lifeError && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={lifeError} />}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">จาก: <AndonLamp status="idle" size="sm" showLabel /></p>
            <Select value={lifeTo} onValueChange={setLifeTo}>
              <SelectTrigger aria-label="สถานะใหม่"><SelectValue placeholder="เลือกสถานะใหม่" /></SelectTrigger>
              <SelectContent>
                {canLifeChange.map((s) => <SelectItem key={s} value={s}>{LIFE_LABELS[s] || s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea label="เหตุผล (จำเป็น)" value={lifeReason} onChange={(e) => setLifeReason(e.target.value)} placeholder="ระบุเหตุผลในการเปลี่ยนสถานะ" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLifecycleDialog(false)}>ยกเลิก</Button>
            <Button disabled={lifeBusy || !lifeTo || !lifeReason.trim()} onClick={submitLifecycle}>{lifeBusy ? "กำลังบันทึก..." : "บันทึกการเปลี่ยน"}</Button>
          </div>
        </div>
      </Dialog>

      {/* ── Criticality dialog ── */}
      <Dialog open={critDialog} onClose={() => setCritDialog(false)} title="ประเมินความสำคัญ (Criticality A-D)">
        <div className="space-y-4">
          {critOk && <Alert variant="success" title="สำเร็จ" description={critOk} />}
          {critError && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={critError} />}
          <p className="text-sm text-muted-foreground">
            ให้คะแนนแต่ละปัจจัย 0-100 (รวมน้ำหนักจาก config อัตโนมัติ) — คะแนนรวมจะถูกคำนวณและบันทึกลง asset_registry
          </p>
          <div className="space-y-3">
            {(["production", "safety", "quality", "cost", "downtime", "frequency", "redundancy"] as const).map((k, i) => (
              <div key={k} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{["ผลกระทบต่อการผลิต", "ความเสี่ยงความปลอดภัย", "ผลกระทบคุณภาพ", "ค่าเสียหาย", "ระยะเวลาหยุด", "ความถี่การเสีย", "การมีเครื่องสำรอง"][i]}</span>
                  <span className="font-semibold">{critFactors[k] ?? "50"}/100</span>
                </div>
                <Input
                  type="range" min={0} max={100} step={5}
                  value={critFactors[k] ?? "50"}
                  onChange={(e) => setCritFactors((prev) => ({ ...prev, [k]: e.target.value }))}
                  aria-label={String(["ผลผลิต", "ปลอดภัย", "คุณภาพ", "ค่าใช้จ่าย", "Downtime", "ความถี่", "สำรอง"][i])}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCritDialog(false)}>ยกเลิก</Button>
            <Button disabled={critBusy} onClick={submitCriticality}>{critBusy ? "กำลังประเมิน..." : "บันทึกการประเมิน"}</Button>
          </div>
        </div>
      </Dialog>

      {/* ── Add component dialog ── */}
      <Dialog open={compDialog} onClose={() => setCompDialog(false)} title="เพิ่มส่วนประกอบ">
        <div className="space-y-4">
          {compError && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={compError} />}
          <div className="space-y-3">
            <Input label="รหัสชิ้นส่วน" value={compForm.component_code || ""} onChange={(e) => setCompForm((p) => ({ ...p, component_code: e.target.value }))} />
            <Input label="ชื่อชิ้นส่วน" value={compForm.name || ""} onChange={(e) => setCompForm((p) => ({ ...p, name: e.target.value }))} />
            <Input label="Serial เริ่มต้น" value={compForm.serial_number || ""} onChange={(e) => setCompForm((p) => ({ ...p, serial_number: e.target.value }))} />
            <Input label="จำนวน" type="number" value={compForm.qty || ""} onChange={(e) => setCompForm((p) => ({ ...p, qty: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCompDialog(false)}>ยกเลิก</Button>
            <Button disabled={compBusy} onClick={submitComponent}>{compBusy ? "กำลังบันทึก..." : "บันทึกชิ้นส่วน"}</Button>
          </div>
        </div>
      </Dialog>

      {/* ── Replace component dialog ── */}
      <Dialog open={!!replDialog} onClose={() => setReplDialog(null)} title={`เปลี่ยนชิ้นส่วน ${replDialog?.component?.name || ""}`}>
        <div className="space-y-4">
          {replError && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={replError} />}
          <div className="space-y-3">
            <Input label="Serial ใหม่" value={replForm.new_serial || ""} onChange={(e) => setReplForm((p) => ({ ...p, new_serial: e.target.value }))} />
            <Input label="วันที่เปลี่ยน" type="date" value={replForm.replaced_at || ""} onChange={(e) => setReplForm((p) => ({ ...p, replaced_at: e.target.value }))} />
            <Input label="ค่าใช้จ่าย (บาท)" type="number" value={replForm.cost || ""} onChange={(e) => setReplForm((p) => ({ ...p, cost: e.target.value }))} />
            <Input label="เลขที่ใบซ่อม/เอกสารอ้างอิง" value={replForm.reference_doc || ""} onChange={(e) => setReplForm((p) => ({ ...p, reference_doc: e.target.value }))} />
            <Textarea label="เหตุผลที่เปลี่ยน" value={replForm.reason || ""} onChange={(e) => setReplForm((p) => ({ ...p, reason: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReplDialog(null)}>ยกเลิก</Button>
            <Button disabled={replBusy || !(replForm.reason || "").trim()} onClick={submitReplacement}>{replBusy ? "กำลังบันทึก..." : "บันทึกการเปลี่ยน"}</Button>
          </div>
        </div>
      </Dialog>

      {/* ── Add measurement dialog ── */}
      <Dialog open={measDialog} onClose={() => setMeasDialog(false)} title="บันทึกค่าวัดสภาพ">
        <div className="space-y-4">
          {measError && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={measError} />}
          <div className="space-y-3">
            <Input label="ดัชนีที่วัด (เช่น เย็น/สั่น/เสียง)" value={measForm.parameter || ""} onChange={(e) => setMeasForm((p) => ({ ...p, parameter: e.target.value }))} />
            <Input label="ค่าวัด" type="number" value={measForm.value_numeric || ""} onChange={(e) => setMeasForm((p) => ({ ...p, value_numeric: e.target.value }))} />
            <Input label="หน่วย" value={measForm.unit || ""} onChange={(e) => setMeasForm((p) => ({ ...p, unit: e.target.value }))} />
            <Input label="วันที่วัด" type="date" value={measForm.measured_at || ""} onChange={(e) => setMeasForm((p) => ({ ...p, measured_at: e.target.value }))} />
            <Input label="วิธีวัด" value={measForm.method || ""} onChange={(e) => setMeasForm((p) => ({ ...p, method: e.target.value }))} />
            <Textarea label="หมายเหตุ" value={measForm.notes || ""} onChange={(e) => setMeasForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMeasDialog(false)}>ยกเลิก</Button>
            <Button disabled={measBusy} onClick={submitMeasurement}>{measBusy ? "กำลังบันทึก..." : "บันทึกค่าวัด"}</Button>
          </div>
        </div>
      </Dialog>

      {/* ── Overhaul dialog ── */}
      <Dialog open={ohDialog} onClose={() => setOhDialog(false)} title="วางแผนงานยกเครื่อง (Overhaul)">
        <div className="space-y-4">
          {ohError && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={ohError} />}
          <div className="space-y-3">
            <Input label="ชื่องาน" value={ohForm.title || ""} onChange={(e) => setOhForm((p) => ({ ...p, title: e.target.value }))} />
            <Textarea label="ขอบเขตงาน (Scope)" value={ohForm.scope || ""} onChange={(e) => setOhForm((p) => ({ ...p, scope: e.target.value }))} />
            <Input label="วันที่เริ่มตามแผน" type="date" value={ohForm.planned_start || ""} onChange={(e) => setOhForm((p) => ({ ...p, planned_start: e.target.value }))} />
            <Input label="วันที่สิ้นสุดตามแผน" type="date" value={ohForm.planned_end || ""} onChange={(e) => setOhForm((p) => ({ ...p, planned_end: e.target.value }))} />
            <Textarea label="เหตุผล/แรงจูงใจ" value={ohForm.reason || ""} onChange={(e) => setOhForm((p) => ({ ...p, reason: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOhDialog(false)}>ยกเลิก</Button>
            <Button disabled={ohBusy || !(ohForm.title || "").trim()} onClick={submitOverhaul}>{ohBusy ? "กำลังบันทึก..." : "บันทึกแผน Overhaul"}</Button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}