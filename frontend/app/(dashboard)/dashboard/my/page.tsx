"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { useMenuPermission } from "@/lib/useMenuPermission";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import AndonLamp from "@/components/AndonLamp";
import {
  ClipboardList,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  UserCircle2,
  PieChart as PieChartIcon,
  ExternalLink,
  ListChecks,
  CalendarDays,
  Package,
  BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

type AnyObj = Record<string, any>;

const STATUS_LABEL: Record<string, string> = {
  open: "เปิดงาน",
  acknowledged: "รับทราบ",
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  assigned: "มอบหมายแล้ว",
  accepted: "รับงานแล้ว",
  in_progress: "กำลังดำเนินการ",
  paused: "พักงาน",
  waiting_parts: "รออะไหล่",
  pending_parts: "รออะไหล่",
  waiting_external: "รอภายนอก",
  waiting_approval: "รออนุมัติ",
  completed: "เสร็จสิ้น",
  pending_verification: "รอตรวจรับ",
  resolved: "แก้ไขแล้ว",
  verified: "ตรวจรับแล้ว",
  closed: "ปิดงาน",
  cancelled: "ยกเลิก",
  rejected: "ปฏิเสธ",
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "วิกฤต",
  high: "สูง",
  medium: "กลาง",
  low: "ต่ำ",
};

function fmtDate(v: any) {
  if (!v) return "N/A";
  const s = String(v).replace("T", " ");
  return s.slice(0, 16);
}

function fmtNum(v: any) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "N/A";
  return Number(v).toLocaleString("th-TH");
}

function Na({ label = "N/A", note }: { label?: string; note?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-lg font-semibold text-[var(--cmms-text-secondary)]">{label}</div>
      {note ? <div className="text-xs text-[var(--cmms-text-muted)]">{note}</div> : null}
    </div>
  );
}

/** สีของโดนัท/สัดส่วน — ใช้ design token (--cmms-*) แทนการ hardcode hex ตาม guideline */
const CHART_COLORS = [
  "var(--cmms-primary)",
  "var(--cmms-warning)",
  "var(--cmms-success)",
  "var(--cmms-danger)",
  "var(--cmms-info)",
  "var(--cmms-andon-warn)",
  "var(--cmms-text-muted)",
];

