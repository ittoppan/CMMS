"use client";

import { useState, useEffect, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import {
  BarChart, Bar, ComposedChart, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  WrenchScrewdriverIcon, CheckCircleIcon, BanknotesIcon, CalendarDaysIcon,
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

  if (loading && !data) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังคำนวณ KPI...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>KPI ผู้บริหาร (Executive Dashboard)</Heading>
            <Badge label={`ช่วง ${months} เดือนล่าสุด`} variant="info" />
          </HStack>
          <Text type="body" color="secondary">
            MTTR/MTBF · %PM ทันกำหนด · %งานปิดใน SLA · ค่าใช้จ่ายซ่อม — ข้อมูลจากฐานข้อมูลจริง
          </Text>
        </VStack>
        <Selector
          label="ช่วงเวลา"
          value={String(months)}
          onChange={(v) => setMonths(Number(v))}
          options={[{ value: "3", label: "3 เดือน" }, { value: "6", label: "6 เดือน" }, { value: "12", label: "12 เดือน" }]}
          style={{ minWidth: 150 }}
        />
      </HStack>

      {/* ═══ การ์ด KPI หลัก ═══ */}
      <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={4}>
        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 10, borderRadius: 10, background: "var(--cmms-primary-wash)", color: "var(--cmms-primary)" }}>
              <Icon icon={WrenchScrewdriverIcon} size="md" />
            </div>
            <VStack gap={0}>
              <Text type="body" size="sm" color="secondary">งานซ่อมทั้งหมด</Text>
              <Heading level={3}>{h?.total ?? 0} งาน</Heading>
              <Text type="body" size="xs" color="secondary">ปิดแล้ว {h?.closed_cnt ?? 0} · ค้าง {h?.open_cnt ?? 0}</Text>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 10, borderRadius: 10, background: "var(--cmms-success-wash, #ecfdf5)", color: "var(--cmms-success, #059669)" }}>
              <Icon icon={CheckCircleIcon} size="md" />
            </div>
            <VStack gap={0}>
              <Text type="body" size="sm" color="secondary">ปิดงานใน SLA (≤120 นาที)</Text>
              <Heading level={3}>{h?.sla_pct ?? 0}%</Heading>
              <Text type="body" size="xs" color="secondary">ตามเวลารับ-ปิดงาน 15/120 นาที</Text>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 10, borderRadius: 10, background: "var(--cmms-warning-wash, #fffbeb)", color: "var(--cmms-warning, #d97706)" }}>
              <Icon icon={BanknotesIcon} size="md" />
            </div>
            <VStack gap={0}>
              <Text type="body" size="sm" color="secondary">ค่าใช้จ่ายซ่อมเดือนล่าสุด</Text>
              <Heading level={3}>{fmtBaht(h?.cost_month)}</Heading>
              <Text type="body" size="xs" color="secondary">รวมช่วงเวลา: {fmtBaht(h?.cost_total)}</Text>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 10, borderRadius: 10, background: "var(--cmms-info-wash, #eff6ff)", color: "var(--cmms-info, #2563eb)" }}>
              <Icon icon={CalendarDaysIcon} size="md" />
            </div>
            <VStack gap={0}>
              <Text type="body" size="sm" color="secondary">PM ทันกำหนด</Text>
              <Heading level={3}>{pmOnTime ?? 0}%</Heading>
              <Text type="body" size="xs" color="secondary">
                เสร็จ {data?.pm.total_completed ?? 0} · ทัน {data?.pm.on_time ?? 0} · เลท {data?.pm.late ?? 0} · ค้าง {data?.pm.overdue_pending ?? 0}
              </Text>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      {/* ═══ MTBF / MTTR ═══ */}
      <Grid columns={{ minWidth: 340 }} gap={6} style={{ alignItems: "start" }}>
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <Icon icon={BoltIcon} size="md" color="primary" />
              <Heading level={3}>MTBF / MTTR (ล่าสุด)</Heading>
            </HStack>
            <HStack gap={4} wrap="wrap">
              <VStack gap={0}>
                <Text type="body" size="sm" color="secondary">MTBF (ชั่วโมงระหว่างเสีย)</Text>
                <Heading level={2}>{data?.mtbf_mttr.latest?.mtbf ?? "—"}</Heading>
                <Text type="body" size="xs" color="secondary">
                  {data?.mtbf_mttr.latest ? `${data.mtbf_mttr.latest.failures} ครั้ง · Downtime ${data.mtbf_mttr.latest.downtime} นาที` : ""}
                </Text>
              </VStack>
              <VStack gap={0}>
                <Text type="body" size="sm" color="secondary">MTTR (นาที/ซ่อม)</Text>
                <Heading level={2}>{data?.mtbf_mttr.latest?.mttr ?? "—"}</Heading>
                <Text type="body" size="xs" color="secondary">ยิ่งต่ำ = กู้เครื่องได้ไว</Text>
              </VStack>
            </HStack>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <ComposedChart data={mtbfChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="l" dataKey="mtbf" name="MTBF (ชม.)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="r" dataKey="mttr" name="MTTR (นาที)" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </VStack>
        </Card>

        {/* ═══ สถานะงาน ═══ */}
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <Icon icon={ChartBarIcon} size="md" color="primary" />
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
                    <ProgressBar value={s.pct} />
                  </VStack>
                ))}
              </VStack>
            )}
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Badge label={`เกินกำหนด ${h?.overdue ?? 0} งาน`} variant={Number(h?.overdue) > 0 ? "warning" : "neutral"} />
              <Badge label={`ค้างรวม ${h?.open_cnt ?? 0} งาน`} variant={Number(h?.open_cnt) > 0 ? "info" : "neutral"} />
            </HStack>
          </VStack>
        </Card>
      </Grid>

      {/* ═══ ค่าใช้จ่ายรายเดือน ═══ */}
      <Card padding={5}>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center">
            <Icon icon={BanknotesIcon} size="md" color="primary" />
            <Heading level={3}>ค่าใช้จ่ายซ่อมรายเดือน</Heading>
            <Text type="body" size="sm" color="secondary">(ค่าอะไหล่ + ค่าแรง + ค่าจ้างภายนอก)</Text>
          </HStack>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={costChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v: any) => Number(v).toLocaleString("th-TH") + " บาท"} />
                <Bar dataKey="cost" name="ค่าใช้จ่าย" fill="#4f46e5" radius={[4, 4, 0, 0]}>
                  {costChart.map((c, i) => (
                    <Cell key={i} fill={i === costChart.length - 1 ? "#7c3aed" : "#4f46e5"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </VStack>
      </Card>

      {/* ═══ SLA + PM รายละเอียด ═══ */}
      <Grid columns={{ minWidth: 340 }} gap={6} style={{ alignItems: "start" }}>
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <Icon icon={ClockIcon} size="md" color="primary" />
              <Heading level={3}>% งานปิดใน SLA รายเดือน</Heading>
              <Badge label="เป้า ≤120 นาที" variant="neutral" />
            </HStack>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={slaChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Line dataKey="sla" name="SLA %" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </VStack>
        </Card>

        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center">
              <Icon icon={CalendarDaysIcon} size="md" color="primary" />
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
                <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-error, #dc2626)" }}>{data?.pm.overdue_pending ?? 0} รายการ</Text>
              </HStack>
            </VStack>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Badge label={`ทันกำหนด ${pmOnTime ?? 0}%`} variant="success" />
              {Number(data?.pm.overdue_pending) > 0 && (
                <Badge label={`⚠️ มี PM ค้าง ${data?.pm.overdue_pending} รายการ`} variant="warning" />
              )}
            </HStack>
            <HStack gap={2} vAlign="center">
              <Icon icon={ExclamationTriangleIcon} size="sm" color="secondary" />
              <Text type="body" size="xs" color="secondary">
                ไปที่หน้า "ภาระงานช่าง" หรือ "ปฏิทิน PM" เพื่อดูรายละเอียดและดำเนินการ
              </Text>
            </HStack>
          </VStack>
        </Card>
      </Grid>

      <HStack hAlign="center">
        <Button
          label="รีเฟรชข้อมูล"
          variant="secondary"
          size="sm"
          icon={<Icon icon={ArrowPathIcon} size="sm" />}
          onClick={() => fetchData(months)}
        />
      </HStack>
    </VStack>
  );
}
