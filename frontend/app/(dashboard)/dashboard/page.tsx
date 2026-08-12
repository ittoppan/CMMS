"use client";

import { useEffect, useState, useMemo } from "react";
import { VStack, HStack, Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Item } from "@astryxdesign/core/Item";
import {
  BarChart,
  Bar,
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";
import {
  ArrowPathIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  DocumentArrowDownIcon,
  BoltIcon,
  InformationCircleIcon,
  ArrowsPointingOutIcon,
  SparklesIcon,
  CalendarIcon,
  XMarkIcon,
  TvIcon,
  CurrencyDollarIcon,
  ArchiveBoxIcon,
  ChatBubbleBottomCenterTextIcon,
  MapIcon,
  TrophyIcon,
  UsersIcon,
  CpuChipIcon,
  PaperAirplaneIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  FireIcon,
  BuildingStorefrontIcon,
  DevicePhoneMobileIcon,
  PresentationChartLineIcon
} from "@heroicons/react/24/outline";
import CountUp from "@/components/CountUp";
import AndonLamp from "@/components/AndonLamp";

export interface MonthlyRecord {
  monthNum: number;
  month: string;
  completed: number;
  breakdown: number;
  cost: number;
  mtbf: number;
  mttr: number;
}

// Generate an initials avatar URL (Thai name initials) — no random foreign faces
const avatarFor = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=128&bold=true`;

function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.96)', padding: '12px 16px', borderRadius: 10,
      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', border: '1px solid var(--cmms-border)',
      fontSize: '0.85rem',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--cmms-primary)' }}>เดือน {label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
          <span>{p.name}:</span>
          <strong>{p.value} {p.name.includes("ค่าใช้จ่าย") ? "หมื่นบาท" : p.name.includes("MTBF") ? "ชม." : p.name.includes("MTTR") ? "ชม." : "รายการ"}</strong>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [recentWO, setRecentWO] = useState<any[]>([]);
  const [allWOs, setAllWOs] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedMonth, setSelectedMonth] = useState("7"); // July

  const [kpis, setKpis] = useState({ total: 0, completed: 0, inprogress: 0, overdue: 0 });
  const [inspToday, setInspToday] = useState({ due: 0, overdue: 0, done: 0, pass: 0, fail: 0 });

  // New states for advanced features
  const [selectedDrillDown, setSelectedDrillDown] = useState<MonthlyRecord | null>(null);
  const [rcaData, setRcaData] = useState<any[]>([]);
  const [pmComplianceData, setPmComplianceData] = useState<any[]>([]);
  const [deadStock, setDeadStock] = useState({ item_count: 0, total_value: 0 });
  const [costAnalysis, setCostAnalysis] = useState({ total_wo: 0, total_cost: 0, cost_per_wo: 0, cost_breakdown: [] });
  const [costBreakdown, setCostBreakdown] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [esgData, setEsgData] = useState({ total_downtime_minutes: 0, energy_waste_thb: 0 });
  const [topPerformers, setTopPerformers] = useState<any[]>([]);
  const [liveTechTrackers, setLiveTechTrackers] = useState<any[]>([]);
  const [liveTimeline, setLiveTimeline] = useState<any[]>([]);
  const [criticalAssets, setCriticalAssets] = useState<any[]>([]);
  const [predictiveHealth, setPredictiveHealth] = useState<any[]>([]);
  const [lineNotifyEnabled, setLineNotifyEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'live'>('overview');
  const [isExporting, setIsExporting] = useState(false);
  const [isTvMode, setIsTvMode] = useState(false);
  
  // Date Range Picker state
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-12-31");

  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { role: "ai", text: "สวัสดีครับ! ผมคือผู้ช่วย AI ของระบบซ่อมบำรุง วันนี้มีอะไรให้ผมช่วยวิเคราะห์ไหมครับ? (เช่น 'ขอสรุปค่าใช้จ่ายเดือนนี้', 'PM ทันกำหนดกี่เปอร์เซ็นต์')" }
  ]);

  // ตอบคำถามจากข้อมูลจริงที่โหลดมาแล้ว (ไม่ใช่ข้อความปลอม)
  const answerFromData = (q: string): string => {
    const t = q.toLowerCase();
    const lines: string[] = [];
    if (/ค่าใช้จ่าย|cost/.test(t)) {
      const totalCost = costAnalysis.total_cost || 0;
      lines.push(`💰 ค่าใช้จ่ายซ่อมรวม ${totalCost.toLocaleString()} บาท (${costAnalysis.total_wo || 0} ใบงาน, เฉลี่ย ${(costAnalysis.cost_per_wo || 0).toLocaleString()} บาท/ใบงาน)`);
    }
    if (/pm|แผน/.test(t)) {
      const done = pmComplianceData.find((x: any) => x.status === 'completed')?.count || 0;
      const total = pmComplianceData.reduce((a: number, x: any) => a + (x.count || 0), 0);
      lines.push(`📋 PM: เสร็จ ${done} จากทั้งหมด ${total} รายการ (${total ? Math.round((done / total) * 100) : 0}% ทันกำหนด)`);
    }
    if (/สต็อก|stock|อะไหล่/.test(t)) {
      if (lowStock.length > 0) {
        lines.push(`📦 อะไหล่ต่ำกว่าจุดสั่งซื้อ ${lowStock.length} รายการ: ${lowStock.slice(0, 5).map((s: any) => `${s.name} (เหลือ ${s.stock_qty}/${s.min_stock})`).join(", ")}`);
      } else {
        lines.push("ไม่มีอะไหล่ต่ำกว่าจุดสั่งซื้อในขณะนี้");
      }
    }
    if (/งานซ่อม|wo|งาน/.test(t)) {
      lines.push(`🔧 งานซ่อมทั้งหมด ${kpis.total} รายการ · เสร็จ ${kpis.completed} · กำลังทำ ${kpis.inprogress} · เกินกำหนด ${kpis.overdue}`);
    }
    if (/downtime|หยุด|เสีย/.test(t)) {
      lines.push(`⏱ Downtime รวม ${esgData.total_downtime_minutes.toLocaleString()} นาที (สูญเสียพลังงานคิดเป็น ${esgData.energy_waste_thb.toLocaleString()} บาท)`);
    }
    if (lines.length === 0) {
      return `📊 ผมช่วยสรุปข้อมูลในระบบได้ เช่น พิมพ์ "ค่าใช้จ่ายเดือนนี้" "PM ทันกำหนด" "สต็อกต่ำ" "งานซ่อม" หรือ "downtime"`;
    }
    return lines.join("\n");
  };

  // TV Mode Auto-Refresh
  useEffect(() => {
    let interval: any;
    if (isTvMode) {
      interval = setInterval(() => {
        refreshAll();
      }, 60000); // 1 minute
    }
    return () => clearInterval(interval);
  }, [isTvMode, selectedYear]);

  // Function to export dashboard to PDF
  const exportToPDF = async () => {
    setIsExporting(true);
    // ใช้ window.print() ของเบราว์เซอร์ (รองรับ CSS สมัยใหม่ได้ดีกว่า html2canvas)
    setTimeout(() => {
      window.print();
      setIsExporting(false);
    }, 500);
  };

  // 1. Fetch Real Work Orders from MySQL
  const fetchWorkOrders = async () => {
    try {
      const res = await fetch("/api/v1/index.php?resource=work-orders");
      const json = await res.json();
      if (json.status === "success" && json.data) {
        const data = json.data;
        setAllWOs(data);
        setRecentWO(data.slice(0, 5));

        const total = data.length;
        const completed = data.filter((w: any) => ["completed", "Completed", "closed", "resolved"].includes(w.status)).length;
        const inprogress = data.filter((w: any) => ["in_progress", "In Progress", "waiting_parts", "pending_parts"].includes(w.status)).length;
        const open = data.filter((w: any) => ["open", "Open", "pending"].includes(w.status)).length;
        const overdue = data.filter((w: any) => w.status === "Overdue" || w.status === "overdue").length;
        setKpis({ total, completed, inprogress: inprogress + open, overdue });
      }
    } catch (e) {
      console.error("Failed to fetch WO", e);
      setError("Failed to load work orders. Please try again.");
    }
  };

  // 2. Fetch Real Monthly Analytics Data directly from MySQL
  const fetchMonthlyAnalytics = async (yearStr: string) => {
    try {
      const res = await fetch(`/api/v1/analytics_monthly.php?year=${yearStr}`);
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setMonthlyData(json.data);
        if (json.advanced) {
          setRcaData(json.advanced.root_cause || []);
          setPmComplianceData(json.advanced.pm_compliance || []);
          setDeadStock(json.advanced.dead_stock || { item_count: 0, total_value: 0 });
          setCostAnalysis(json.advanced.cost_analysis || { total_wo: 0, total_cost: 0, cost_per_wo: 0 });
          setCostBreakdown(json.advanced.cost_analysis?.cost_breakdown || []);
          setEsgData(json.advanced.esg || { total_downtime_minutes: 0, energy_waste_thb: 0 });
          setTopPerformers(json.advanced.top_performers || []);
          
          if (json.advanced.live_ops) {
            setLiveTechTrackers(json.advanced.live_ops.technicians || []);
            setLiveTimeline(json.advanced.live_ops.timeline || []);
            setCriticalAssets(json.advanced.live_ops.critical_assets || []);
            setPredictiveHealth(json.advanced.live_ops.predictive_health || []);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch monthly analytics from MySQL", e);
      setError("Failed to load monthly analytics. Please try again.");
    }
  };

  // รายการเครื่องจักรในเดือนที่กดเจาะลึก (จากข้อมูล work orders จริง)
  const drillDownMachines = useMemo(() => {
    if (!selectedDrillDown) return [];
    const m = selectedDrillDown.monthNum;
    return allWOs.filter((w: any) => {
      const d = w.created_at ? new Date(w.created_at) : null;
      return d && d.getMonth() + 1 === m;
    });
  }, [selectedDrillDown, allWOs]);

  // ── Andon Board: สถานะเครื่องจักรจาก work orders จริง (แดง > เหลือง > เขียว) ──
  const plantBoard = useMemo(() => {
    const map = new Map<string, { status: "ok" | "warn" | "down"; count: number }>();
    for (const w of allWOs) {
      const name = w.asset_name || "ไม่ระบุเครื่อง";
      const cur = map.get(name) || { status: "ok" as const, count: 0 };
      const s = String(w.status || "").toLowerCase();
      let st = cur.status;
      if (s === "overdue" || s === "down" || s === "breakdown") st = "down";
      else if (st !== "down" && ["in_progress", "open", "pending", "waiting_parts"].includes(s)) st = "warn";
      map.set(name, { status: st, count: cur.count + 1 });
    }
    const order = { down: 0, warn: 1, ok: 2 };
    const tiles = Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => order[a.status] - order[b.status] || b.count - a.count)
      .slice(0, 12);
    const counts = { ok: 0, warn: 0, down: 0 };
    for (const [, v] of map) counts[v.status]++;
    return { tiles, counts };
  }, [allWOs]);

  // Process Pareto Data
  const paretoData = useMemo(() => {
    let cumulative = 0;
    const totalCount = rcaData.reduce((acc, curr) => acc + (curr.count || 0), 0);
    return rcaData.map(d => {
      cumulative += (d.count || 0);
      return {
        ...d,
        cumulativePercent: totalCount > 0 ? Math.round((cumulative / totalCount) * 100) : 0
      };
    });
  }, [rcaData]);

  // Process PM Data
  const pmChartData = useMemo(() => {
    if (!pmComplianceData.length) return [];
    return pmComplianceData.map(d => ({
      name: d.status,
      value: d.count,
      color: d.status === 'completed' ? '#10b981' : d.status === 'pending' ? '#f59e0b' : d.status === 'overdue' ? '#f43f5e' : '#64748b'
    }));
  }, [pmComplianceData]);

  // 3. Fetch อะไหล่ใกล้หมดสต็อก (ข้อมูลจริงจากตาราง spare_parts)
  const fetchLowStock = async () => {
    try {
      const res = await fetch("/api/v1/index.php?resource=low-stock");
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setLowStock(json.data);
      }
    } catch (e) { console.error("Failed to fetch low stock", e); }
  };

  // 4. Fetch สรุปตรวจเช็คประจำวัน
  const fetchInspections = async () => {
    try {
      const res = await fetch("/api/v1/inspections.php?schedules=1");
      const json = await res.json();
      if (!Array.isArray(json)) return;
      const today = new Date().toISOString().slice(0, 10);
      const isOpen = (s: any) => s.status === "pending" || s.status === "in_progress";
      const doneToday = json.filter((s: any) => s.completed_at && s.completed_at.slice(0, 10) === today);
      setInspToday({
        due: json.filter((s: any) => s.due_date === today && isOpen(s)).length,
        overdue: json.filter((s: any) => s.due_date && s.due_date < today && isOpen(s)).length,
        done: doneToday.length,
        pass: doneToday.filter((s: any) => s.result === "pass").length,
        fail: doneToday.filter((s: any) => s.result === "fail").length,
      });
    } catch (e) { console.error("Failed to fetch inspections", e); }
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchWorkOrders(), fetchMonthlyAnalytics(selectedYear), fetchLowStock(), fetchInspections()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, [selectedYear]);

  // Filtered chart data based on Monthly or Yearly view
  const displayChartData = useMemo(() => {
    if (monthlyData.length === 0) return [];
    if (viewMode === "monthly") {
      const monthIdx = parseInt(selectedMonth, 10) - 1;
      const start = Math.max(0, monthIdx - 2);
      const end = Math.min(12, monthIdx + 4);
      return monthlyData.slice(start, end);
    }
    return monthlyData; // All 12 months for yearly view
  }, [viewMode, selectedMonth, monthlyData]);

  // Selected month totals from MySQL (ข้อมูลจริงเท่านั้น — ไม่มีค่า fallback ปลอม)
  const selectedMonthData = useMemo(() => {
    const mIdx = parseInt(selectedMonth, 10);
    return monthlyData.find(m => m.monthNum === mIdx) || {
      monthNum: mIdx, month: "-", completed: 0, breakdown: 0, cost: 0, mtbf: 0, mttr: 0
    };
  }, [selectedMonth, monthlyData]);

  // รวมยอด breakdown รายปีจากข้อมูลจริง (สำหรับ KPI มุมมองรายปี)
  const yearlyBreakdown = useMemo(() =>
    monthlyData.reduce((sum, m) => sum + (m.breakdown || 0), 0),
  [monthlyData]);

  return (
    <Layout height="fill">
      <LayoutContent padding={6} className={isTvMode ? "fixed inset-0 z-[100] w-screen h-screen overflow-y-auto bg-slate-50 dark:bg-slate-900 p-8" : ""}>
        {isTvMode && (
          <button 
            onClick={() => setIsTvMode(false)}
            className="fixed top-6 right-6 z-[110] bg-rose-500 hover:bg-rose-600 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-110"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        )}
        
        {/* Header Section */}
        <LayoutHeader className="mb-8">
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
            <VStack gap={2}>
              <VStack gap={2}>
                <Text type="body" size="sm" className="cmms-eyebrow">
                  Plant Status Board · CMMS-TOPPAN
                </Text>
                <Heading level={1}>แผงควบคุมโรงงาน</Heading>
                <Text type="body" color="secondary">
                  สถานะเครื่องจักรแบบเรียลไทม์ — ไฟเขียวคือพร้อมเดิน ไฟแดงคือต้องการความสนใจทันที
                </Text>
              </VStack>
            </VStack>

            <HStack gap={3} vAlign="center" wrap="wrap" className="print:hidden">
              {/* Filter Controls */}
              <HStack gap={2} vAlign="center" className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-xl">
                <Selector
                  label="ปี"
                  isLabelHidden
                  value={selectedYear}
                  onChange={(v) => setSelectedYear(String(v))}
                  options={[
                    { value: "2026", label: "2026" },
                    { value: "2025", label: "2025" },
                    { value: "2024", label: "2024" },
                  ]}
                  size="sm"
                />
                {viewMode === "monthly" && (
                  <Selector
                    label="เดือน"
                    isLabelHidden
                    value={selectedMonth}
                    onChange={(v) => setSelectedMonth(String(v))}
                    options={[
                      { value: "1", label: "ม.ค." }, { value: "2", label: "ก.พ." }, { value: "3", label: "มี.ค." },
                      { value: "4", label: "เม.ย." }, { value: "5", label: "พ.ค." }, { value: "6", label: "มิ.ย." },
                      { value: "7", label: "ก.ค." }, { value: "8", label: "ส.ค." }, { value: "9", label: "ก.ย." },
                      { value: "10", label: "ต.ค." }, { value: "11", label: "พ.ย." }, { value: "12", label: "ธ.ค." },
                    ]}
                    size="sm"
                  />
                )}
              </HStack>

              {/* Action Buttons */}
              <HStack gap={2}>
                <Button
                  label="โหมดทีวี"
                  variant="secondary"
                  onClick={() => setIsTvMode(true)}
                  icon={<Icon icon={TvIcon} size="sm" />}
                  size="sm"
                />
                <Button
                  label={isExporting ? "กำลังเตรียม..." : "ส่งออก PDF"}
                  variant="primary"
                  onClick={exportToPDF}
                  icon={<Icon icon={DocumentArrowDownIcon} size="sm" />}
                  size="sm"
                />
                <Button
                  label=""
                  variant="secondary"
                  onClick={refreshAll}
                  icon={<Icon icon={ArrowPathIcon} size="sm" />}
                  size="sm"
                  title="รีเฟรชข้อมูล"
                />
              </HStack>
            </HStack>
          </HStack>
        </LayoutHeader>

        {/* ── Andon Board: สถานะโรงงาน (ข้อมูลจริงจาก work orders) ── */}
        <section className="cmms-animate-fadeInUp mb-8">
          <div className="cmms-andon-board">
            <div className="relative z-10">
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3} className="mb-4">
                <VStack gap={1}>
                  <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Andon · สัญญาณสถานะเครื่องจักร
                  </Text>
                  <Text type="body" style={{ color: "rgba(255,255,255,0.92)", fontWeight: 600 }}>
                    สถานะเครื่องจักรจากใบแจ้งซ่อมล่าสุด
                  </Text>
                </VStack>
                <HStack gap={2} wrap="wrap">
                  <span className="cmms-andon-chip">
                    <span className="cmms-andon-dot" style={{ background: "#10B981", boxShadow: "0 0 6px rgba(16,185,129,.6)" }} />
                    พร้อมใช้งาน <span className="cmms-num" style={{ color: "#fff" }}>{plantBoard.counts.ok}</span>
                  </span>
                  <span className="cmms-andon-chip">
                    <span className="cmms-andon-dot" style={{ background: "#F59E0B", boxShadow: "0 0 6px rgba(245,158,11,.6)" }} />
                    ต้องดูแล <span className="cmms-num" style={{ color: "#fff" }}>{plantBoard.counts.warn}</span>
                  </span>
                  <span className="cmms-andon-chip">
                    <span className="cmms-andon-dot" style={{ background: "#EF4444", boxShadow: "0 0 6px rgba(239,68,68,.65)" }} />
                    หยุดทำงาน <span className="cmms-num" style={{ color: "#fff" }}>{plantBoard.counts.down}</span>
                  </span>
                </HStack>
              </HStack>

              {plantBoard.tiles.length === 0 ? (
                <Text type="body" size="sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                  ยังไม่มีข้อมูลใบแจ้งซ่อม — บอร์ดจะแสดงสถานะเมื่อมีงานเข้ามา
                </Text>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {plantBoard.tiles.map((t) => (
                    <Link key={t.name} href="/repair" className="block" style={{ textDecoration: "none" }}>
                      <div className="cmms-andon-tile">
                        <AndonLamp status={t.status} size="sm" />
                        <span className="cmms-andon-tile-name flex-1">{t.name}</span>
                        <span className="cmms-andon-tile-count">{t.count} งาน</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Main Dashboard Content */}
        <VStack gap={8}>
          {/* KPI Summary Cards */}
          <section className="cmms-animate-fadeInUp">
            <Heading level={3} className="mb-4 flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5 text-indigo-500" />
              สรุปผลการดำเนินงาน
            </Heading>
            <Grid columns={{ minWidth: 280, repeat: "fit" }} gap={4}>
              <Card elevation="medium" padding={5} className="cmms-kpi-card">
                <VStack gap={3}>
                  <HStack vAlign="center" gap={2}>
                    <AndonLamp status="ok" size="sm" />
                    <Text type="supporting" color="secondary" className="font-medium">งานซ่อมทั้งหมด</Text>
                  </HStack>
                  <div className="cmms-kpi-value">
                    <CountUp end={viewMode === 'monthly' ? selectedMonthData.completed + selectedMonthData.breakdown : kpis.total} />
                    <span className="cmms-kpi-unit">รายการ</span>
                  </div>
                  <Text type="body" size="sm" color="secondary">ข้อมูลจริงจากฐานข้อมูล MySQL</Text>
                </VStack>
              </Card>

              <Card elevation="medium" padding={5} className="cmms-kpi-card">
                <VStack gap={3}>
                  <HStack vAlign="center" gap={2}>
                    <AndonLamp status="ok" size="sm" />
                    <Text type="supporting" color="secondary" className="font-medium">งานซ่อมเสร็จสมบูรณ์</Text>
                  </HStack>
                  <div className="cmms-kpi-value">
                    <CountUp end={viewMode === 'monthly' ? selectedMonthData.completed : kpis.completed} />
                    <span className="cmms-kpi-unit">รายการ</span>
                  </div>
                  <Text type="body" size="sm" className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {Math.round(((viewMode === 'monthly' ? selectedMonthData.completed : kpis.completed) / (kpis.total || 1)) * 100)}% ของงานทั้งหมดเสร็จสมบูรณ์
                  </Text>
                </VStack>
              </Card>

              <Card elevation="medium" padding={5} className="cmms-kpi-card">
                <VStack gap={3}>
                  <HStack vAlign="center" gap={2}>
                    <AndonLamp status="down" size="sm" />
                    <Text type="supporting" color="secondary" className="font-medium">เครื่องจักรชำรุด</Text>
                  </HStack>
                  <div className="cmms-kpi-value">
                    <CountUp end={viewMode === 'monthly' ? selectedMonthData.breakdown : yearlyBreakdown} />
                    <span className="cmms-kpi-unit">ครั้ง</span>
                  </div>
                  <Text type="body" size="sm" color="secondary">
                    {viewMode === 'monthly' ? 'งานแบบ Breakdown' : 'รวมทั้งปี ' + selectedYear}
                  </Text>
                </VStack>
              </Card>

              <Card elevation="medium" padding={5} className="cmms-kpi-card">
                <VStack gap={3}>
                  <HStack vAlign="center" gap={2}>
                    <AndonLamp status="warn" size="sm" />
                    <Text type="supporting" color="secondary" className="font-medium">ค่าใช้จ่ายรวม</Text>
                  </HStack>
                  <div className="cmms-kpi-value">
                    <CountUp end={Math.round(selectedMonthData.cost * 10000)} />
                    <span className="cmms-kpi-unit">บาท</span>
                  </div>
                  <Text type="body" size="sm" color="secondary">อะไหล่ & ค่าแรง</Text>
                </VStack>
              </Card>
            </Grid>
          </section>

          {/* Tab Navigation */}
          <section className="cmms-animate-fadeInUp">
            <div className="flex flex-wrap gap-2 mb-6 bg-slate-100 dark:bg-slate-800/50 p-2 rounded-2xl">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${activeTab === 'overview' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
              >
                ภาพรวม
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${activeTab === 'performance' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
              >
                ประสิทธิภาพ
              </button>
              <button
                onClick={() => setActiveTab('live')}
                className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${activeTab === 'live' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
              >
                ศูนย์ปฏิบัติการ
              </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <VStack gap={8}>
                {/* Advanced Metrics */}
                <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4}>
                  <Card elevation="medium" padding={6} className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/30 dark:to-cyan-800/20 border border-cyan-200 dark:border-cyan-700/50">
                    <VStack gap={3}>
                      <HStack vAlign="center" gap={3}>
                        <CurrencyDollarIcon className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                        <Heading level={4} className="text-cyan-700 dark:text-cyan-300">ต้นทุนต่อใบงาน</Heading>
                      </HStack>
                      <Heading level={2} className="text-cyan-800 dark:text-cyan-200">
                        {costAnalysis.cost_per_wo.toLocaleString()} 
                        <Text type="body" size="sm" className="ml-2">บาท/ใบงาน</Text>
                      </Heading>
                      <Text type="body" size="sm" color="secondary">
                        ยอดใบงาน: {costAnalysis.total_wo} ใบ • ค่าซ่อมรวม: {costAnalysis.total_cost.toLocaleString()} บาท
                      </Text>
                    </VStack>
                  </Card>

                  <Card elevation="medium" padding={6} className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border border-amber-200 dark:border-amber-700/50">
                    <VStack gap={3}>
                      <HStack vAlign="center" gap={3}>
                        <ArchiveBoxIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                        <Heading level={4} className="text-amber-700 dark:text-amber-300">สต็อกไม่เคลื่อนไหว</Heading>
                      </HStack>
                      <Heading level={2} className="text-amber-800 dark:text-amber-200">
                        {deadStock.total_value.toLocaleString()} 
                        <Text type="body" size="sm" className="ml-2">บาท</Text>
                      </Heading>
                      <Text type="body" size="sm" className="text-amber-600 dark:text-amber-400">
                        อะไหล่ไม่เคลื่อนไหว &gt; 6 เดือน • {deadStock.item_count} รายการ
                      </Text>
                    </VStack>
                  </Card>

                  <Card elevation="medium" padding={6} className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border border-green-200 dark:border-green-700/50">
                    <VStack gap={3}>
                      <HStack vAlign="center" gap={3}>
                        <BoltIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                        <Heading level={4} className="text-green-700 dark:text-green-300">พลังงานและของเสีย</Heading>
                      </HStack>
                      <Heading level={2} className="text-green-800 dark:text-green-200">
                        {esgData.energy_waste_thb.toLocaleString()} 
                        <Text type="body" size="sm" className="ml-2">บาท</Text>
                      </Heading>
                      <Text type="body" size="sm" color="secondary">
                        Downtime สะสม: {esgData.total_downtime_minutes.toLocaleString()} นาที
                      </Text>
                    </VStack>
                  </Card>
                </Grid>

                {/* Charts Section */}
                <Grid columns={{ minWidth: 500, repeat: "fit" }} gap={6}>
                  {/* Monthly Comparative Chart */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center">
                        <VStack gap={1}>
                          <Heading level={4} className="font-bold">กราฟเปรียบเทียบปริมาณงานซ่อม ({selectedYear})</Heading>
                          <Text type="body" size="sm" color="secondary">เปรียบเทียบงานซ่อมเสร็จ เครื่องชำรุด และค่าใช้จ่าย</Text>
                        </VStack>
                        <Badge label={viewMode === 'monthly' ? `6 เดือน` : `12 เดือน`} variant="info" size="sm" />
                      </HStack>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={displayChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cmms-border)" />
                          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                          <YAxis />
                          <Tooltip content={<CustomChartTooltip />} />
                          <Legend />
                          <Bar dataKey="completed" name="งานซ่อมเสร็จสมบูรณ์" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="breakdown" name="เครื่องจักรชำรุด" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="cost" name="ค่าใช้จ่าย (หมื่นบาท)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </VStack>
                  </Card>

                  {/* MTBF/MTTR Trend Chart */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center">
                        <VStack gap={1}>
                          <Heading level={4} className="font-bold">แนวโน้ม MTBF & MTTR ({selectedYear})</Heading>
                          <Text type="body" size="sm" color="secondary">MTBF (เวลาทำงานเฉลี่ยก่อนชำรุด) vs MTTR (เวลาซ่อมเฉลี่ย)</Text>
                        </VStack>
                        <Badge label="ตัวชี้วัดความน่าเชื่อถือ" variant="error" size="sm" />
                      </HStack>
                      <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={displayChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cmms-border)" />
                          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                          <YAxis yAxisId="left" orientation="left" stroke="#6366f1" />
                          <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" />
                          <Tooltip content={<CustomChartTooltip />} />
                          <Legend />
                          <Line yAxisId="left" type="monotone" dataKey="mtbf" name="MTBF (ชั่วโมง)" stroke="#6366f1" strokeWidth={3} dot={{ r: 5 }} />
                          <Line yAxisId="right" type="monotone" dataKey="mttr" name="MTTR (ชั่วโมง)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </VStack>
                  </Card>
                </Grid>

                {/* Cost Breakdown */}
                <Card elevation="high" padding={6}>
                  <VStack gap={4}>
                    <HStack hAlign="between" vAlign="center">
                      <VStack gap={1}>
                        <Heading level={4} className="font-bold">สัดส่วนค่าใช้จ่ายซ่อมบำรุง ({selectedYear})</Heading>
                        <Text type="body" size="sm" color="secondary">แยกตามหมวดหมู่: ค่าอะไหล่, ค่าแรง, จ้างเหมา</Text>
                      </VStack>
                      <Badge label="วิเคราะห์ค่าใช้จ่าย" variant="warning" size="sm" />
                    </HStack>
                    {costBreakdown.length === 0 ? (
                      <EmptyState title="ยังไม่มีข้อมูลค่าใช้จ่าย" description="ยังไม่มีค่าใช้จ่ายซ่อมบำรุงบันทึกในปีนี้" />
                    ) : (
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={costBreakdown}
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={120}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ percent, name }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {costBreakdown.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={48} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </VStack>
                </Card>
              </VStack>
            )}

            {/* Performance Tab */}
            {activeTab === 'performance' && (
              <VStack gap={8}>
                <VStack gap={3} className="mb-4">
                  <Heading level={3} className="flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6 text-indigo-500" /> วิเคราะห์ประสิทธิภาพและความน่าเชื่อถือ
                  </Heading>
                  <Text type="body" color="secondary">วิเคราะห์ความน่าเชื่อถือของเครื่องจักรและการบำรุงรักษาเชิงป้องกัน</Text>
                </VStack>

                <Grid columns={{ minWidth: 400, repeat: "fit" }} gap={6}>
                  {/* Root Cause Analysis */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center">
                        <Heading level={4} className="font-bold flex items-center gap-2">การวิเคราะห์สาเหตุรากของปัญหา (Pareto 80/20)</Heading>
                        <Badge label="การวิเคราะห์ RCA" variant="warning" size="sm" />
                      </HStack>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={paretoData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cmms-border)" />
                          <XAxis dataKey="rca_category" tick={{ fontSize: 12 }} />
                          <YAxis yAxisId="left" />
                          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                          <Tooltip />
                          <Legend />
                          <Bar yAxisId="left" dataKey="count" name="จำนวนครั้ง" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" name="% สะสม" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </VStack>
                  </Card>

                  {/* PM Compliance */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center">
                        <Heading level={4} className="font-bold flex items-center gap-2">อัตราการปฏิบัติตามแผน PM</Heading>
                      </HStack>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={pmChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {pmChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={48} />
                        </PieChart>
                      </ResponsiveContainer>
                    </VStack>
                  </Card>
                </Grid>

                {/* Advanced Features */}
                <Grid columns={{ minWidth: 400, repeat: "fit" }} gap={6}>
                  {/* Digital Twin */}
                  <Card elevation="high" padding={6} className="bg-slate-900 dark:bg-slate-800 border-slate-700">
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center">
                        <Heading level={4} className="text-white font-bold flex items-center gap-2">
                          <MapIcon className="w-5 h-5 text-cyan-400"/> แผนผังโรงงานแบบเรียลไทม์
                        </Heading>
                        <Badge label="จำลองเครื่องจักรดิจิทัล" variant="info" size="sm" />
                      </HStack>
                      <div className="relative w-full h-64 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden p-4">
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(var(--cmms-border) 1px, transparent 1px), linear-gradient(90deg, var(--cmms-border) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                        {criticalAssets.length === 0 ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Text type="body" size="sm" style={{ color: 'var(--cmms-secondary, #94a3b8)' }}>
                              ไม่มีเครื่องจักรชำรุด / อยู่ระหว่างซ่อมในขณะนี้
                            </Text>
                          </div>
                        ) : (
                          criticalAssets.slice(0, 8).map((asset, i) => {
                            // กระจายตำแหน่งบนแผนผังตามลำดับจริง (ตาราง 4x2)
                            const col = (i % 4) + 1;
                            const row = Math.floor(i / 4) + 1;
                            const left = `${(col * 20) - 6}%`;
                            const top = `${(row * 40) - 14}%`;
                            return (
                              <div key={asset.id || i} className="absolute flex flex-col items-center" style={{ left, top }}>
                                <div className={`w-6 h-6 rounded-full border-2 border-white ${asset.status === 'down' ? 'bg-rose-500 shadow-[0_0_20px_#f43f5e] animate-pulse' : asset.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_0_15px_#10b981]'}`}></div>
                                <span className="text-xs text-slate-300 mt-1 bg-slate-900/80 px-2 rounded">{asset.id}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </VStack>
                  </Card>

                  {/* Leaderboard */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <Heading level={4} className="font-bold flex items-center gap-2">
                        <TrophyIcon className="w-5 h-5 text-amber-500"/> ผู้ปฏิบัติงานยอดเยี่ยม
                      </Heading>
                      <VStack gap={4}>
                        {topPerformers.length === 0 ? (
                          <EmptyState title="ยังไม่มีข้อมูล" description="ยังไม่มีผู้ปฏิบัติงานที่ปิดงานในปีนี้" />
                        ) : topPerformers.map((tech) => (
                          <div key={tech.rank} className={`flex items-center gap-4 p-4 rounded-xl border ${tech.color} bg-opacity-30`}>
                            <div className="relative w-14 h-14 shrink-0">
                              <img 
                                src={tech.avatar} 
                                alt={tech.name} 
                                onError={(e) => { e.currentTarget.src = avatarFor(tech.name); }}
                                className="w-full h-full object-cover rounded-full border-2 border-white shadow-sm"
                              />
                              <div className="absolute -bottom-1 -right-1 text-lg bg-white rounded-full shadow-sm leading-none p-1 z-10">
                                {tech.rank === 1 ? '🥇' : tech.rank === 2 ? '🥈' : '🥉'}
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-lg">{tech.name}</div>
                              <div className="text-sm opacity-80">ปิดงาน: {tech.jobs} | MTTR: {tech.mttr}</div>
                            </div>
                          </div>
                        ))}
                      </VStack>
                    </VStack>
                  </Card>
                </Grid>
              </VStack>
            )}

            {/* Live Operations Tab */}
            {activeTab === 'live' && (
              <VStack gap={8}>
                <VStack gap={3} className="mb-4">
                  <Heading level={3} className="flex items-center gap-2">
                    <MapIcon className="w-6 h-6 text-indigo-500" /> Live Operations Center
                  </Heading>
                  <Text type="body" color="secondary">ศูนย์ปฏิบัติการติดตามสถานะเครื่องจักรและช่างซ่อมแบบเรียลไทม์</Text>
                </VStack>

                <Grid columns={{ minWidth: 400, repeat: "fit" }} gap={6}>
                  {/* Technician Tracker */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <Heading level={4} className="font-bold flex items-center gap-2">
                        <UsersIcon className="w-5 h-5 text-emerald-500"/> Live Technician Tracker
                      </Heading>
                      <VStack gap={4}>
                        {liveTechTrackers.length === 0 ? (
                          <EmptyState title="ไม่มีช่างกำลังปฏิบัติงาน" description="ไม่มีงานซ่อมที่กำลังดำเนินการอยู่ตอนนี้" />
                        ) : liveTechTrackers.map((tech, i) => (
                          <div key={i} className="flex flex-col p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                {tech.avatar && <img src={tech.avatar} alt={tech.name} onError={(e) => { e.currentTarget.src = avatarFor(tech.name); }} className="w-8 h-8 rounded-full object-cover" />}
                                <span className="font-bold text-slate-800 dark:text-white text-lg">{tech.name}</span>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${tech.status === 'repairing' ? 'bg-emerald-100 text-emerald-700' : tech.status === 'waiting' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                                {tech.status === 'repairing' ? '🟢 กำลังซ่อม' : tech.status === 'waiting' ? '🟡 รอดำเนินการ' : '⚪ ว่าง'}
                              </span>
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-400">{tech.task}</div>
                            {tech.time !== '-' && <div className="text-xs text-slate-500 mt-1">{tech.time}</div>}
                          </div>
                        ))}
                      </VStack>
                    </VStack>
                  </Card>

                  {/* Critical Assets */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center">
                        <Heading level={4} className="font-bold">สถานะเครื่องจักรสำคัญ</Heading>
                        <Link href="/asset_registry">
                          <Text type="body" size="sm" color="primary" className="font-bold hover:underline">ดูแผนผัง →</Text>
                        </Link>
                      </HStack>
                      <Grid columns={2} gap={4}>
                        {criticalAssets.length === 0 ? (
                          <EmptyState title="เครื่องจักรปกติทั้งหมด" description="ไม่มีเครื่องจักรที่อยู่ระหว่างซ่อมหรือชำรุดตอนนี้" />
                        ) : criticalAssets.map(asset => (
                          <div key={asset.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3 transition-colors hover:bg-sky-50 dark:hover:bg-sky-900/10">
                            <HStack hAlign="between" vAlign="center">
                              <Text type="body" size="sm" weight="bold">{asset.id}</Text>
                              <AndonLamp status={asset.status === 'normal' ? 'ok' : asset.status === 'warning' ? 'warn' : 'down'} size="sm" />
                            </HStack>
                            <Text type="body" size="sm" color="secondary" className="truncate">{asset.name}</Text>
                            <Text type="body" size="sm" className="text-slate-500">
                              {asset.status === 'down' ? '⚠ หยุดทำงาน' : `ตรวจสอบล่าสุด: ${asset.lastChecked}`}
                            </Text>
                          </div>
                        ))}
                      </Grid>
                    </VStack>
                  </Card>
                </Grid>

                {/* Activity Feed & Low Stock */}
                <Grid columns={{ minWidth: 400, repeat: "fit" }} gap={6}>
                  {/* Timeline */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center">
                        <Heading level={4} className="font-bold">⏱ ไทม์ไลน์กิจกรรม (ไลฟ์)</Heading>
                        <Badge label="เรียลไทม์" variant="primary" size="sm" />
                      </HStack>
                      <div className="relative pl-6 mt-4 space-y-6 before:absolute before:left-6 before:top-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                        {liveTimeline.length === 0 ? (
                          <EmptyState title="ยังไม่มีกิจกรรม" description="ยังไม่มีอัปเดตงานซ่อมล่าสุด" />
                        ) : liveTimeline.map((item, index) => (
                          <div key={index} className="relative flex items-start">
                            <div className="absolute left-0 top-1 flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-slate-100 shrink-0 z-10">
                              {item.type === 'success' ? <CheckCircleIcon className="w-4 h-4 text-emerald-500" /> :
                               item.type === 'info' ? <InformationCircleIcon className="w-4 h-4 text-blue-500" /> :
                               item.type === 'error' ? <ExclamationTriangleIcon className="w-4 h-4 text-rose-500" /> :
                               <ClockIcon className="w-4 h-4 text-amber-500" />}
                            </div>
                            <div className="ml-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm w-full">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-slate-800 dark:text-slate-200">{item.user}</span>
                                <span className="text-xs text-slate-500">{item.time}</span>
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">{item.text}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </VStack>
                  </Card>

                  {/* Low Stock */}
                  <Card elevation="high" padding={6}>
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center">
                        <Heading level={4} className="font-bold">แจ้งเตือนอะไหล่ใกล้หมดสต็อก</Heading>
                        <Link href="/spare_parts">
                          <Text type="body" size="sm" color="primary" className="font-bold hover:underline">ไปที่คลังอะไหล่ →</Text>
                        </Link>
                      </HStack>
                      <VStack gap={4}>
                        {lowStock.length === 0 ? (
                          <EmptyState title="สต็อกปกติ" description="ไม่มีอะไหล่ต่ำกว่าจุดสั่งซื้อ" />
                        ) : lowStock.map((item) => (
                          <VStack key={item.code} gap={2} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                            <HStack hAlign="between">
                              <Text type="body" size="sm" weight="semibold">{item.name}</Text>
                              <Text type="body" size="sm" color="secondary">
                                คงเหลือ <strong className="text-rose-600 dark:text-rose-400">{Number(item.stock_qty)}</strong> / {Number(item.min_stock)} {item.unit}
                              </Text>
                            </HStack>
                            <ProgressBar label="ระดับสต็อก" isLabelHidden value={(Number(item.stock_qty) / Number(item.min_stock)) * 100} variant={Number(item.stock_qty) < 3 ? "error" : "warning"} />
                          </VStack>
                        ))}
                      </VStack>
                    </VStack>
                  </Card>
                </Grid>

                {/* Daily Inspections */}
                <Card elevation="high" padding={6}>
                  <VStack gap={4}>
                    <Heading level={4} className="font-bold flex items-center gap-2">
                      <ClipboardDocumentCheckIcon className="w-5 h-5 text-blue-500"/> สรุปการตรวจเช็คประจำวัน
                    </Heading>
                    <Grid columns={{ minWidth: 250, repeat: "fit" }} gap={4}>
                      <Card elevation="medium" padding={5} className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700/50">
                        <VStack gap={2}>
                          <Text type="supporting" color="secondary" className="font-medium">ครบกำหนดวันนี้</Text>
                          <Heading level={2} className="text-blue-700 dark:text-blue-300">
                            <CountUp end={inspToday.due} /> 
                            <Text type="body" size="sm" className="ml-2">รอบ</Text>
                          </Heading>
                          <Text type="body" size="sm" color="secondary">ยังไม่ได้ทำตรวจ</Text>
                        </VStack>
                      </Card>
                      <Card elevation="medium" padding={5} className="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/30 dark:to-rose-800/20 border border-rose-200 dark:border-rose-700/50">
                        <VStack gap={2}>
                          <Text type="supporting" className="text-rose-700 dark:text-rose-400 font-medium">เกินกำหนด</Text>
                          <Heading level={2} className="text-rose-700 dark:text-rose-300">
                            <CountUp end={inspToday.overdue} /> 
                            <Text type="body" size="sm" className="ml-2">รอบ</Text>
                          </Heading>
                          <Text type="body" size="sm" className="text-rose-600 dark:text-rose-400 font-bold">
                            {inspToday.overdue > 0 ? 'ต้องเร่งทำ — เสี่ยงต่อ audit' : 'ไม่มีรอบค้าง'}
                          </Text>
                        </VStack>
                      </Card>
                      <Card elevation="medium" padding={5} className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-700/50">
                        <VStack gap={2}>
                          <Text type="supporting" className="text-emerald-700 dark:text-emerald-400 font-medium">ทำแล้ววันนี้</Text>
                          <Heading level={2} className="text-emerald-700 dark:text-emerald-300">
                            <CountUp end={inspToday.done} /> 
                            <Text type="body" size="sm" className="ml-2">รอบ</Text>
                          </Heading>
                          <Text type="body" size="sm" className="text-emerald-600 dark:text-emerald-400 font-bold">
                            ผ่าน {inspToday.pass} • ไม่ผ่าน {inspToday.fail}
                          </Text>
                        </VStack>
                      </Card>
                      <div className="flex items-center justify-center">
                        <Link href="/inspections/run">
                          <Button label="ทำตรวจเช็คตอนนี้" variant="primary" icon={<Icon icon={ClipboardDocumentCheckIcon} size="sm" />} size="lg" />
                        </Link>
                      </div>
                    </Grid>
                  </VStack>
                </Card>
              </VStack>
            )}
          </section>
        </VStack>

        {/* Drill-down Modal */}
        {selectedDrillDown && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl p-6 max-w-2xl w-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
              <HStack hAlign="between" vAlign="center" className="mb-6">
                <VStack gap={1}>
                  <Heading level={3}>เจาะลึกข้อมูลเดือน {selectedDrillDown.month}</Heading>
                  <Text type="body" color="secondary">รายละเอียดเครื่องจักรที่ชำรุดและงานซ่อม</Text>
                </VStack>
                <button onClick={() => setSelectedDrillDown(null)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Text type="body" size="xl" weight="bold">✕</Text>
                </button>
              </HStack>
              
              <Grid columns={2} gap={4} className="mb-6">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                  <Text type="supporting" className="text-emerald-700 dark:text-emerald-400">ซ่อมเสร็จสมบูรณ์</Text>
                  <Heading level={2} className="text-emerald-600 dark:text-emerald-500">{selectedDrillDown.completed} <Text type="body" size="sm">รายการ</Text></Heading>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-xl border border-rose-100 dark:border-rose-800/50">
                  <Text type="supporting" className="text-rose-700 dark:text-rose-400">เบรกดาวน์</Text>
                  <Heading level={2} className="text-rose-600 dark:text-rose-500">{selectedDrillDown.breakdown} <Text type="body" size="sm">ครั้ง</Text></Heading>
                </div>
              </Grid>

              <Text type="body" weight="bold" className="mb-3">รายการเครื่องจักรที่มีปัญหาในเดือนนี้:</Text>
              <VStack gap={3}>
                {drillDownMachines.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
                    <Text type="body" color="secondary">ไม่มีข้อมูลงานซ่อมของเดือนนี้</Text>
                  </div>
                ) : drillDownMachines.map((m, i) => (
                  <div key={i} className="flex justify-between items-center p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <HStack gap={3} vAlign="center">
                      <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                        <WrenchScrewdriverIcon className="w-6 h-6" />
                      </div>
                      <VStack gap={1}>
                        <Text type="body" weight="bold">{m.asset_name || m.title || "งานซ่อม"}</Text>
                        <Text type="supporting" color="secondary">{m.work_order_no} · ซ่อมโดย: {m.assigned_name || "ยังไม่มอบหมาย"}</Text>
                      </VStack>
                    </HStack>
                    <Badge label={m.status || "-"} variant={["completed", "Completed", "closed", "resolved"].includes(m.status) ? "success" : "warning"} />
                  </div>
                ))}
              </VStack>
            </div>
          </div>
        )}

        {/* AI Chatbot */}
        <div className={`fixed bottom-6 right-6 z-[120] flex flex-col items-end transition-all duration-300 print:hidden`}>
          {isChatOpen && (
            <div className="mb-4 w-80 h-96 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CpuChipIcon className="w-5 h-5" />
                  <span className="font-bold">ผู้ช่วย AI ของระบบ</span>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/20 p-1 rounded-full"><XMarkIcon className="w-5 h-5" /></button>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 bg-slate-50 dark:bg-slate-950">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`max-w-[85%] rounded-xl p-3 text-sm ${msg.role === 'ai' ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 self-start rounded-tl-none shadow-sm' : 'bg-indigo-600 text-white self-end rounded-tr-none shadow-md'}`}>
                    {msg.text}
                  </div>
                ))}
              </div>
              
              <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex gap-2">
                <input 
                  type="text" 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chatMessage.trim()) {
                      const q = chatMessage;
                      setChatHistory([...chatHistory, { role: 'user', text: q }, { role: 'ai', text: answerFromData(q) }]);
                      setChatMessage("");
                    }
                  }}
                  placeholder="พิมพ์ถาม AI..." 
                  className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                />
                <button 
                  className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shrink-0"
                  onClick={() => {
                    if (chatMessage.trim()) {
                      const q = chatMessage;
                      setChatHistory([...chatHistory, { role: 'user', text: q }, { role: 'ai', text: answerFromData(q) }]);
                      setChatMessage("");
                    }
                  }}
                >
                  <PaperAirplaneIcon className="w-4 h-4 -translate-y-px translate-x-px" />
                </button>
              </div>
            </div>
          )}

          <button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white transition-all duration-300 hover:scale-110 ${isChatOpen ? 'bg-rose-500' : 'bg-gradient-to-r from-indigo-600 to-purple-600 animate-bounce'}`}
          >
            {isChatOpen ? <XMarkIcon className="w-6 h-6" /> : <ChatBubbleBottomCenterTextIcon className="w-6 h-6" />}
          </button>
        </div>
      </LayoutContent>
    </Layout>
  );
}