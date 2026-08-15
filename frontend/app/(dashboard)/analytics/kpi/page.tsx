"use client";

import { useState, useEffect, useCallback } from "react";
import { usePageHero, t, statusText, priorityText } from "@/lib/i18n";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Selector } from "@astryxdesign/core/Selector";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import {
  BarChart, Bar, ComposedChart, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  BanknotesIcon, CalendarDaysIcon,
  BoltIcon, ClockIcon, ChartBarIcon, ArrowPathIcon, ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface KpiData {
  headline: { total: number; closed_cnt: number; open_cnt: number; overdue: number; sla_pct: number | null; cost_total: number; cost_month: number };
  mtbf_mttr: { latest: { year: number; month: number; mtbf: string; mttr: string; failures: number; downtime: number } | null; trend: { ym: string; mtbf: string; mttr: string }[] };
  pm: { total_completed: number; on_time: number; late: number; overdue_pending: number };
  cost_trend: { ym: string; cnt: number; cost: number }[];
  sla_trend: { ym: string; total: number; on_sla: number; sla_pct: number | null }[];
  status_dist: { status: string; cnt: number }[];
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${THAI_MONTHS[(+m) - 1] ?? m} ${+y + 543}`;
};
const fmtBaht = (n: number | string | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("th-TH")} บาท`;

const STATUS_LABEL: Record<string, string> = {
  completed: "เสร็จแล้ว", resolved: "เสร็จแล้ว", closed: "ปิดงาน",
  open: "รอรับงาน", acknowledged: "รับงานแล้ว", in_progress: "กำลังซ่อม",
  waiting_parts: "รออะไหล่", waiting_approval: "รออนุมัติ",
  pending_parts: "รออะไหล่", pending: "รอดำเนินการ", cancelled: "ยกเลิก", rejected: "ปฏิเสธ",
};

export default function KpiDashboardPage() {
  const hero = usePageHero("analytics/kpi");
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KpiData | null>(null);

  const fetchData = useCallback(async (m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/kpi_dashboard.php?months=${m}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setData(json);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(months); }, [months, fetchData]);

  const h = data?.headline;
  const pmOnTime = data && data.pm.total_completed > 0
    ? Math.round((data.pm.on_time / data.pm.total_completed) * 100)
    : null;

  const costChart = (data?.cost_trend ?? []).map((c) => ({
    ym: fmtMonth(c.ym), cost: Number(c.cost) || 0, cnt: c.cnt,
  }));
  const slaChart = (data?.sla_trend ?? []).map((s) => ({
    ym: fmtMonth(s.ym), sla: s.sla_pct ?? 0,
  }));
  const mtbfChart = (data?.mtbf_mttr.trend ?? []).map((t) => ({
    ym: fmtMonth(t.ym), mtbf: Number(t.mtbf) || 0, mttr: Number(t.mttr) || 0,
  }));

  const statusRows = (data?.status_dist ?? [])
    .filter((s) => s.status && !["cancelled", "rejected"].includes(s.status))
    .map((s) => ({
      ...s,
      label: STATUS_LABEL[s.status.toLowerCase()] ?? s.status,
      pct: data && data.headline.total > 0 ? Math.round((s.cnt / data.headline.total) * 100) : 0,
    }));

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (default = เรียงเดิม)
  const layout = usePageLayout("/analytics/kpi", ["hero", "kpi", "charts", "cost", "sla_pm", "actions"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  if (loading && !data) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังคำนวณ KPI...</Text>
      </HStack>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <div style={layoutStyle("hero")}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ChartBarIcon className="w-3.5 h-3.5" /> ช่วง {months} เดือนล่าสุด
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </Text>
        </VStack>
        <Selector
          label="ช่วงเวลา"
          value={String(months)}
          onChange={(v) => setMonths(Number(v))}
          options={[{ value: "3", label: "3 เดือน" }, { value: "6", label: "6 เดือน" }, { value: "12", label: "12 เดือน" }]}
          style={{ minWidth: 150 }}
        />
      </div>
      </div>

      {/* ═══ การ์ด KPI หลัก ═══ */}
      <div style={layoutStyle("kpi")}>
      <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card blue">
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center">
              <Text type="supporting" color="secondary">งานซ่อมทั้งหมด</Text>
              <AndonLamp status="ok" size="sm" />
            </HStack>
            <div className="cmms-kpi-value">
              {h?.total ?? 0}
              <span className="cmms-kpi-unit">งาน</span>
            </div>
            <Text type="body" size="sm" color="secondary">ปิดแล้ว {h?.closed_cnt ?? 0} · ค้าง {h?.open_cnt ?? 0}</Text>
          </VStack>
        </Card>

        <Card elevation="low" padding={4} className="cmms-kpi-card green">
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center">
              <Text type="supporting" color="secondary">ปิดงานใน SLA (≤120 นาที)</Text>
              <AndonLamp status="ok" size="sm" />
            </HStack>
            <div className="cmms-kpi-value">
              {h?.sla_pct ?? 0}
              <span className="cmms-kpi-unit">%</span>
            </div>
            <Text type="body" size="sm" color="secondary">ตามเวลารับ-ปิดงาน 15/120 นาที</Text>
          </VStack>
        </Card>

        <Card elevation="low" padding={4} className="cmms-kpi-card amber">
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center">
              <Text type="supporting" color="secondary">ค่าใช้จ่ายซ่อมเดือนล่าสุด</Text>
              <AndonLamp status="warn" size="sm" />
            </HStack>
            <div className="cmms-kpi-value">{fmtBaht(h?.cost_month)}</div>
            <Text type="body" size="sm" color="secondary">รวมช่วงเวลา: {fmtBaht(h?.cost_total)}</Text>
          </VStack>
        </Card>

        <Card elevation="low" padding={4} className="cmms-kpi-card cyan">
          <VStack gap={2}>
            <HStack hAlign="between" vAlign="center">
              <Text type="supporting" color="secondary">PM ทันกำหนด</Text>
              <AndonLamp status="idle" size="sm" />
            </HStack>
            <div className="cmms-kpi-value">
              {pmOnTime ?? 0}
              <span className="cmms-kpi-unit">%</span>
            </div>
            <Text type="body" size="sm" color="secondary">
              เสร็จ {data?.pm.total_completed ?? 0} · ทัน {data?.pm.on_time ?? 0} · เลท {data?.pm.late ?? 0} · ค้าง {data?.pm.overdue_pending ?? 0}
            </Text>
          </VStack>
        </Card>
      </Grid>
      </div>

      {/* ═══ MTBF / MTTR ═══ */}
      <div style={layoutStyle("charts")}>
      <Grid columns={{ minWidth: 340 }} gap={6} style={{ alignItems: "start" }}>
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <BoltIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
              <Heading level={3}>MTBF / MTTR (ล่าสุด)</Heading>
            </HStack>
            <HStack gap={4} wrap="wrap">
              <VStack gap={0}>
                <Text type="body" size="sm" color="secondary">MTBF (ชั่วโมงระหว่างเสีย)</Text>
                <div className="cmms-kpi-value">{data?.mtbf_mttr.latest?.mtbf ?? "—"}</div>
                <Text type="body" size="sm" color="secondary">
                  {data?.mtbf_mttr.latest ? `${data.mtbf_mttr.latest.failures} ครั้ง · Downtime ${data.mtbf_mttr.latest.downtime} นาที` : ""}
                </Text>
              </VStack>
              <VStack gap={0}>
                <Text type="body" size="sm" color="secondary">MTTR (นาที/ซ่อม)</Text>
                <div className="cmms-kpi-value">{data?.mtbf_mttr.latest?.mttr ?? "—"}</div>
                <Text type="body" size="sm" color="secondary">ยิ่งต่ำ = กู้เครื่องได้ไว</Text>
              </VStack>
            </HStack>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <ComposedChart data={mtbfChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                  <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="l" dataKey="mtbf" name="MTBF (ชม.)" fill="var(--cmms-primary)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="r" dataKey="mttr" name="MTTR (นาที)" stroke="var(--cmms-danger)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </VStack>
        </Card>

        {/* ═══ สถานะงาน ═══ */}
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <ChartBarIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
              <Heading level={3}>สถานะงานปัจจุบัน</Heading>
            </HStack>
            {statusRows.length === 0 ? (
              <Text type="body" color="secondary">ไม่มีข้อมูลงาน</Text>
            ) : (
              <VStack gap={3}>
                {statusRows.slice(0, 8).map((s) => (
                  <VStack key={s.status} gap={1}>
                    <HStack hAlign="between">
                      <Text type="body" size="sm" weight="semibold">{s.label}</Text>
                      <Text type="body" size="sm" color="secondary">{s.cnt} ({s.pct}%)</Text>
                    </HStack>
                    <ProgressBar label={s.label} isLabelHidden value={s.pct} />
                  </VStack>
                ))}
              </VStack>
            )}
            <HStack gap={4} vAlign="center" wrap="wrap">
              <span className={Number(h?.overdue) > 0 ? "cmms-status down" : "cmms-status idle"}>
                <span className="cmms-status-dot" />เกินกำหนด {h?.overdue ?? 0} งาน
              </span>
              <span className={Number(h?.open_cnt) > 0 ? "cmms-status warn" : "cmms-status idle"}>
                <span className="cmms-status-dot" />ค้างรวม {h?.open_cnt ?? 0} งาน
              </span>
            </HStack>
          </VStack>
        </Card>
      </Grid>
      </div>

      {/* ═══ ค่าใช้จ่ายรายเดือน ═══ */}
      <div style={layoutStyle("cost")}>
      <Card padding={5}>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center">
            <BanknotesIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
            <Heading level={3}>ค่าใช้จ่ายซ่อมรายเดือน</Heading>
            <Text type="body" size="sm" color="secondary">(ค่าอะไหล่ + ค่าแรง + ค่าจ้างภายนอก)</Text>
          </HStack>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={costChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v: any) => Number(v).toLocaleString("th-TH") + " บาท"} />
                <Bar dataKey="cost" name="ค่าใช้จ่าย" fill="var(--cmms-primary)" radius={[4, 4, 0, 0]}>
                  {costChart.map((c, i) => (
                    <Cell key={i} fill={i === costChart.length - 1 ? "var(--cmms-blue-bright)" : "var(--cmms-primary)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </VStack>
      </Card>
      </div>

      {/* ═══ SLA + PM รายละเอียด ═══ */}
      <div style={layoutStyle("sla_pm")}>
      <Grid columns={{ minWidth: 340 }} gap={6} style={{ alignItems: "start" }}>
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <ClockIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
              <Heading level={3}>% งานปิดใน SLA รายเดือน</Heading>
              <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)", fontSize: "0.75rem", padding: "4px 10px" }}>เป้า ≤120 นาที</span>
            </HStack>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={slaChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />
                  <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Line dataKey="sla" name="SLA %" stroke="var(--cmms-success)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </VStack>
        </Card>

        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <CalendarDaysIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
              <Heading level={3}>แผน PM</Heading>
            </HStack>
            <VStack gap={2}>
              <HStack hAlign="between">
                <Text type="body" size="sm">เสร็จตามกำหนด (On-time)</Text>
                <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-success)" }}>{data?.pm.on_time ?? 0} รายการ</Text>
              </HStack>
              <HStack hAlign="between">
                <Text type="body" size="sm">เสร็จช้ากว่ากำหนด (Late)</Text>
                <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-warning)" }}>{data?.pm.late ?? 0} รายการ</Text>
              </HStack>
              <HStack hAlign="between">
                <Text type="body" size="sm">ค้างเกินกำหนด (Overdue)</Text>
                <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-danger)" }}>{data?.pm.overdue_pending ?? 0} รายการ</Text>
              </HStack>
            </VStack>
            <HStack gap={4} vAlign="center" wrap="wrap">
              <span className={Number(pmOnTime ?? 0) >= 80 ? "cmms-status ok" : "cmms-status warn"}>
                <span className="cmms-status-dot" />ทันกำหนด {pmOnTime ?? 0}%
              </span>
              {Number(data?.pm.overdue_pending) > 0 && (
                <span className="cmms-status down">
                  <span className="cmms-status-dot" />มี PM ค้าง {data?.pm.overdue_pending} รายการ
                </span>
              )}
            </HStack>
            <HStack gap={2} vAlign="center">
              <ExclamationTriangleIcon className="w-4 h-4" style={{ color: "var(--cmms-secondary)" }} />
              <Text type="body" size="sm" color="secondary">
                ไปที่หน้า "ภาระงานช่าง" หรือ "ปฏิทิน PM" เพื่อดูรายละเอียดและดำเนินการ
              </Text>
            </HStack>
          </VStack>
        </Card>
      </Grid>
      </div>

      <div style={layoutStyle("actions")}>
      <HStack hAlign="center">
        <button
          type="button"
          onClick={() => fetchData(months)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
        >
          <ArrowPathIcon className="w-4 h-4" />
          รีเฟรชข้อมูล
        </button>
      </HStack>
      </div>
    </div>
  );
}
