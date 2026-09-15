"use client";

import Link from "next/link";
import {
  Activity,
  BellRing,
  Boxes,
  CalendarCheck,
  ClipboardList,
  Cog,
  Gauge,
  ShieldCheck,
  Timer,
  UsersRound,
  Wallet,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/dashboard/kit";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { ReportChartsGrid, ReportKpiGrid } from "@/components/reports/report-page";
import { fmtDateTime, fmtNumber, reportUrl } from "@/components/reports/report-lib";

const REPORT_LINKS: {
  href: string;
  title: string;
  desc: string;
  icon: typeof Wrench;
  tone: string;
}[] = [
  { href: "/reports/work-orders", title: "ใบสั่งงานซ่อม", desc: "จำนวนงานตามสถานะ ประเภทงาน และอัตราปิดงาน", icon: Wrench, tone: "" },
  { href: "/reports/requests", title: "ใบแจ้งซ่อม", desc: "คำขอแจ้งซ่อม อัตราแปลงเป็นงาน และสถานะรับงาน", icon: ClipboardList, tone: "blue" },
  { href: "/reports/pm", title: "งาน PM/AM", desc: "งานตามแผน ระหว่างซ่อม งานล่าช้า และผลเช็คชีท", icon: CalendarCheck, tone: "green" },
  { href: "/reports/inspections", title: "ตรวจเช็ครอบ", desc: "ผลตรวจ ผ่าน/ข้อสังเกต/ไม่ผ่าน ตามเครื่องจักร", icon: ShieldCheck, tone: "green" },
  { href: "/reports/assets", title: "เครื่องจักร & ความพร้อม", desc: "MTBF MTTR ความพร้อมใช้งานรายเครื่องจักร", icon: Cog, tone: "warning" },
  { href: "/reports/spare-parts", title: "คลังอะไหล่", desc: "ยอดคงคลัง รายการต่ำกว่า Safety Stock", icon: Boxes, tone: "blue" },
  { href: "/reports/cost", title: "ค่าใช้จ่ายซ่อมบำรุง", desc: "อะไหล่ + ค่าแรง ยอดรายเดือน (ผู้บริหาร)", icon: Wallet, tone: "warning" },
  { href: "/reports/downtime", title: "Downtime", desc: "เวลาหยุดเครื่อง จำแนกเครื่องจักร/แผนก", icon: Timer, tone: "warning" },
  { href: "/reports/technicians", title: "ผลงานช่าง", desc: "จำนวนงาน งานใน SLA เวลาที่ใช้ต่อช่าง", icon: UsersRound, tone: "blue" },
  { href: "/reports/sla", title: "SLA", desc: "อัตรางานปิดใน SLA ตามแผนก/ความเร่งด่วน", icon: Gauge, tone: "green" },
  { href: "/reports/mttr-mtbf", title: "MTTR / MTBF", desc: "แนวโน้มระยะเวลาซ่อม/ก่อนชำรุดรายเดือน", icon: Activity, tone: "" },
  { href: "/reports/scheduled", title: "รายงานอัตโนมัติ", desc: "ตั้งเวลาส่งรายงาน Telegram / LINE / Email", icon: BellRing, tone: "blue" },
];

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="cmms-kpi-value">{value}</p>
    </div>
  );
}

export default function ReportCenterPage() {
  const hero = usePageHero("reports/report-center");
  const { data, isLoading, error } = useApiQuery<any>(
    ["report-center"],
    reportUrl("center", {})
  );

  const meta = data?.meta ?? {};
  const req = meta.requests ?? {};
  const mtbf = meta.mtbf_mttr_latest ?? {};
  const assets = meta.assets ?? {};

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            {data?.scope?.label && (
              <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
                ขอบเขต: {data.scope.label}
              </span>
            )}
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        {data?.generated_at && (
          <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
            อัปเดตล่าสุด {fmtDateTime(data.generated_at)}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--cmms-danger)]/30 bg-[var(--cmms-danger-light)] p-4 text-sm">
          โหลดรายงานไม่สำเร็จ — {String((error as any)?.message ?? "")}
        </div>
      )}

      {/* เมนูรายงาน */}
      <section className="space-y-3">
        <SectionHeading title="เลือกออกรายงาน" sub="12 หมวดรายงานจากข้อมูลจริง — เปิดแล้วกรองช่วงเวลา/เครื่องจักร แล้วส่งออกได้เลย" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {REPORT_LINKS.map((r) => {
            const Icon = r.icon;
            return (
              <Link key={r.href} href={r.href} className="group block transition-transform hover:-translate-y-0.5">
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className={`cmms-icon-tile h-11 w-11 rounded-xl ${r.tone}`}>
                        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                      </div>
                      <span
                        className="text-xs font-medium text-[var(--cmms-primary)] opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        เปิดรายงาน →
                      </span>
                    </div>
                    <div>
                      <h3 className="font-bold">{r.title}</h3>
                      <p className="text-sm text-[var(--cmms-text-secondary)]">{r.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* KPI */}
      {data && data.kpi.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title="ภาพรวมระบบ (KPI)" sub="สูตรเดียวกับ Dashboard — คำนวณจากเซิร์ฟเวอร์" />
          <ReportKpiGrid kpi={data.kpi} loading={isLoading && !data} />
        </section>
      )}
      {isLoading && !data && (
        <section className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <ReportKpiGrid kpi={[]} loading />
        </section>
      )}

      {/* ภาพรวมรายเดือน */}
      {data && (
        <section className="space-y-2">
          <SectionHeading title="ภาพรวมรายเดือน" sub="จำนวนใบแจ้งซ่อม + ดัชนีความน่าเชื่อถือล่าสุด" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatItem label="ใบแจ้งซ่อมทั้งหมด" value={fmtNumber(req.total)} />
            <StatItem label="รอรับงาน" value={fmtNumber(req.open)} />
            <StatItem label="แปลงเป็นใบสั่งงาน" value={fmtNumber(req.converted)} />
            <StatItem label="MTBF / MTTR ล่าสุด" value={`${fmtNumber(mtbf.mtbf)} / ${fmtNumber(mtbf.mttr)} ชม.`} />
          </div>
          {(assets?.under_maintenance || assets?.alert) && (
            <div className="flex flex-wrap gap-3">
              {assets.under_maintenance !== undefined && (
                <Button size="sm" variant="outline" onClick={() => (window.location.href = "/reports/assets")}>
                  {fmtNumber(assets.under_maintenance)} เครื่องอยู่ระหว่างซ่อม
                </Button>
              )}
              {assets.alert !== undefined && (
                <Button size="sm" variant="outline" onClick={() => (window.location.href = "/reports/assets")}>
                  {fmtNumber(assets.alert)} เครื่องมีสถานะเฝ้าระวัง
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Charts */}
      {data && data.charts.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title="กราฟสถานะปัจจุบัน" />
          <ReportChartsGrid charts={data.charts} />
        </section>
      )}
    </div>
  );
}