export default function MyDashboardPage() {
  const hero = usePageHero("dashboard");
  const { userFullName, avatar } = useMenuPermission();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AnyObj | null>(null);
  const [wo, setWo] = useState<AnyObj[]>([]);
  const [woTotal, setWoTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, woRes] = await Promise.all([
        fetch("/api/v1/dashboard.php?action=overview", { credentials: "include" }),
        fetch("/api/v1/dashboard.php?action=wo&group=all&limit=20", { credentials: "include" }),
      ]);
      const ovJson = await ovRes.json().catch(() => null);
      const woJson = await woRes.json().catch(() => null);
      if (!ovRes.ok) throw new Error(ovJson?.error || "โหลดภาพรวมไม่สำเร็จ");
      setOverview(ovJson);
      const items = Array.isArray(woJson?.items) ? woJson.items : Array.isArray(woJson) ? woJson : [];
      setWo(items);
      setWoTotal(typeof woJson?.total === "number" ? woJson.total : items.length);
    } catch (e: any) {
      setError(e?.message || "ไม่สามารถโหลดข้อมูลแดชบอร์ดส่วนบุคคลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = overview?.core?.counts || overview?.counts || {};
  const user = overview?.user || {};
  const displayName = userFullName || user?.full_name || "ผู้ใช้งาน";
  const roleName = user?.role_name || overview?.dashboard_role || "N/A";

  const cards = useMemo(() => {
    const assigned = Number(counts.assigned ?? 0);
    const inProgress = Number(counts.active ?? 0);
    const completed = Number(counts.pending_verification ?? 0) + Number(counts.verified ?? 0);
    const overdue = Number(counts.overdue ?? 0);
    return [
      {
        key: "assigned",
        title: "มอบหมายให้ฉัน",
        value: assigned,
        note: "สถานะมอบหมาย/รับงานแล้ว (ข้อมูลจริง)",
        icon: <ClipboardList className="h-5 w-5 text-blue-600" aria-hidden="true" />,
        href: "/repair/my_tasks",
      },
      {
        key: "in_progress",
        title: "กำลังดำเนินการ",
        value: inProgress,
        note: "สถานะกำลังทำ/พัก/รออะไหล่/รอภายนอก/รออนุมัติ (ข้อมูลจริง)",
        icon: <Wrench className="h-5 w-5 text-amber-600" aria-hidden="true" />,
        href: "/repair/my_tasks",
      },
      {
        key: "completed",
        title: "เสร็จสิ้น/รอตรวจรับ-ปิด",
        value: completed,
        note: "รวมสถานะเสร็จสิ้น รอตรวจรับ ตรวจรับแล้ว และปิดงาน (ข้อมูลจริง)",
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />,
        href: "/repair/tracking",
      },
      {
        key: "overdue",
        title: "เกินกำหนด",
        value: overdue,
        note: "ใบงานที่ยังไม่ปิดและเลยกำหนด (ข้อมูลจริง)",
        icon: <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />,
        href: "/repair/tracking",
      },
    ];
  }, [counts]);

  const statusSlices = useMemo(() => {
    const rows: { name: string; value: number }[] = [
      { name: "มอบหมาย", value: Number(counts.assigned ?? 0) },
      { name: "กำลังดำเนินการ", value: Number(counts.active ?? 0) },
      { name: "รอตรวจรับ/เสร็จสิ้น", value: Number(counts.pending_verification ?? 0) },
      { name: "ตรวจรับ/ปิดงาน", value: Number(counts.verified ?? 0) },
      { name: "เกินกำหนด", value: Number(counts.overdue ?? 0) },
    ].filter((r) => r.value > 0);
    if (rows.length > 0) return rows;
    const by: Record<string, number> = {};
    for (const it of wo) {
      const st = String(it.status || "unknown");
      const label = STATUS_LABEL[st] || st;
      by[label] = (by[label] || 0) + 1;
    }
    return Object.entries(by).map(([name, value]) => ({ name, value }));
  }, [counts, wo]);

  const statusTotal = statusSlices.reduce((s, r) => s + r.value, 0);

  const shortcuts = [
    { href: "/repair/my_tasks", label: "งานของฉัน", desc: "ดู/ดำเนินงานที่ได้รับมอบหมาย", icon: <ListChecks className="h-4 w-4" aria-hidden="true" /> },
    { href: "/repair", label: "รายการใบแจ้งซ่อม", desc: "งานซ่อมทั้งหมดที่เข้าถึงได้", icon: <Wrench className="h-4 w-4" aria-hidden="true" /> },
    { href: "/repair/tracking", label: "ติดตามงาน", desc: "สถานะและงานเกินกำหนด", icon: <ClipboardList className="h-4 w-4" aria-hidden="true" /> },
    { href: "/pm_am/calendar", label: "แผน/ปฏิทิน PM", desc: "งานบำรุงรักษาตามแผน", icon: <CalendarDays className="h-4 w-4" aria-hidden="true" /> },
    { href: "/spare_parts/requests", label: "คำขออะไหล่", desc: "เบิก/ติดตามอะไหล่", icon: <Package className="h-4 w-4" aria-hidden="true" /> },
    { href: "/dashboard", label: "แดชบอร์ดภาพรวม", desc: "ภาพรวมระบบ/ตัวชี้วัด", icon: <BarChart3 className="h-4 w-4" aria-hidden="true" /> },
  ];

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "My Dashboard", href: "/dashboard/my" }]}
      eyebrow={<p className="cmms-eyebrow">MY DASHBOARD · CMMS-TPT</p>}
      title={hero?.title || "My Dashboard"}
      description="แดชบอร์ดส่วนบุคคลจากข้อมูลจริงของผู้ใช้ที่ล็อกอิน (ตัวชี้วัดที่ไม่มีแหล่งข้อมูลจริงแสดง N/A)"
      actions={[
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> รีเฟรช
        </Button>
      ]} />
      <div className="space-y-6">
      <div className="space-y-6">
        {error && <Alert variant="danger" description={error} />}

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 overflow-hidden rounded-full bg-[var(--cmms-bg-muted)] flex items-center justify-center">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <UserCircle2 className="h-10 w-10 text-[var(--cmms-text-muted)]" aria-hidden="true" />
                )}
              </div>
              <div>
                <p className="text-xs text-[var(--cmms-text-muted)]">แดชบอร์ดส่วนบุคคล (ข้อมูลจริงตามผู้ใช้ที่ล็อกอิน)</p>
                <h2 className="text-xl font-bold">{displayName}</h2>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  บทบาท: {roleName || "N/A"} · รหัสพนักงาน: <span className="font-medium">N/A</span> (ไม่มีแหล่งข้อมูล) · กะ/สถานะปฏิบัติงาน: <span className="font-medium">N/A</span> (ไม่มีแหล่งข้อมูล)
                </p>
              </div>
            </div>
            <div className="text-xs text-[var(--cmms-text-muted)]">
              อัปเดตล่าสุด: {fmtDate(overview?.last_updated)}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.key}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {c.icon}
                    <span className="text-sm font-medium text-[var(--cmms-text-secondary)]">{c.title}</span>
                  </div>
                  <Link href={c.href} className="text-[var(--cmms-primary)] hover:underline" aria-label={`ไปที่ ${c.title}`}>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
                <div className="text-3xl font-bold tabular-nums">{loading ? "…" : fmtNum(c.value)}</div>
                <div className="text-xs text-[var(--cmms-text-muted)]">{c.note}</div>
                <div className="text-xs"><span className="font-medium text-[var(--cmms-text-secondary)]">เทียบสัปดาห์ก่อน:</span> <span className="text-[var(--cmms-text-muted)]">N/A (ไม่มีแหล่งข้อมูล)</span></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" aria-hidden="true" /> รายการใบงานของฉัน</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--cmms-text-muted)]">แสดง {wo.length}{woTotal != null ? ` / ${woTotal}` : ""} รายการ (ข้อมูลจริง)</span>
                <Link href="/repair/my_tasks" className="text-xs font-semibold text-[var(--cmms-primary)] hover:underline inline-flex items-center gap-1">ดูงานของฉัน <ExternalLink className="h-3 w-3" aria-hidden="true" /></Link>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-6 text-sm text-[var(--cmms-text-muted)]">กำลังโหลดข้อมูล...</p>
              ) : wo.length === 0 ? (
                <EmptyState icon={<ClipboardList size={28} strokeWidth={1.5} />} title="ไม่พบใบงานของคุณ" description="ยังไม่มีรายการใบงานที่มอบหมาย/เกี่ยวข้องกับผู้ใช้ที่ล็อกอินจากข้อมูลที่มีอยู่" />
              ) : (
                <div className="space-y-2">
                  {wo.map((it) => {
                    const st = String(it.status || "");
                    const lamp = st === "completed" || st === "closed" || st === "verified" || st === "resolved" ? "ok"
                      : st === "in_progress" || st === "paused" || st === "waiting_parts" || st === "pending_parts" || st === "waiting_external" || st === "waiting_approval" ? "warn"
                      : it.overdue_days > 0 ? "down" : "idle";
                    return (
                      <div key={it.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--cmms-border)" }}>
                        <div className="flex min-w-0 items-center gap-3">
                          <AndonLamp status={lamp as any} size="sm" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-mono text-xs font-semibold text-[var(--cmms-primary)]">{it.work_order_no || `#${it.id}`}</span>
                              <span className="truncate text-sm font-medium">{it.title || "-"}</span>
                            </div>
                            <p className="truncate text-xs text-[var(--cmms-text-secondary)]">
                              {it.asset_code ? `${it.asset_code} · ` : ""}{it.asset_name || "ไม่ระบุเครื่องจักร"}
                              {" · "}กำหนด: {fmtDate(it.due_at)}
                              {it.overdue_days > 0 ? ` · เกินกำหนด ${it.overdue_days} วัน` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                            {PRIORITY_LABEL[String(it.priority || "").toLowerCase()] || it.priority || "N/A"}
                          </span>
                          <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                            {STATUS_LABEL[st] || st || "N/A"}
                          </span>
                          <Link href={`/repair/view?id=${it.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium hover:bg-[var(--cmms-bg-muted)]" style={{ color: "var(--cmms-primary)" }}>
                            เปิด <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><PieChartIcon className="h-4 w-4" aria-hidden="true" /> สัดส่วนสถานะงาน</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-6 text-sm text-[var(--cmms-text-muted)]">กำลังโหลด...</p>
              ) : statusTotal === 0 ? (
                <p className="py-6 text-sm text-[var(--cmms-text-muted)]">N/A — ยังไม่มีข้อมูลสถานะงานที่นับได้จากแหล่งข้อมูลจริง</p>
              ) : (
                <div className="space-y-3">
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusSlices} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                          {statusSlices.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [fmtNum(v), "จำนวน"]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {statusSlices.map((s, i) => (
                      <li key={s.name} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} /> <span className="truncate">{s.name}</span></span>
                        <span className="font-semibold tabular-nums">{fmtNum(s.value)} <span className="font-normal text-[var(--cmms-text-muted)]">({statusTotal ? Math.round((s.value / statusTotal) * 100) : 0}%)</span></span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-[var(--cmms-text-muted)]">คำนวณจากตัวนับ/รายการงานจริงของผู้ใช้ (ไม่รวมข้อมูลสมมติ)</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" aria-hidden="true" /> ตัวชี้วัด/มุมมองที่ยังไม่มีแหล่งข้อมูลจริง</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--cmms-border)" }}>
                <p className="text-[var(--cmms-text-secondary)]">เทียบสัปดาห์ก่อน (การ์ดงาน)</p>
                <Na note="ไม่มีข้อมูลเปรียบเทียบรายสัปดาห์จากแหล่งข้อมูลจริง" />
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--cmms-border)" }}>
                <p className="text-[var(--cmms-text-secondary)]">SLA Achievement</p>
                <Na note="ไม่มีตัวชี้วัด SLA ส่วนบุคคลที่พร้อมใช้งานเป็นแหล่งข้อมูลจริงในหน้านี้" />
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--cmms-border)" }}>
                <p className="text-[var(--cmms-text-secondary)]">Rework Rate</p>
                <Na note="ไม่มีแหล่งข้อมูล rework จริง" />
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--cmms-border)" }}>
                <p className="text-[var(--cmms-text-secondary)]">ไทม์ไลน์ละเอียดวันนี้ / กิจกรรมล่าสุด</p>
                <Na note="ไม่มีแหล่งข้อมูลไทม์ไลน์กิจกรรมส่วนบุคคลแบบละเอียด" />
              </div>
              <div className="rounded-lg border p-3 sm:col-span-2" style={{ borderColor: "var(--cmms-border)" }}>
                <p className="text-[var(--cmms-text-secondary)]">ประสิทธิภาพรายเดือน/เทียบช่วงก่อน (กราฟ Assigned-Completed-Overdue)</p>
                <Na note="ไม่มีข้อมูลสรุปประสิทธิภาพรายเดือนย้อนหลังแบบเทียบช่วงก่อนที่เป็นแหล่งข้อมูลจริง" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><ExternalLink className="h-4 w-4" aria-hidden="true" /> ทางลัดไปหน้าที่เกี่ยวข้อง</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shortcuts.map((s) => (
                <Link key={s.href} href={s.href} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-[var(--cmms-bg-muted)] transition-colors" style={{ borderColor: "var(--cmms-border)" }}>
                  <span className="mt-0.5 text-[var(--cmms-primary)]">{s.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{s.label}</span>
                    <span className="block text-xs text-[var(--cmms-text-secondary)]">{s.desc}</span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-[var(--cmms-text-muted)]">
          หมายเหตุ: หน้า My Dashboard นี้แสดงเฉพาะข้อมูลจริงจากระบบ (กรองตามสิทธิ์/ผู้ใช้ที่ล็อกอินตาม API) ตัวชี้วัดที่ไม่มีแหล่งข้อมูลจริงจะแสดง N/A อย่างชัดเจน และไม่มีการใส่ข้อมูลสมมติ
        </p>
      </div>
          </div>
    </>
  );
}
