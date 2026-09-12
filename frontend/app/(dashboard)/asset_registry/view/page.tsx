"use client";

// Machine Detail (asset_registry/view) — Phase 10
// แสดงข้อมูลเครื่องจักรครบทั้ง 13 ฟิลด์ + Quick Actions + ประวัติ (Repair/PM/Cal/Inspection)
// + ความสัมพันธ์ (BOM part, ผู้รับผิดชอบ) + QR — ใช้ data จริงจาก API เติม
// Responsive: Desktop grid / Tablet 2-col / Mobile stack (quick actions เต็มความกว้าง)

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { usePageHero } from "@/lib/i18n";
import { useMenuPermission } from "@/lib/useMenuPermission";
import { Grid, VStack, HStack } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import {
  Building2,
  Wrench,
  QrCode,
  SquarePen,
  ArrowLeft,
  Timer,
  Scale,
  Layers,
  User,
  MapPin,
  CalendarClock,
  ClipboardCheck,
  History,
  Network,
  PackageOpen,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

// ── mobile detection (pattern เดียวกับ spare_parts page) ──
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

// ── แปลงสถานะจริงจาก DB (asset_registry.status enum) เป็นค่าที่ UI ใช้ ──
const dbStatusToUi: Record<string, string> = {
  active: "running",
  under_repair: "maintenance",
  inactive: "standby",
  disposed: "standby",
};

const statusMap: Record<string, { label: string }> = {
  running: { label: "กำลังทำงานปกติ" },
  breakdown: { label: "เครื่องเสีย" },
  maintenance: { label: "กำลังทำซ่อมบำรุง" },
  standby: { label: "พร้อมใช้งาน" },
};

const statusBadgeVariant: Record<string, "success" | "danger" | "warning" | "info"> = {
  running: "success",
  breakdown: "danger",
  maintenance: "warning",
  standby: "info",
};

const criticalityBadgeVariant: Record<string, "danger" | "warning" | "neutral"> = {
  A: "danger",
  B: "warning",
  C: "neutral",
};

type TimelineKind = "repair" | "pm" | "calibration" | "inspection";

type TimelineEvent = {
  key: string;
  kind: TimelineKind;
  date: string;
  title: string;
  detail: string;
  status?: string;
  statusVariant: "success" | "danger" | "warning" | "info" | "neutral";
  href?: string;
  cost?: number;
  assignee?: string;
};

const kindMeta: Record<TimelineKind, { label: string; icon: typeof Wrench }> = {
  repair: { label: "งานซ่อม", icon: Wrench },
  pm: { label: "PM/AM", icon: Timer },
  calibration: { label: "สอบเทียบ", icon: Scale },
  inspection: { label: "ตรวจเช็ค", icon: ClipboardCheck },
};

const INSPECTION_RESULT_LABELS: Record<string, string> = {
  pass: "ผ่าน", pass_with_warning: "ผ่าน (ข้อสังเกต)", fail: "ไม่ผ่าน", critical_fail: "วิกฤต",
};

function repairStatusVariant(s?: string): TimelineEvent["statusVariant"] {
  switch (s) {
    case "completed": return "success";
    case "in_progress": return "info";
    case "open": return "warning";
    case "cancelled": case "rejected": return "neutral";
    default: return "info";
  }
}

function pmStatusVariant(s?: string): TimelineEvent["statusVariant"] {
  switch (s) {
    case "completed": return "success";
    case "in_progress": return "info";
    case "overdue": return "danger";
    case "pending": return "warning";
    default: return "info";
  }
}

interface BomPart {
  id: number;
  part_code?: string;
  part_name?: string;
  unit?: string;
  stock_qty?: string | number;
  default_qty?: string | number;
  remarks?: string;
}

interface AssetData {
  id: number | string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  location?: string;
  criticality?: "A" | "B" | "C";
  department?: string;
  department_id?: string | number;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  purchase_date?: string | null;
  warranty_expiry?: string | null;
  status?: string;
  responsible_user_id?: string | number;
  location_id?: string | number;
  work_zone_id?: string | number;
  barcode?: string;
  qr_code_path?: string;
  image_path?: string;
  instruction_manual?: string;
  in_place_edit?: string | number;
  running_hours_month?: string | number;
  created_at?: string;
  updated_at?: string;
}

interface UserRow {
  id: number | string;
  full_name: string;
}

interface PickingRow {
  id: number | string;
  asset_id?: string | number;
  asset_code?: string;
  title?: string;
  status?: string;
  assigned_to_name?: string;
  [k: string]: unknown;
}

interface RepairRow {
  id: number | string;
  work_order_no: string;
  title?: string;
  status?: string;
  assigned_name?: string;
  created_at?: string;
  completed_at?: string;
  cost_parts?: string | number;
  cost_labor?: string | number;
  [k: string]: unknown;
}

interface CalibrationRow {
  id: number | string;
  asset_id?: string | number;
  standard_used?: string;
  result?: string;
  status?: string;
  performed_name?: string;
  calibration_date?: string;
  next_calibration_date?: string;
  total_cost?: string | number;
  [k: string]: unknown;
}

interface ScheduleRow {
  id: number | string;
  template_title?: string;
  status?: string;
  assignee_name?: string;
  due_date?: string;
  [k: string]: unknown;
}

const APP_BASE =
  (typeof window !== "undefined" && window.location.origin) ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3001";

export default function AssetRegistryViewPage() {
  const router = useRouter();
  const hero = usePageHero("asset_registry");
  const isNarrow = useIsNarrow();
  const { canShow } = useMenuPermission();

  const [assetId, setAssetId] = useState<string>("");
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [bom, setBom] = useState<BomPart[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [pmTasks, setPmTasks] = useState<PickingRow[]>([]);
  const [calibrations, setCalibrations] = useState<CalibrationRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | TimelineKind>("all");
  const [qrUrl, setQrUrl] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrGenerating, setQrGenerating] = useState(false);

  const filtersApplied = useRef(false);

  // ── read ?id= from URL (pattern เดียวกับหน้า edit/checksheet) ──
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const id = p.get("id")?.trim();
      if (id) setAssetId(id);
    } catch { /* ignore */ }
  }, []);

  const buildTimeline = useCallback((
    assetCode: string
  ): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    for (const r of repairs) {
      events.push({
        key: `repair-${r.id}`,
        kind: "repair",
        date: r.created_at || r.completed_at || "",
        title: r.work_order_no,
        detail: r.title || "ใบสั่งงานซ่อม",
        status: r.status,
        statusVariant: repairStatusVariant(r.status),
        href: `/repair/view?id=${r.id}`,
        cost: Number(r.cost_parts || 0) + Number(r.cost_labor || 0),
        assignee: r.assigned_name,
      });
    }

    for (const p of pmTasks) {
      events.push({
        key: `pm-${p.id}`,
        kind: "pm",
        date: String(p.due_date || p.created_at || ""),
        title: p.title || `PM ${assetCode}`,
        detail: `งาน PM/AM · ${assetCode}`,
        status: p.status,
        statusVariant: pmStatusVariant(p.status),
        href: `/pm_am/view?id=${p.id}`,
        assignee: p.assigned_to_name || undefined,
      });
    }

    for (const c of calibrations) {
      events.push({
        key: `cal-${c.id}`,
        kind: "calibration",
        date: c.calibration_date || c.next_calibration_date || "",
        title: c.standard_used ? `สอบเทียบด้วย ${c.standard_used}` : "รายการสอบเทียบ",
        detail: c.status ? `ผล ${c.status}` : "",
        status: c.result || c.status,
        statusVariant: String(c.status).toLowerCase() === "passed" ? "success" : String(c.status).toLowerCase() === "failed" ? "danger" : "info",
        href: `/calibration?id=${c.id}`,
        cost: Number(c.total_cost || 0) || undefined,
        assignee: c.performed_name || undefined,
      });
    }

    for (const s of schedules) {
      const done = s.status === "completed";
      const res = String(s.result || "");
      const failCount = Number(s.fail_count || 0);
      events.push({
        key: `ins-${s.id}`,
        kind: "inspection",
        date: String(s.completed_at || s.due_date || ""),
        title: String(s.template_title || "ตารางตรวจเช็ค"),
        detail: done
          ? `ผลตรวจ: ${INSPECTION_RESULT_LABELS[res] || res || "-"}${failCount > 0 ? ` (ไม่ผ่าน ${failCount} ข้อ)` : ""}`
          : s.status === "overdue"
            ? "เกินกำหนดตรวจ (ยังไม่ทำ)"
            : "แผนตรวจเช็ครอบ — กดเพื่อทำตรงนี้",
        status: done ? (INSPECTION_RESULT_LABELS[res] || res) : s.status === "overdue" ? "เกินกำหนด" : "รอดำเนินการ",
        statusVariant: res === "fail" || res === "critical_fail"
          ? "danger"
          : res === "pass_with_warning" ? "warning"
            : done ? "success"
              : s.status === "overdue" ? "danger" : pmStatusVariant(String(s.status)),
        href: done ? `/inspections/history?asset_id=${String(s.asset_id ?? assetId)}` : `/inspections/run?schedule_id=${s.id}`,
        assignee: s.assignee_name ? String(s.assignee_name) : undefined,
      });
    }

    return events.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [repairs, pmTasks, calibrations, schedules]);

  const timeline = useMemo(() => buildTimeline(asset?.code || ""), [buildTimeline, asset?.code]);

  const filteredTimeline = useMemo(() => {
    if (kindFilter === "all") return timeline;
    return timeline.filter((e) => e.kind === kindFilter);
  }, [timeline, kindFilter]);

  const repairCount = repairs.length;
  const openRepairCount = repairs.filter((r) => ["open", "in_progress"].includes(String(r.status))).length;
  const totalCost = repairs.reduce((sum, r) => sum + Number(r.cost_parts || 0) + Number(r.cost_labor || 0), 0);

  const responsibleUser = useMemo(() => {
    if (!asset?.responsible_user_id) return undefined;
    return users.find((u) => String(u.id) === String(asset.responsible_user_id))?.full_name;
  }, [asset, users]);

  

  // ── load asset + related ──
  useEffect(() => {
    if (!assetId || filtersApplied.current) return;
    filtersApplied.current = true;
    setLoading(true);
    setError("");

    const run = async () => {
      try {
        const [assetRes, usersRes] = await Promise.allSettled([
          fetch(`/api/v1/asset_registry.php?id=${encodeURIComponent(assetId)}`),
          fetch("/api/v1/index.php?resource=users"),
        ]);

        const ark = assetRes.status === "fulfilled" ? assetRes.value : null;
        if (!ark) throw new Error("Asset request failed");
        const assetJson = await ark.json();
        if (!assetJson || typeof assetJson !== "object" || !assetJson.code) {
          throw new Error("Not found");
        }
        setAsset(assetJson as AssetData);

        if (usersRes.status === "fulfilled") {
          const uj = await usersRes.value.json();
          if (Array.isArray(uj?.data)) setUsers(uj.data as UserRow[]);
        }

        const code = String(assetJson.code);
        const urlId = Number(assetId) || 0;

        const [p1, p2, p3, p4, p5] = await Promise.allSettled([
          fetch(`/api/v1/repair.php?asset_code=${encodeURIComponent(code)}`),
          fetch("/api/v1/index.php?resource=pm-plans"),
          fetch("/api/v1/calibration.php"),
          fetch(`/api/v1/machine_bom.php?asset_id=${encodeURIComponent(assetId)}`),
          fetch(`/api/v1/inspections.php?schedules=1&asset_id=${encodeURIComponent(assetId)}`),
        ]);

        if (p1.status === "fulfilled") {
          const j = await p1.value.json();
          if (Array.isArray(j)) setRepairs(j as RepairRow[]);
        }
        if (p2.status === "fulfilled") {
          const j = await p2.value.json();
          const list = Array.isArray(j?.data) ? (j.data as PickingRow[]) : [];
          setPmTasks(list.filter((x) => String(x.asset_code) === code || String(x.asset_id) === String(assetId)));
        }
        if (p3.status === "fulfilled") {
          const j = await p3.value.json();
          if (Array.isArray(j)) setCalibrations((j as CalibrationRow[]).filter((c) => String(c.asset_id) === String(assetId)));
        }
        if (p4.status === "fulfilled") {
          const j = await p4.value.json();
          const list = Array.isArray(j?.data) ? j.data : [];
          setBom(list as BomPart[]);
        }
        if (p5.status === "fulfilled") {
          const j = await p5.value.json();
          if (Array.isArray(j)) setSchedules(j as ScheduleRow[]);
        }
      } catch (e) {
        console.error("Fetch asset detail error:", e);
        setError("ไม่พบข้อมูลเครื่องจักร หรือโหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [assetId]);

  // ── generate QR (ไปหน้า /scan?asset_code=) ──
  const openQr = async () => {
    if (!asset?.code || qrGenerating) return;
    setQrGenerating(true);
    try {
      const url = `${APP_BASE}/scan?asset_code=${encodeURIComponent(asset.code)}`;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "var(--cmms-primary, #0068B5)", light: "#FFFFFF" },
      });
      setQrUrl(dataUrl);
      setQrOpen(true);
    } catch {
      setError("สร้าง QR Code ไม่สำเร็จ");
    } finally {
      setQrGenerating(false);
    }
  };

  // ── loading skeleton ──
  if (loading) {
    return (
      <PageShell
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: "รายละเอียดเครื่องจักร" }]}
        title="รายละเอียดเครื่องจักร"
        description="กำลังโหลดข้อมูล..."
      >
        <Card>
          <CardContent className="flex items-center justify-center p-10">
            <Spinner label="กำลังโหลดข้อมูลเครื่องจักร..." />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (error || !asset) {
    return (
      <PageShell
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: "รายละเอียดเครื่องจักร" }]}
        title="รายละเอียดเครื่องจักร"
      >
        {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}
        <EmptyState
          icon={<Building2 size={32} strokeWidth={1.5} />}
          title="ไม่พบเครื่องจักร"
          description="อาจถูกแก้ไขหรือลบไปแล้ว ลองเลือกเครื่องจักรจากรายการ"
          action={
            <Button onClick={() => router.push("/asset_registry")}>
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
              กลับไปหน้ารายการเครื่องจักร
            </Button>
          }
        />
      </PageShell>
    );
  }

  const uiStatus = dbStatusToUi[String(asset.status).toLowerCase()] || String(asset.status || "running");
  const image = asset.image_path
    ? (() => {
        const cleaned = String(asset.image_path).replace(/\\/g, "/");
        return cleaned.startsWith("data:") || cleaned.startsWith("/") || cleaned.startsWith("http") ? cleaned : "/" + cleaned;
      })()
    : null;

  const quickActions = (
    <HStack gap={2} vAlign="center" className="flex-wrap">
      {canShow("asset_registry") && (
        <Button variant="secondary" onClick={() => router.push(`/asset_registry/edit?id=${assetId}`)}>
          <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" />
          แก้ไข
        </Button>
      )}
      <Button variant="secondary" onClick={openQr} disabled={qrGenerating}>
        <QrCode size={16} strokeWidth={1.75} aria-hidden="true" />
        QR Code
      </Button>
      {canShow("repair/request") && (
        <Button variant="secondary" onClick={() => router.push(`/repair/create?asset_code=${encodeURIComponent(asset.code)}`)}>
          <Wrench size={16} strokeWidth={1.75} aria-hidden="true" />
          สร้างงานซ่อม
        </Button>
      )}
      {canShow("repair/request") && (
        <Button variant="secondary" onClick={() => router.push(`/repair/request?asset_code=${encodeURIComponent(asset.code)}`)}>
          <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          แจ้งซ่อมด่วน
        </Button>
      )}
      {canShow("pm_am/checksheet") && (
        <Button variant="secondary" onClick={() => router.push(`/pm_am/checksheet?asset_code=${encodeURIComponent(asset.code)}`)}>
          <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />
          ทำเช็คชีท PM
        </Button>
      )}
      <Button variant="outline" onClick={() => router.push("/asset_registry")}>
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        กลับ
      </Button>
    </HStack>
  );

  // ── 13 ฟิลด์ที่ต้องแสดง ──
  const infoFields: { label: string; icon: typeof MapPin; value: React.ReactNode }[] = [
    { label: "รหัสเครื่องจักร", icon: Building2, value: <span className="font-semibold">{asset.code}</span> },
    { label: "ชื่อเครื่องจักร", icon: Building2, value: asset.name || "-" },
    { label: "ประเภท", icon: Layers, value: asset.category || "-" },
    { label: "Serial Number", icon: Timer, value: asset.serial_number || "-" },
    { label: "รุ่น (Model)", icon: Layers, value: asset.model || "-" },
    { label: "ผู้ผลิต", icon: Building2, value: asset.manufacturer || "-" },
    { label: "ตำแหน่งที่ตั้ง", icon: MapPin, value: asset.location || "-" },
    { label: "แผนก", icon: User, value: asset.department || "-" },
    { label: "วันที่ติดตั้ง", icon: CalendarClock, value: asset.purchase_date ? String(asset.purchase_date).slice(0, 10) : "-" },
    { label: "ประกันหมดอายุ", icon: CalendarClock, value: asset.warranty_expiry ? String(asset.warranty_expiry).slice(0, 10) : "-" },
    {
      label: "ความสำคัญ", icon: ShieldAlert,
      value: asset.criticality ? (
        <Badge variant={criticalityBadgeVariant[asset.criticality] || "neutral"}>เกรด {asset.criticality}</Badge>
      ) : "-",
    },
    {
      label: "สถานะปัจจุบัน", icon: Network,
      value: (
        <Badge variant={statusBadgeVariant[uiStatus] || "info"} dot>
          {statusMap[uiStatus]?.label || uiStatus}
        </Badge>
      ),
    },
    { label: "สภาพ", icon: Timer, value: Number(asset.in_place_edit) === 1 ? "ซ่อมได้ในสถานที่ (In-place)" : asset.description || "-" },
  ];

  const extraFields: { label: string; value: React.ReactNode }[] = [
    { label: "ผู้รับผิดชอบ", value: responsibleUser || "-" },
    { label: "โซนทำงาน / Work Zone", value: String(asset.work_zone_id ?? "-") },
    { label: "ชั่วโมงเดินเครื่อง/เดือน", value: String(asset.running_hours_month ?? "-") },
    { label: "Barcode", value: asset.barcode || "-" },
    { label: "คู่มือ/เอกสารแนบ", value: asset.instruction_manual ? String(asset.instruction_manual) : "-" },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: hero.title }]}
      title={`${asset.code} — ${asset.name}`}
      description={asset.description || "รายละเอียดเครื่องจักร"}
    >
      {/* Quick actions (stack บนมือถือ) */}
      <Card>
        <CardContent className="p-4">{quickActions}</CardContent>
      </Card>

      {/* KPI strip */}
      <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--cmms-info-light)", color: "var(--cmms-info)" }}>
              <History size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ใบสั่งงานซ่อมทั้งหมด</p>
              <h2 className="text-xl font-semibold tabular-nums">{repairCount}</h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
              <Wrench size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">งานที่ยังเปิดอยู่</p>
              <h2 className="text-xl font-semibold tabular-nums">{openRepairCount}</h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary)" }}>
              <PackageOpen size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ชิ้นส่วนใน BOM</p>
              <h2 className="text-xl font-semibold tabular-nums">{bom.length}</h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger)" }}>
              <Scale size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ค่าซ่อมรวม</p>
              <h2 className="text-xl font-semibold tabular-nums">{totalCost.toLocaleString("th-TH")} <span className="text-sm font-normal">บาท</span></h2>
            </div>
          </CardContent>
        </Card>
      </Grid>

      <Tabs defaultValue="overview">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="history">ประวัติ ({timeline.length})</TabsTrigger>
          <TabsTrigger value="relationship">ความสัมพันธ์</TabsTrigger>
        </TabsList>

        {/* ═══ ภาพรวม ═══ */}
        <TabsContent value="overview" className="space-y-5">
          <Grid columns={isNarrow ? 1 : { minWidth: 240, max: 4 }} gap={4}>
            {/* รูป + QR + ข้อมูลหลัก */}
            <Card className={isNarrow ? "" : "md:col-span-1"}>
              <CardContent className="flex flex-col items-center gap-3 p-4">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={asset.name}
                    className="h-40 w-40 rounded-xl border border-border object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center rounded-xl bg-[var(--cmms-bg-muted)] text-base text-[var(--cmms-text-muted)]">
                    <Building2 size={48} strokeWidth={1.25} aria-hidden="true" />
                  </div>
                )}
                <Badge variant={statusBadgeVariant[uiStatus] || "info"} dot className="text-sm">
                  {statusMap[uiStatus]?.label || uiStatus}
                </Badge>
                <div className="flex items-center gap-2">
                  <Badge variant={criticalityBadgeVariant[asset.criticality || "B"] || "neutral"}>เกรด {asset.criticality || "B"}</Badge>
                  <Badge variant="primary" className="font-mono">{asset.code}</Badge>
                </div>
              </CardContent>
            </Card>

            {/* ข้อมูลหลัก 13 ฟิลด์ */}
            <Card className={isNarrow ? "" : "md:col-span-3"}>
              <CardHeader>
                <CardTitle className="text-base">ข้อมูลทรัพย์สิน</CardTitle>
              </CardHeader>
              <CardContent>
                <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
                  {infoFields.map((f) => (
                    <VStack key={f.label} gap={1} className="rounded-lg border border-[var(--cmms-border)] p-3">
                      <HStack gap={1.5} vAlign="center">
                        <f.icon size={14} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-text-muted)]" />
                        <p className="text-xs text-muted-foreground">{f.label}</p>
                      </HStack>
                      <div className="text-sm font-medium">{f.value}</div>
                    </VStack>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* ข้อมูลเพิ่มเติม */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ข้อมูลเพิ่มเติม</CardTitle>
            </CardHeader>
            <CardContent>
              <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
                {extraFields.map((f) => (
                  <VStack key={f.label} gap={1}>
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-sm font-medium">{f.value}</p>
                  </VStack>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ ประวัติ ═══ */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">ประวัติเครื่องจักร</CardTitle>
                <HStack gap={1} className="flex-wrap">
                  <Button variant="ghost" className={kindFilter === "all" ? "bg-[var(--cmms-bg-muted)]" : ""} onClick={() => setKindFilter("all")}>
                    ทั้งหมด
                  </Button>
                  {(["repair", "pm", "calibration", "inspection"] as const).map((k) => {
                    const Icon = kindMeta[k].icon;
                    const count = timeline.filter((e) => e.kind === k).length;
                    return (
                      <Button key={k} variant="ghost" className={kindFilter === k ? "bg-[var(--cmms-bg-muted)]" : ""} onClick={() => setKindFilter(k)}>
                        <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                        {kindMeta[k].label} ({count})
                      </Button>
                    );
                  })}
                </HStack>
              </div>
            </CardHeader>
            <CardContent>
              {filteredTimeline.length === 0 ? (
                <EmptyState
                  icon={<History size={32} strokeWidth={1.5} />}
                  title="ยังไม่มีประวัติ"
                  description={`ยังไม่มี${kindFilter === "all" ? "การดำเนินการใด" : `งาน${kindMeta[kindFilter].label}`}ของเครื่องนี้`}
                  action={
                    canShow("repair/request") ? (
                      <Button onClick={() => router.push(`/repair/create?asset_code=${encodeURIComponent(asset.code)}`)}>
                        <Wrench size={16} strokeWidth={1.75} aria-hidden="true" />
                        สร้างงานซ่อมแรก
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <ol className="relative space-y-4 border-l border-[var(--cmms-border)] pl-5">
                  {filteredTimeline.map((ev) => {
                    const Icon = kindMeta[ev.kind].icon;
                    return (
                      <li key={ev.key} className="relative">
                        <span
                          aria-hidden="true"
                          className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full border border-[var(--cmms-border)] bg-card"
                        >
                          <Icon size={11} strokeWidth={2} className="text-[var(--cmms-text-muted)]" />
                        </span>
                        <Card className="overflow-hidden">
                          <CardContent className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">{ev.title}</span>
                                <Badge variant={ev.statusVariant}>{ev.status || "—"}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{ev.detail}</p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {ev.date && <span className="tabular-nums">{ev.date.slice(0, 16).replace("T", " ")}</span>}
                                {ev.assignee && <span>ผู้รับผิดชอบ: {ev.assignee}</span>}
                                {typeof ev.cost === "number" && ev.cost > 0 && (
                                  <span>ค่าใช้จ่าย: {ev.cost.toLocaleString("th-TH")} บาท</span>
                                )}
                              </div>
                            </div>
                            {ev.href && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => router.push(ev.href!)}
                              >
                                <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
                                เปิด
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ ความสัมพันธ์ ═══ */}
        <TabsContent value="relationship" className="space-y-5">
          <Grid columns={isNarrow ? 1 : { minWidth: 260, max: 2 }} gap={4}>
            {/* BOM */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageOpen size={16} strokeWidth={1.75} aria-hidden="true" />
                  ชิ้นส่วนประกอบ (BOM)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bom.length === 0 ? (
                  <EmptyState
                    icon={<PackageOpen size={28} strokeWidth={1.5} />}
                    title="ยังไม่มี BOM"
                    description="ยังไม่มีชิ้นส่วนบันทึกไว้ใน BOM ของเครื่องนี้"
                  />
                ) : (
                  <ul className="space-y-2">
                    {bom.map((b, i) => (
                      <li key={`${b.id}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--cmms-border)] p-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-semibold">{b.part_name || `Part #${b.id}`}</p>
                          <p className="text-xs text-muted-foreground font-mono">{b.part_code}</p>
                          {b.remarks && <p className="text-xs text-muted-foreground">{b.remarks}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <Badge variant="neutral">ใช้ {String(b.default_qty ?? "-")} {b.unit || ""}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* ผู้รับผิดชอบ + โซน */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User size={16} strokeWidth={1.75} aria-hidden="true" />
                  ผู้รับผิดชอบ & โซน
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <VStack gap={1}>
                  <p className="text-xs text-muted-foreground">ผู้รับผิดชอบบำรุงรักษา</p>
                  <p className="text-sm font-semibold">{responsibleUser || "—"}</p>
                </VStack>
                <VStack gap={1}>
                  <p className="text-xs text-muted-foreground">แผนก</p>
                  <p className="text-sm font-medium">{asset.department || "—"}</p>
                </VStack>
                <VStack gap={1}>
                  <p className="text-xs text-muted-foreground">ตำแหน่ง / โซน</p>
                  <p className="text-sm font-medium">{asset.location || "—"}{asset.work_zone_id ? ` · Work Zone ${asset.work_zone_id}` : ""}</p>
                </VStack>
              </CardContent>
            </Card>
          </Grid>

          {/* อะไหล่สต็อกใน BOM */}
          {bom.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">อะไหล่ที่เกี่ยวข้อง (สต็อก)</CardTitle>
              </CardHeader>
              <CardContent>
                <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
                  {bom.map((b, i) => (
                    <VStack key={`${b.id}-${i}`} gap={1} className="rounded-lg border border-[var(--cmms-border)] p-3">
                      <p className="text-sm font-semibold truncate">{b.part_name || `Part #${b.id}`}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{b.part_code}</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {Number(b.stock_qty || 0).toLocaleString("th-TH")} <span className="text-xs font-normal text-muted-foreground">{b.unit || ""}</span>
                      </p>
                    </VStack>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ QR Modal ═══ */}
      <Dialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title={`QR Code — ${asset.code}`}
        description="สแกนด้วย LINE / กล้องเพื่อแจ้งซ่อมหรือทำ PM ตรงเครื่องนี้"
      >
        <div className="flex flex-col items-center gap-3">
          {qrUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt={`QR Code ของ ${asset.code}`} className="h-56 w-56 rounded-lg" />
          )}
          <p className="text-sm text-muted-foreground">{asset.code} — {asset.name}</p>
          <Button className="w-full" onClick={() => router.push(`/scan?asset_code=${encodeURIComponent(asset.code)}`)}>
            <QrCode size={16} strokeWidth={1.75} aria-hidden="true" />
            เปิดหน้าแสกนเครื่องนี้
          </Button>
        </div>
      </Dialog>
    </PageShell>
  );
}