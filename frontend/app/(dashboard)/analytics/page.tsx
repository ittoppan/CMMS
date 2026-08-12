"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Grid } from "@astryxdesign/core/Grid";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  ArrowPathIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface MonthlyStat {
  monthNum: number;
  month: string;
  completed: number;
  breakdown: number;
  cost: number;
  mtbf: number;
  mttr: number;
}

const MONTH_COLORS = [
  "#2563eb", "#16a34a", "#f59e0b", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d",
  "#ea580c", "#0284c7", "#4f46e5", "#ca8a04",
];

export default function AnalyticsDashboardPage() {
  const [year, setYear] = useState(2026);
  const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
  const [workOrders, setWorkOrders] = useState<number>(0);
  const [openOrders, setOpenOrders] = useState<number>(0);
  const [completedOrders, setCompletedOrders] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [mtbf, setMtbf] = useState<number>(0);
  const [mttr, setMttr] = useState<number>(0);
  const [assets, setAssets] = useState<number>(0);
  const [pmPlans, setPmPlans] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [monthlyRes, indexRes, assetsRes, pmRes] = await Promise.all([
        fetch(`/api/v1/analytics_monthly.php?year=${year}`),
        fetch("/api/v1/index.php"),
        fetch("/api/v1/index.php?resource=assets"),
        fetch("/api/v1/index.php?resource=pm-plans"),
      ]);
      const monthlyJson = await monthlyRes.json();
      const indexJson = await indexRes.json();
      const assetsJson = await assetsRes.json();
      const pmJson = await pmRes.json();

      const rows: MonthlyStat[] = (monthlyJson?.data || []).map((r: any) => ({
        monthNum: r.monthNum,
        month: r.month,
        completed: r.completed,
        breakdown: r.breakdown,
        cost: r.cost,
        mtbf: r.mtbf,
        mttr: r.mttr,
      }));
      setMonthly(rows);
      if (rows.length > 0) {
        setMtbf(Math.round(rows.reduce((s: number, m: MonthlyStat) => s + m.mtbf, 0) / rows.length));
        setMttr(rows.reduce((s: number, m: MonthlyStat) => s + m.mttr, 0) / rows.length);
      }

      const wo = indexJson?.data ?? indexJson?.work_orders;
      if (Array.isArray(wo)) {
        setWorkOrders(wo.length);
        const open = wo.filter((w: any) => !w.status || !["completed", "closed", "resolved", "cancelled"].includes(w.status)).length;
        const done = wo.filter((w: any) => ["completed", "closed"].includes(w.status)).length;
        setOpenOrders(open);
        setCompletedOrders(done);
        setTotalCost(
          wo.reduce((s: number, w: any) => s + (parseFloat(w.cost_parts) || 0) + (parseFloat(w.cost_labor) || 0) + (parseFloat(w.cost_outsource) || 0), 0)
        );
      } else if (Array.isArray(indexJson)) {
        setWorkOrders(indexJson.length);
      }

      const assetsArr = assetsJson?.data ?? assetsJson?.assets;
      if (Array.isArray(assetsArr)) setAssets(assetsArr.length);
      const pmArr = pmJson?.data ?? pmJson?.pm_plans ?? pmJson?.pm_am;
      if (Array.isArray(pmArr)) setPmPlans(pmArr.length);
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลวิเคราะห์ได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [year]);

  const monthlyData = useMemo(() => {
    if (monthly.length === 0) {
      return { rows: [] as MonthlyStat[], totalRepair: 0, maxRepair: 1, sumCost: 0 };
    }
    const totalRepair = monthly.reduce((s, m) => s + m.completed + m.breakdown, 0);
    const maxRepair = Math.max(1, ...monthly.map((m) => m.completed + m.breakdown));
    const sumCost = monthly.reduce((s, m) => s + m.cost, 0);
    return { rows: monthly, totalRepair, maxRepair, sumCost };
  }, [monthly]);

  const months = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    for (let y = 2024; y <= 2027; y++) list.push({ value: String(y), label: `ปี ${y}` });
    return list;
  }, []);

  const maxValue = monthlyData.maxRepair || 1;
  const maxCost = Math.max(1, ...monthly.map((m) => m.cost));

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูลวิเคราะห์...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      {/* Header */}
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>วิเคราะห์ประสิทธิภาพการซ่อมบำรุง</Heading>
            <Badge label="ข้อมูลจริง" variant="info" />
          </HStack>
          <Text type="body" color="secondary">ติดตาม MTBF, MTTR, งานซ่อม และค่าใช้จ่ายรายเดือนของโรงงาน</Text>
        </VStack>
        <HStack gap={2}>
          <Selector
            label="ปี"
            isLabelHidden
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={months}
          />
          <Button label="รีเฟรช" variant="secondary" icon={<Icon icon={ArrowPathIcon} size="sm" />} onClick={fetchAnalytics} />
        </HStack>
      </HStack>

      {/* KPI Cards */}
      <Grid columns={4} gap={4}>
        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--cmms-primary-wash)" }}>
              <Icon icon={WrenchScrewdriverIcon} color="primary" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ใบสั่งงานซ่อมทั้งหมด</Text>
              <Heading level={3}>{workOrders} <span style={{ fontSize: 14, color: "var(--cmms-secondary)" }}>ใบ</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--cmms-danger-wash)" }}>
              <Icon icon={ExclamationTriangleIcon} color="error" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">งานที่ยังค้างอยู่</Text>
              <Heading level={3}>{openOrders} <span style={{ fontSize: 14, color: "var(--cmms-secondary)" }}>ใบ</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--cmms-success-wash)" }}>
              <Icon icon={CheckCircleIcon} color="success" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">งานเสร็จสมบูรณ์</Text>
              <Heading level={3}>{completedOrders} <span style={{ fontSize: 14, color: "var(--cmms-secondary)" }}>ใบ</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--cmms-warning-wash)" }}>
              <Icon icon={BanknotesIcon} color="warning" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ค่าใช้จ่ายซ่อมรวม</Text>
              <Heading level={3}>{totalCost.toLocaleString("th-TH")} <span style={{ fontSize: 14, color: "var(--cmms-secondary)" }}>บาท</span></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      {/* Second row of KPIs */}
      <Grid columns={4} gap={4}>
        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--cmms-info-wash)" }}>
              <Icon icon={ClockIcon} color="blue" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">MTBF เฉลี่ย ({year})</Text>
              <Heading level={3}>{mtbf} <span style={{ fontSize: 14, color: "var(--cmms-secondary)" }}>ชั่วโมง</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--cmms-warning-wash)" }}>
              <Icon icon={ClockIcon} color="warning" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">MTTR เฉลี่ย ({year})</Text>
              <Heading level={3}>{mttr} <span style={{ fontSize: 14, color: "var(--cmms-secondary)" }}>ชั่วโมง</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--cmms-success-wash)" }}>
              <Icon icon={WrenchScrewdriverIcon} color="success" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เครื่องจักรที่ลงทะเบียน</Text>
              <Heading level={3}>{assets} <span style={{ fontSize: 14, color: "var(--cmms-secondary)" }}>เครื่อง</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--cmms-info-wash)" }}>
              <Icon icon={CheckCircleIcon} color="blue" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">แผนงาน PM/AM</Text>
              <Heading level={3}>{pmPlans} <span style={{ fontSize: 14, color: "var(--cmms-secondary)" }}>แผน</span></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      {/* Monthly bar chart (pure CSS) */}
      <Card padding={5}>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center">
            <VStack gap={1}>
              <Heading level={4}>งานซ่อมรายเดือน (ปี {year})</Heading>
              <Text type="body" size="sm" color="secondary">รวม {monthlyData.totalRepair} ใบงาน (เสร็จ + แจ้งซ่อม)</Text>
            </VStack>
          </HStack>
          <HStack hAlign="between" gap={2} style={{ alignItems: "flex-end", minHeight: 180, height: "100%" }}>
            {monthlyData.rows.length > 0 ? (
              monthlyData.rows.map((m) => {
                const val = m.completed + m.breakdown;
                const h = Math.max(6, (val / maxValue) * 150);
                return (
                  <VStack key={m.monthNum} gap={1} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <Text type="body" size="sm" weight="bold" style={{ fontSize: 12 }}>{val}</Text>
                    <div
                      style={{
                        width: "60%",
                        maxWidth: 34,
                        height: h,
                        borderRadius: "6px 6px 0 0",
                        backgroundColor: MONTH_COLORS[(m.monthNum - 1) % 12],
                        transition: "height 0.3s ease",
                      }}
                      title={`${m.month}: ${val} ใบงาน`}
                    />
                    <Text type="body" size="sm" color="secondary" style={{ fontSize: 11 }}>{m.month}</Text>
                  </VStack>
                );
              })
            ) : (
              <Text type="body" color="secondary">ไม่มีข้อมูล</Text>
            )}
          </HStack>
        </VStack>
      </Card>

      {/* MTBF/MTTR Line comparison (pure CSS) */}
      <Card padding={5}>
        <VStack gap={4}>
          <Heading level={4}>แนวโน้ม MTBF / MTTR รายเดือน (ปี {year})</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {monthlyData.rows.map((m) => (
              <div key={m.monthNum} style={{ display: "grid", gridTemplateColumns: "56px 1fr 90px", gap: 10, alignItems: "center" }}>
                <Text type="body" size="sm" color="secondary">{m.month}</Text>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--cmms-info)", minWidth: 38 }}>MTBF</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: "var(--cmms-bg-muted)" }}>
                      <div style={{ width: `${Math.min(100, (m.mtbf / 400) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: "var(--cmms-info)" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--cmms-warning)", minWidth: 38 }}>MTTR</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: "var(--cmms-bg-muted)" }}>
                      <div style={{ width: `${Math.min(100, (m.mttr / 8) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: "var(--cmms-warning)" }} />
                    </div>
                  </div>
                </div>
                <Text type="body" size="sm" style={{ textAlign: "right", fontSize: 12 }}>
                  {m.mtbf} ชม. / {m.mttr} ชม.
                </Text>
              </div>
            ))}
          </div>
        </VStack>
      </Card>

      {/* Cost bar chart */}
      <Card padding={5}>
        <VStack gap={4}>
          <Heading level={4}>ค่าใช้จ่ายซ่อมรายเดือน (ปี {year}) — หน่วย: หมื่นบาท</Heading>
          <HStack hAlign="between" gap={2} style={{ alignItems: "flex-end", minHeight: 150 }}>
            {monthlyData.rows.length > 0 ? (
              monthlyData.rows.map((m) => {
                const h = Math.max(6, (m.cost / maxCost) * 120);
                return (
                  <VStack key={m.monthNum} gap={1} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <Text type="body" size="sm" weight="bold" style={{ fontSize: 12 }}>{m.cost}</Text>
                    <div
                      style={{
                        width: "60%",
                        maxWidth: 34,
                        height: h,
                        borderRadius: "6px 6px 0 0",
                        backgroundColor: "var(--cmms-accent)",
                        transition: "height 0.3s ease",
                      }}
                      title={`${m.month}: ${m.cost} หมื่นบาท`}
                    />
                    <Text type="body" size="sm" color="secondary" style={{ fontSize: 11 }}>{m.month}</Text>
                  </VStack>
                );
              })
            ) : (
              <Text type="body" color="secondary">ไม่มีข้อมูล</Text>
            )}
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}
