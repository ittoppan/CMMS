"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePageHero, t } from "@/lib/i18n";
import { getKpis, type KpisResponse } from "@/lib/supervisor";
import CountUp from "react-countup";
import { RefreshCw, ArrowRight, Users2, ClipboardList, CalendarClock, BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip, PriorityChip, fmtDate } from "@/components/supervisor/StatusChip";

export default function SupervisorDeskPage() {
  const hero = usePageHero("supervisor");
  const [data, setData] = useState<KpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const k = await getKpis();
      setData(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const c = data?.counts ?? {};
  const can = data?.can ?? { plan: false, verify: false, review: false };

  const cards = [
    { label: "คำขอใหม่", value: c.requests_open ?? 0, to: "/supervisor/review", tone: "var(--cmms-primary)" },
    { label: "รออนุมัติก้อนที่ยังไม่วางแผน", value: c.pending_approval ?? 0, to: "/supervisor/plan", tone: "var(--cmms-warning-dark)" },
    { label: "ยังไม่มอบหมาย", value: c.unassigned ?? 0, to: "/supervisor/queue?g=unassigned", tone: "var(--cmms-warning-dark)" },
    { label: "มอบหมายแล้ว", value: c.assigned ?? 0, to: "/supervisor/queue?g=assigned", tone: "var(--cmms-primary)" },
    { label: "กำลังทำ", value: c.active ?? 0, to: "/supervisor/queue?g=active", tone: "var(--cmms-primary)" },
    { label: "รอตรวจรับ", value: c.pending_verification ?? 0, to: "/supervisor/verify", tone: "var(--cmms-warning-dark)" },
    { label: "ตรวจรับแล้ว", value: c.verified ?? 0, to: "/supervisor/verify", tone: "var(--cmms-success-dark)" },
    { label: "เกินกำหนด (SLA)", value: c.overdue ?? 0, to: "/supervisor/queue?g=overdue", tone: "var(--cmms-danger)" },
  ];

  const kpiCards = [
    { label: "MTTR (ชม.)", value: data?.mttr_hours ?? null, suffix: "ชม.", hint: "ชั่วโมงซ่อมเฉลี่ย 30 วัน" },
    { label: "MTBF (ชม.)", value: data?.mtbf_hours ?? null, suffix: "ชม.", hint: "ช่วงเฉลี่ยระหว่างการชำรุด" },
    { label: "เวลาตอบสนอง", value: data?.avg_response_minutes ?? null, suffix: "น.", hint: "ตอบสนองเฉลี่ย" },
    { label: "% ปิดงานใน SLA", value: data?.sla_compliance_pct ?? null, suffix: "%", hint: "ภายใน 30 วัน" },
    { label: "% ทำ PM", value: data?.pm_compliance_pct ?? null, suffix: "%", hint: "จาก Inspection Checklists" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={hero.eyebrow}
        title={hero.title}
        description={hero.desc}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            รีเฟรช
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((cd) => (
          <Link key={cd.label} href={cd.to} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="text-sm text-[var(--cmms-text-muted)]">{cd.label}</div>
                <div className="mt-1 flex items-end justify-between">
                  <span className="text-3xl font-bold" style={{ color: cd.tone }}>
                    {loading ? "…" : <CountUp end={Number(cd.value)} duration={0.6} />}
                  </span>
                  <ArrowRight className="h-4 w-4 text-[var(--cmms-text-muted)]" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!loading && (data?.top_overdue?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">งานค้างเกินกำหนด (ลำดับแรกสุด)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data!.top_overdue.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <StatusChip status={o.status} overdue />
                <span className="font-bold">{o.work_order_no}</span>
                <span className="min-w-0 flex-1 truncate">{o.title}</span>
                <span className="text-[var(--cmms-text-muted)]">{o.asset_code}</span>
                <PriorityChip priority={o.priority} />
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}>
                  เกิน {o.overdue_days} วัน
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-sm text-[var(--cmms-text-muted)]">{k.label}</div>
              <div className="mt-1 text-2xl font-bold text-[var(--cmms-text-primary)]">
                {loading || k.value === null ? "—" : <CountUp end={Number(k.value)} decimals={Number(k.value) % 1 !== 0 ? 1 : 0} duration={0.6} />}
                {k.value !== null && !loading ? <span className="ml-1 text-xs font-normal text-[var(--cmms-text-muted)]">{k.suffix}</span> : null}
              </div>
              <div className="mt-1 text-[11px] text-[var(--cmms-text-muted)]">{k.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: "/supervisor/queue", icon: ClipboardList, title: "คิวงานทั้งหมด", desc: "ใบสั่งงานทุกสถานะ + bulk actions", enabled: true },
          { to: "/supervisor/review", icon: BadgeCheck, title: "ทบทวนคำขอแจ้งซ่อม", desc: "อนุมัติ / ปฏิเสธคำขอ → ใบสั่งงาน", enabled: can.review },
          { to: "/supervisor/plan", icon: CalendarClock, title: "วางแผน & จัดตาราง", desc: "มอบหมายช่าง เช็ค workload / conflict", enabled: can.plan },
          { to: "/supervisor/verify", icon: Users2, title: "ตรวจรับงาน", desc: "Verify / เปิดงานใหม่ / ปิดใบงาน", enabled: can.verify },
        ].filter((x) => x.enabled).map((x) => (
          <Link key={x.to} href={x.to}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <x.icon className="h-6 w-6 text-[var(--cmms-primary)]" />
                <div className="font-bold">{x.title}</div>
                <p className="text-sm text-[var(--cmms-text-muted)]">{x.desc}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[var(--cmms-primary)]">
                  เปิดหน้านี้ <ArrowRight className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-center text-xs text-[var(--cmms-text-muted)]">{t("dashboard.footer") || "© CMMS-TOPPAN"}</p>
    </div>
  );
}