"use client";

import Link from "next/link";
import { Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailHeader } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/dashboard/kit";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { REPORT_CENTER_LINKS } from "@/lib/quick-links";
import { ReportChartsGrid, ReportKpiGrid } from "@/components/reports/report-page";
import { fmtDateTime, fmtNumber, reportUrl } from "@/components/reports/report-lib";
import { ModuleGuide } from "@/components/dashboard/module-guide";

// รายงานทั้งหมดอ่านจาก quick-links.ts (UX P3) — map ให้เข้า shape เดิมของหน้า
const REPORT_LINKS: { href: string; title: string; desc: string; icon: typeof Wrench; tone: string }[] =
  REPORT_CENTER_LINKS.map((r) => ({ href: r.href, title: r.label, desc: r.desc ?? "", icon: r.icon, tone: r.tone ?? "" }));

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
      <DetailHeader
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        title={hero.title}
        description={hero.desc}
        status={
          data?.scope?.label ? (
            <span className="cmms-andon-chip">ขอบเขต: {data.scope.label}</span>
          ) : undefined
        }
        actions={
          data?.generated_at
            ? [
                <span key="updated" className="cmms-andon-chip">
                  อัปเดตล่าสุด {fmtDateTime(data.generated_at)}
                </span>,
              ]
            : []
        }
      />

      <ModuleGuide
        name="ศูนย์ออกรายงาน (Report Center)"
        summary="ศูนย์รวมรายงานตามหมวดจากข้อมูลจริง — เลือกรายงาน กำหนดช่วงเวลา/ตัวกรอง และส่งออกผลลัพธ์ได้จากหน้ารายงานปลายทาง"
        steps={[
          "เลือกหมวดรายงานจากการ์ดด้านล่าง",
          "ในหน้ารายงานปลายทาง กำหนดช่วงเวลา/เครื่องจักร/เงื่อนไขที่ต้องการ แล้วดูผลลัพธ์",
          "ส่งออก CSV/Excel หรือพิมพ์ PDF ตามตัวเลือกที่รายงานนั้นรองรับ",
        ]}
        source="อ่านภาพรวมจาก API report center ที่หน้านี้เรียก และแต่ละรายงานย่อยดึงข้อมูลจาก endpoint ของหมวดนั้น — ข้อมูลจริง ณ เวลาที่สร้างรายงาน"
        note="ผลลัพธ์ขึ้นกับช่วงเวลา ตัวกรอง และความครบถ้วนของข้อมูลต้นทาง — ควรระบุขอบเขต/ช่วงเวลาที่ใช้เมื่อส่งต่อรายงาน"
        related={[
          { href: "/reports", label: "ศูนย์รายงาน (Reports Hub)" },
          { href: "/reports/monthly_pdf", label: "รายงาน PDF ประจำเดือน" },
          { href: "/reports/export_excel", label: "ส่งออก Excel/CSV" },
        ]}
      />

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