"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { normalizeRepairStatus, isRepairDone, isRepairOverdue } from "@/lib/repair-status";
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
  RefreshCw,
  Tv,
  FileDown,
  X,
  ChartBar,
  TriangleAlert,
  CheckCircle2,
  Clock,
  Info,
  Sparkles,
  Map as MapIcon,
  Trophy,
  Users,
  ClipboardCheck,
  DollarSign,
  Archive,
  Zap,
  Send,
  MessageSquare,
  Cpu,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select-native";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import CountUp from "@/components/CountUp";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";

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
      background: 'var(--cmms-bg-card, rgba(255, 255, 255, 0.96))', padding: '12px 16px', borderRadius: 10,
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

// แถบระดับสต็อก (แทน Astryx ProgressBar) — role=progressbar + design tokens
function StockBar({ qty, min }: { qty: number; min: number }) {
  const pct = min > 0 ? Math.min(100, Math.round((qty / min) * 100)) : 100;
  const low = qty < 3;
  return (
    <div
      role="progressbar"
      aria-label="ระดับสต็อก"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: "var(--cmms-bg-muted)" }}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: low ? "var(--cmms-danger)" : "var(--cmms-warning)" }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const hero = usePageHero("dashboard");
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
      return `ผมช่วยสรุปข้อมูลในระบบได้ เช่น พิมพ์ "ค่าใช้จ่ายเดือนนี้" "PM ทันกำหนด" "สต็อกต่ำ" "งานซ่อม" หรือ "downtime"`;
    }
    return lines.join("\n");
  };

  const submitChat = () => {
    if (chatMessage.trim()) {
      const q = chatMessage;
      setChatHistory([...chatHistory, { role: 'user', text: q }, { role: 'ai', text: answerFromData(q) }]);
      setChatMessage("");
    }
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
        // ใช้ชุดสถานะกลาง (lib/repair-status.ts) — alias/สี/การนับตรงกับหน้ารายการงานซ่อม
        const completed = data.filter((w: any) => isRepairDone(w.status)).length;
        const active = data.filter((w: any) => {
          const k = normalizeRepairStatus(w.status);
          return k === "open" || k === "in_progress" || k === "waiting_parts";
        }).length;
        const overdue = data.filter((w: any) => isRepairOverdue(w.estimated_completion_date, w.status)).length;
        setKpis({ total, completed, inprogress: active, overdue });
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
      // ชุดสถานะกลาง: เกินกำหนด(จริง) = แดง, ยังไม่จบงาน = เหลือง, เสร็จ = เขียว
      const isOverdue = isRepairOverdue(w.estimated_completion_date, w.status);
      const raw = String(w.status || "").toLowerCase();
      let st = cur.status;
      if (isOverdue || raw === "down" || raw === "breakdown") st = "down";
      else if (st !== "down" && !isRepairDone(w.status)) st = "warn";
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
      color: d.status === 'completed' ? 'var(--cmms-success)' : d.status === 'pending' ? 'var(--cmms-warning)' : d.status === 'overdue' ? 'var(--cmms-danger)' : 'var(--cmms-text-secondary)'
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

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config ที่บันทึก (default = เรียงเดิม)
  const layout = usePageLayout("/dashboard", ["header", "andon", "kpi", "tabs"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  return (
    <div
      className={isTvMode ? "fixed inset-0 z-[100] h-screen w-screen overflow-y-auto p-8" : "flex flex-col gap-8"}
      style={isTvMode ? { background: "var(--cmms-bg)" } : undefined}
    >
      {isTvMode && (
        <button
          onClick={() => setIsTvMode(false)}
          aria-label="ปิดโหมดทีวี"
          className="fixed right-6 top-6 z-[110] rounded-full p-3 text-white shadow-lg transition-transform hover:scale-110"
          style={{ background: "var(--cmms-danger)" }}
        >
          <X size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      {error && (
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
      )}

      {/* Header Section */}
      <section style={layoutStyle("header")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="cmms-eyebrow">{hero.eyebrow}</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{hero.title}</h1>
            <p className="mt-1 text-[var(--cmms-text-secondary)]">{hero.desc}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {/* Filter Controls */}
            <div
              className="flex flex-wrap items-center gap-2 rounded-xl border p-2"
              style={{ background: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}
            >
              <Select
                aria-label="ปี"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="h-9 w-auto text-sm"
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </Select>
              {viewMode === "monthly" && (
                <Select
                  aria-label="เดือน"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-9 w-auto text-sm"
                >
                  <option value="1">ม.ค.</option><option value="2">ก.พ.</option><option value="3">มี.ค.</option>
                  <option value="4">เม.ย.</option><option value="5">พ.ค.</option><option value="6">มิ.ย.</option>
                  <option value="7">ก.ค.</option><option value="8">ส.ค.</option><option value="9">ก.ย.</option>
                  <option value="10">ต.ค.</option><option value="11">พ.ย.</option><option value="12">ธ.ค.</option>
                </Select>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsTvMode(true)} className="gap-1.5">
                <Tv size={16} strokeWidth={1.75} aria-hidden="true" />
                โหมดทีวี
              </Button>
              <Button size="sm" onClick={exportToPDF} className="gap-1.5">
                <FileDown size={16} strokeWidth={1.75} aria-hidden="true" />
                {isExporting ? "กำลังเตรียม..." : "ส่งออก PDF"}
              </Button>
              <Button variant="secondary" size="icon" onClick={refreshAll} aria-label="รีเฟรชข้อมูล">
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Andon Board: สถานะโรงงาน (ข้อมูลจริงจาก work orders) ── */}
      <section className="cmms-animate-fadeInUp" style={layoutStyle("andon")}>
        <div className="cmms-andon-board">
          <div className="relative z-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Andon · สัญญาณสถานะเครื่องจักร
                </p>
                <p className="font-semibold" style={{ color: "rgba(255,255,255,0.92)" }}>
                  สถานะเครื่องจักรจากใบแจ้งซ่อมล่าสุด
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="cmms-andon-chip">
                  <span className="cmms-andon-dot" style={{ background: "var(--cmms-success)", boxShadow: "0 0 6px rgba(16,185,129,.6)" }} />
                  พร้อมใช้งาน <span className="cmms-num" style={{ color: "#fff" }}>{plantBoard.counts.ok}</span>
                </span>
                <span className="cmms-andon-chip">
                  <span className="cmms-andon-dot" style={{ background: "var(--cmms-warning)", boxShadow: "0 0 6px rgba(245,158,11,.6)" }} />
                  ต้องดูแล <span className="cmms-num" style={{ color: "#fff" }}>{plantBoard.counts.warn}</span>
                </span>
                <span className="cmms-andon-chip">
                  <span className="cmms-andon-dot" style={{ background: "var(--cmms-danger)", boxShadow: "0 0 6px rgba(239,68,68,.65)" }} />
                  หยุดทำงาน <span className="cmms-num" style={{ color: "#fff" }}>{plantBoard.counts.down}</span>
                </span>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : plantBoard.tiles.length === 0 ? (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                ยังไม่มีข้อมูลใบแจ้งซ่อม — บอร์ดจะแสดงสถานะเมื่อมีงานเข้ามา
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
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
      {/* KPI Summary Cards */}
      <section className="cmms-animate-fadeInUp" style={layoutStyle("kpi")}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <ChartBar size={20} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-primary)]" />
          สรุปผลการดำเนินงาน
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="cmms-kpi-card blue">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--cmms-text-secondary)]">งานซ่อมทั้งหมด</span>
                <AndonLamp status="ok" size="sm" />
              </div>
              {loading ? (
                <Skeleton className="h-9 w-28" />
              ) : (
                <div className="cmms-kpi-value">
                  <CountUp end={viewMode === 'monthly' ? selectedMonthData.completed + selectedMonthData.breakdown : kpis.total} />
                  <span className="cmms-kpi-unit">รายการ</span>
                </div>
              )}
              <p className="text-sm text-[var(--cmms-text-secondary)]">ข้อมูลจริงจากฐานข้อมูล MySQL</p>
            </CardContent>
          </Card>

          <Card className="cmms-kpi-card green">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--cmms-text-secondary)]">งานซ่อมเสร็จสมบูรณ์</span>
                <AndonLamp status="ok" size="sm" />
              </div>
              {loading ? (
                <Skeleton className="h-9 w-28" />
              ) : (
                <div className="cmms-kpi-value">
                  <CountUp end={viewMode === 'monthly' ? selectedMonthData.completed : kpis.completed} />
                  <span className="cmms-kpi-unit">รายการ</span>
                </div>
              )}
              <p className="text-sm font-bold" style={{ color: "var(--cmms-success)" }}>
                {Math.round(((viewMode === 'monthly' ? selectedMonthData.completed : kpis.completed) / (kpis.total || 1)) * 100)}% ของงานทั้งหมดเสร็จสมบูรณ์
              </p>
            </CardContent>
          </Card>

          <Card className="cmms-kpi-card red">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--cmms-text-secondary)]">เครื่องจักรชำรุด</span>
                <AndonLamp status="down" size="sm" />
              </div>
              {loading ? (
                <Skeleton className="h-9 w-28" />
              ) : (
                <div className="cmms-kpi-value">
                  <CountUp end={viewMode === 'monthly' ? selectedMonthData.breakdown : yearlyBreakdown} />
                  <span className="cmms-kpi-unit">ครั้ง</span>
                </div>
              )}
              <p className="text-sm text-[var(--cmms-text-secondary)]">
                {viewMode === 'monthly' ? 'งานแบบ Breakdown' : 'รวมทั้งปี ' + selectedYear}
              </p>
            </CardContent>
          </Card>

          <Card className="cmms-kpi-card amber">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--cmms-text-secondary)]">ค่าใช้จ่ายรวม</span>
                <AndonLamp status="warn" size="sm" />
              </div>
              {loading ? (
                <Skeleton className="h-9 w-28" />
              ) : (
                <div className="cmms-kpi-value">
                  <CountUp end={Math.round(selectedMonthData.cost * 10000)} />
                  <span className="cmms-kpi-unit">บาท</span>
                </div>
              )}
              <p className="text-sm text-[var(--cmms-text-secondary)]">อะไหล่ &amp; ค่าแรง</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tab Navigation */}
      <section className="cmms-animate-fadeInUp" style={layoutStyle("tabs")}>
        <div className="mb-6 flex flex-wrap gap-2 rounded-2xl p-2" style={{ background: "var(--cmms-bg-wash)" }} role="tablist" aria-label="มุมมองแดชบอร์ด">
          {([
            ['overview', 'ภาพรวม'],
            ['performance', 'ประสิทธิภาพ'],
            ['live', 'ศูนย์ปฏิบัติการ'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className="rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-300"
              style={
                activeTab === key
                  ? { background: "var(--cmms-bg-card)", color: "var(--cmms-primary)", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" }
                  : { color: "var(--cmms-text-secondary)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Advanced Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Card className="cmms-kpi-card cyan">
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <DollarSign size={24} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-info)" }} />
                    <h3 className="font-bold" style={{ color: "var(--cmms-info)" }}>ต้นทุนต่อใบงาน</h3>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "var(--cmms-info)" }}>
                    {costAnalysis.cost_per_wo.toLocaleString()}
                    <span className="ml-2 text-sm font-normal">บาท/ใบงาน</span>
                  </p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    ยอดใบงาน: {costAnalysis.total_wo} ใบ • ค่าซ่อมรวม: {costAnalysis.total_cost.toLocaleString()} บาท
                  </p>
                </CardContent>
              </Card>

              <Card className="cmms-kpi-card amber">
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Archive size={24} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-warning)" }} />
                    <h3 className="font-bold" style={{ color: "var(--cmms-warning-dark)" }}>สต็อกไม่เคลื่อนไหว</h3>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "var(--cmms-warning-dark)" }}>
                    {deadStock.total_value.toLocaleString()}
                    <span className="ml-2 text-sm font-normal">บาท</span>
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "var(--cmms-warning)" }}>
                    อะไหล่ไม่เคลื่อนไหว &gt; 6 เดือน • {deadStock.item_count} รายการ
                  </p>
                </CardContent>
              </Card>

              <Card className="cmms-kpi-card green">
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Zap size={24} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-success)" }} />
                    <h3 className="font-bold" style={{ color: "var(--cmms-success)" }}>พลังงานและของเสีย</h3>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "var(--cmms-success)" }}>
                    {esgData.energy_waste_thb.toLocaleString()}
                    <span className="ml-2 text-sm font-normal">บาท</span>
                  </p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    Downtime สะสม: {esgData.total_downtime_minutes.toLocaleString()} นาที
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Section */}
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Monthly Comparative Chart */}
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">กราฟเปรียบเทียบปริมาณงานซ่อม ({selectedYear})</h3>
                      <p className="text-sm text-[var(--cmms-text-secondary)]">เปรียบเทียบงานซ่อมเสร็จ เครื่องชำรุด และค่าใช้จ่าย</p>
                    </div>
                    <Badge variant="info">{viewMode === 'monthly' ? `6 เดือน` : `12 เดือน`}</Badge>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={displayChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cmms-border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend />
                      <Bar dataKey="completed" name="งานซ่อมเสร็จสมบูรณ์" fill="var(--cmms-info)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="breakdown" name="เครื่องจักรชำรุด" fill="var(--cmms-danger)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cost" name="ค่าใช้จ่าย (หมื่นบาท)" fill="var(--cmms-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* MTBF/MTTR Trend Chart */}
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">แนวโน้ม MTBF &amp; MTTR ({selectedYear})</h3>
                      <p className="text-sm text-[var(--cmms-text-secondary)]">MTBF (เวลาทำงานเฉลี่ยก่อนชำรุด) vs MTTR (เวลาซ่อมเฉลี่ย)</p>
                    </div>
                    <Badge variant="danger">ตัวชี้วัดความน่าเชื่อถือ</Badge>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={displayChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cmms-border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" orientation="left" stroke="var(--cmms-primary)" />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--cmms-warning)" />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="mtbf" name="MTBF (ชั่วโมง)" stroke="var(--cmms-primary)" strokeWidth={3} dot={{ r: 5 }} />
                      <Line yAxisId="right" type="monotone" dataKey="mttr" name="MTTR (ชั่วโมง)" stroke="var(--cmms-warning)" strokeWidth={3} dot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Cost Breakdown */}
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">สัดส่วนค่าใช้จ่ายซ่อมบำรุง ({selectedYear})</h3>
                    <p className="text-sm text-[var(--cmms-text-secondary)]">แยกตามหมวดหมู่: ค่าอะไหล่, ค่าแรง, จ้างเหมา</p>
                  </div>
                  <Badge variant="warning">วิเคราะห์ค่าใช้จ่าย</Badge>
                </div>
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
                        label={({ percent, name }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
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
              </CardContent>
            </Card>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="space-y-8">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Sparkles size={24} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-primary)]" /> วิเคราะห์ประสิทธิภาพและความน่าเชื่อถือ
              </h2>
              <p className="text-[var(--cmms-text-secondary)]">วิเคราะห์ความน่าเชื่อถือของเครื่องจักรและการบำรุงรักษาเชิงป้องกัน</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {/* Root Cause Analysis */}
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold">การวิเคราะห์สาเหตุรากของปัญหา (Pareto 80/20)</h3>
                    <Badge variant="warning">การวิเคราะห์ RCA</Badge>
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={paretoData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cmms-border)" />
                      <XAxis dataKey="rca_category" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="count" name="จำนวนครั้ง" fill="var(--cmms-primary)" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" name="% สะสม" stroke="var(--cmms-danger)" strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* PM Compliance */}
              <Card>
                <CardContent className="space-y-4">
                  <h3 className="font-bold">อัตราการปฏิบัติตามแผน PM</h3>
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
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        {pmChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={48} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Advanced Features */}
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Digital Twin — แผงเข้มตั้งใจ (blueprint look) */}
              <Card className="border-slate-700 bg-slate-900 dark:bg-slate-800">
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 font-bold text-white">
                      <MapIcon size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-info)" }} /> แผนผังโรงงานแบบเรียลไทม์
                    </h3>
                    <Badge variant="info">จำลองเครื่องจักรดิจิทัล</Badge>
                  </div>
                  <div className="relative h-64 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-800 p-4">
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(var(--cmms-border) 1px, transparent 1px), linear-gradient(90deg, var(--cmms-border) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                    {criticalAssets.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-sm" style={{ color: 'var(--cmms-text-muted)' }}>
                          ไม่มีเครื่องจักรชำรุด / อยู่ระหว่างซ่อมในขณะนี้
                        </p>
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
                            <div className={`h-6 w-6 rounded-full border-2 border-white ${asset.status === 'down' ? 'animate-pulse bg-rose-500 shadow-[0_0_20px_var(--cmms-danger)]' : asset.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_0_15px_var(--cmms-success)]'}`}></div>
                            <span className="mt-1 rounded bg-slate-900/80 px-2 text-xs text-slate-300">{asset.id}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Leaderboard */}
              <Card>
                <CardContent className="space-y-4">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Trophy size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-warning)" }} /> ผู้ปฏิบัติงานยอดเยี่ยม
                  </h3>
                  <div className="space-y-4">
                    {topPerformers.length === 0 ? (
                      <EmptyState title="ยังไม่มีข้อมูล" description="ยังไม่มีผู้ปฏิบัติงานที่ปิดงานในปีนี้" />
                    ) : topPerformers.map((tech) => (
                      <div key={tech.rank} className={`flex items-center gap-4 rounded-xl border p-4 ${tech.color || ""}`}>
                        <div className="relative h-14 w-14 shrink-0">
                          <img
                            src={tech.avatar}
                            alt={tech.name}
                            onError={(e) => { e.currentTarget.src = avatarFor(tech.name); }}
                            className="h-full w-full rounded-full border-2 border-white object-cover shadow-sm"
                          />
                          {/* อันดับ (แทน emoji เหรียญ) */}
                          <span
                            aria-label={`อันดับ ${tech.rank}`}
                            className="absolute -bottom-1 -right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                            style={{
                              background:
                                tech.rank === 1 ? "var(--cmms-warning)"
                                : tech.rank === 2 ? "var(--cmms-text-muted)"
                                : "var(--cmms-warning-dark)",
                            }}
                          >
                            {tech.rank}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="text-lg font-bold">{tech.name}</div>
                          <div className="text-sm opacity-80">ปิดงาน: {tech.jobs} | MTTR: {tech.mttr}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Live Operations Tab */}
        {activeTab === 'live' && (
          <div className="space-y-8">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <MapIcon size={24} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-primary)]" /> Live Operations Center
              </h2>
              <p className="text-[var(--cmms-text-secondary)]">ศูนย์ปฏิบัติการติดตามสถานะเครื่องจักรและช่างซ่อมแบบเรียลไทม์</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {/* Technician Tracker */}
              <Card>
                <CardContent className="space-y-4">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Users size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-success)" }} /> Live Technician Tracker
                  </h3>
                  <div className="space-y-4">
                    {liveTechTrackers.length === 0 ? (
                      <EmptyState title="ไม่มีช่างกำลังปฏิบัติงาน" description="ไม่มีงานซ่อมที่กำลังดำเนินการอยู่ตอนนี้" />
                    ) : liveTechTrackers.map((tech, i) => (
                      <div
                        key={i}
                        className="rounded-xl border p-4"
                        style={{ background: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {tech.avatar && <img src={tech.avatar} alt={tech.name} onError={(e) => { e.currentTarget.src = avatarFor(tech.name); }} className="h-8 w-8 rounded-full object-cover" />}
                            <span className="text-lg font-bold">{tech.name}</span>
                          </div>
                          <span className={`cmms-status ${tech.status === 'repairing' ? 'ok' : tech.status === 'waiting' ? 'warn' : 'idle'}`}>
                            <span className="cmms-status-dot" /> {tech.status === 'repairing' ? 'กำลังซ่อม' : tech.status === 'waiting' ? 'รอดำเนินการ' : 'ว่าง'}
                          </span>
                        </div>
                        <div className="text-sm text-[var(--cmms-text-secondary)]">{tech.task}</div>
                        {tech.time !== '-' && <div className="mt-1 text-xs text-[var(--cmms-text-muted)]">{tech.time}</div>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Critical Assets */}
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold">สถานะเครื่องจักรสำคัญ</h3>
                    <Link href="/asset_registry" className="text-sm font-bold hover:underline" style={{ color: "var(--cmms-primary)" }}>
                      ดูแผนผัง →
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {criticalAssets.length === 0 ? (
                      <div className="col-span-2">
                        <EmptyState title="เครื่องจักรปกติทั้งหมด" description="ไม่มีเครื่องจักรที่อยู่ระหว่างซ่อมหรือชำรุดตอนนี้" />
                      </div>
                    ) : criticalAssets.map(asset => (
                      <div
                        key={asset.id}
                        className="flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:bg-[var(--cmms-info-light)]"
                        style={{ background: "var(--cmms-bg-card)", borderColor: "var(--cmms-border)" }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold">{asset.id}</span>
                          <AndonLamp status={asset.status === 'normal' ? 'ok' : asset.status === 'warning' ? 'warn' : 'down'} size="sm" />
                        </div>
                        <span className="truncate text-sm text-[var(--cmms-text-secondary)]">{asset.name}</span>
                        <span className="text-sm text-[var(--cmms-text-muted)]">
                          {asset.status === 'down' ? 'หยุดทำงาน' : `ตรวจสอบล่าสุด: ${asset.lastChecked}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Activity Feed & Low Stock */}
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Timeline */}
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 font-bold">
                      <Clock size={18} strokeWidth={1.75} aria-hidden="true" /> ไทม์ไลน์กิจกรรม (ไลฟ์)
                    </h3>
                    <Badge variant="info">เรียลไทม์</Badge>
                  </div>
                  <div className="relative mt-4 space-y-6 pl-6 before:absolute before:left-6 before:top-0 before:h-full before:w-0.5 before:bg-[var(--cmms-border)]">
                    {liveTimeline.length === 0 ? (
                      <EmptyState title="ยังไม่มีกิจกรรม" description="ยังไม่มีอัปเดตงานซ่อมล่าสุด" />
                    ) : liveTimeline.map((item, index) => (
                      <div key={index} className="relative flex items-start">
                        <div className="absolute left-0 top-1 z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white" style={{ background: "var(--cmms-bg-wash)" }}>
                          {item.type === 'success' ? <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-success)" }} /> :
                           item.type === 'info' ? <Info size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-info)" }} /> :
                           item.type === 'error' ? <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-danger)" }} /> :
                           <Clock size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-warning)" }} />}
                        </div>
                        <div
                          className="ml-12 w-full rounded-xl border p-4 shadow-sm"
                          style={{ background: "var(--cmms-bg-card)", borderColor: "var(--cmms-border)" }}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-bold">{item.user}</span>
                            <span className="text-xs text-[var(--cmms-text-muted)]">{item.time}</span>
                          </div>
                          <div className="text-[var(--cmms-text-secondary)]">{item.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Low Stock */}
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold">แจ้งเตือนอะไหล่ใกล้หมดสต็อก</h3>
                    <Link href="/spare_parts" className="text-sm font-bold hover:underline" style={{ color: "var(--cmms-primary)" }}>
                      ไปที่คลังอะไหล่ →
                    </Link>
                  </div>
                  <div className="space-y-4">
                    {lowStock.length === 0 ? (
                      <EmptyState title="สต็อกปกติ" description="ไม่มีอะไหล่ต่ำกว่าจุดสั่งซื้อ" />
                    ) : lowStock.map((item) => (
                      <div
                        key={item.code}
                        className="space-y-2 rounded-xl border p-4"
                        style={{ background: "var(--cmms-bg-card)", borderColor: "var(--cmms-border)" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold">{item.name}</span>
                          <span className="text-sm text-[var(--cmms-text-secondary)]">
                            คงเหลือ <strong style={{ color: "var(--cmms-danger)" }}>{Number(item.stock_qty)}</strong> / {Number(item.min_stock)} {item.unit}
                          </span>
                        </div>
                        <StockBar qty={Number(item.stock_qty)} min={Number(item.min_stock)} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Inspections */}
            <Card>
              <CardContent className="space-y-4">
                <h3 className="flex items-center gap-2 font-bold">
                  <ClipboardCheck size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-info)" }} /> สรุปการตรวจเช็คประจำวัน
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className="cmms-kpi-card cyan">
                    <CardContent className="space-y-2">
                      <p className="text-sm font-medium text-[var(--cmms-text-secondary)]">ครบกำหนดวันนี้</p>
                      <p className="text-2xl font-bold" style={{ color: "var(--cmms-info)" }}>
                        <CountUp end={inspToday.due} />
                        <span className="ml-2 text-sm font-normal">รอบ</span>
                      </p>
                      <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่ได้ทำตรวจ</p>
                    </CardContent>
                  </Card>
                  <Card className="cmms-kpi-card red">
                    <CardContent className="space-y-2">
                      <p className="text-sm font-medium" style={{ color: "var(--cmms-danger)" }}>เกินกำหนด</p>
                      <p className="text-2xl font-bold" style={{ color: "var(--cmms-danger)" }}>
                        <CountUp end={inspToday.overdue} />
                        <span className="ml-2 text-sm font-normal">รอบ</span>
                      </p>
                      <p className="text-sm font-bold" style={{ color: "var(--cmms-danger)" }}>
                        {inspToday.overdue > 0 ? 'ต้องเร่งทำ — เสี่ยงต่อ audit' : 'ไม่มีรอบค้าง'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="cmms-kpi-card green">
                    <CardContent className="space-y-2">
                      <p className="text-sm font-medium" style={{ color: "var(--cmms-success)" }}>ทำแล้ววันนี้</p>
                      <p className="text-2xl font-bold" style={{ color: "var(--cmms-success)" }}>
                        <CountUp end={inspToday.done} />
                        <span className="ml-2 text-sm font-normal">รอบ</span>
                      </p>
                      <p className="text-sm font-bold" style={{ color: "var(--cmms-success)" }}>
                        ผ่าน {inspToday.pass} • ไม่ผ่าน {inspToday.fail}
                      </p>
                    </CardContent>
                  </Card>
                  <div className="flex items-center justify-center">
                    <Link href="/inspections/run">
                      <Button size="lg" className="gap-2">
                        <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden="true" />
                        ทำตรวจเช็คตอนนี้
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* Drill-down Modal (ui/Dialog มาตรฐาน) */}
      <Dialog
        open={!!selectedDrillDown}
        onClose={() => setSelectedDrillDown(null)}
        title={selectedDrillDown ? `เจาะลึกข้อมูลเดือน ${selectedDrillDown.month}` : ""}
        description="รายละเอียดเครื่องจักรที่ชำรุดและงานซ่อม"
      >
        {selectedDrillDown && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--cmms-success)", background: "var(--cmms-success-light)" }}>
                <p className="text-sm" style={{ color: "var(--cmms-success-dark)" }}>ซ่อมเสร็จสมบูรณ์</p>
                <p className="text-2xl font-bold" style={{ color: "var(--cmms-success)" }}>
                  {selectedDrillDown.completed} <span className="text-sm font-normal">รายการ</span>
                </p>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--cmms-danger)", background: "var(--cmms-danger-light)" }}>
                <p className="text-sm" style={{ color: "var(--cmms-danger-dark)" }}>เบรกดาวน์</p>
                <p className="text-2xl font-bold" style={{ color: "var(--cmms-danger)" }}>
                  {selectedDrillDown.breakdown} <span className="text-sm font-normal">ครั้ง</span>
                </p>
              </div>
            </div>

            <p className="font-bold">รายการเครื่องจักรที่มีปัญหาในเดือนนี้:</p>
            <div className="space-y-3">
              {drillDownMachines.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-center" style={{ borderColor: "var(--cmms-border)" }}>
                  <p className="text-[var(--cmms-text-secondary)]">ไม่มีข้อมูลงานซ่อมของเดือนนี้</p>
                </div>
              ) : drillDownMachines.map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "var(--cmms-border)" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger)" }}>
                      <Wrench size={22} strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-bold">{m.asset_name || m.title || "งานซ่อม"}</p>
                      <p className="text-sm text-[var(--cmms-text-secondary)]">{m.work_order_no} · ซ่อมโดย: {m.assigned_name || "ยังไม่มอบหมาย"}</p>
                    </div>
                  </div>
                  <Badge variant={["completed", "Completed", "closed", "resolved"].includes(m.status) ? "success" : "warning"}>
                    {m.status || "-"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      {/* AI Chatbot */}
      <div className={`fixed bottom-6 right-6 z-[120] flex flex-col items-end print:hidden`}>
        {isChatOpen && (
          <div
            className="mb-4 flex h-96 w-80 flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "var(--cmms-bg-card)", borderColor: "var(--cmms-border)" }}
          >
            <div className="flex items-center justify-between p-4 text-white" style={{ background: "var(--cmms-primary)" }}>
              <div className="flex items-center gap-2">
                <Cpu size={20} strokeWidth={1.75} aria-hidden="true" />
                <span className="font-bold">ผู้ช่วย AI ของระบบ</span>
              </div>
              <button onClick={() => setIsChatOpen(false)} aria-label="ปิดผู้ช่วย AI" className="rounded-full p-1 hover:bg-white/20">
                <X size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" style={{ background: "var(--cmms-bg-wash)" }}>
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-xl p-3 text-sm shadow-sm ${msg.role === 'ai' ? 'self-start rounded-tl-none border' : 'self-end rounded-tr-none text-white'}`}
                  style={
                    msg.role === 'ai'
                      ? { background: "var(--cmms-bg-card)", borderColor: "var(--cmms-border)", color: "var(--cmms-text-primary)" }
                      : { background: "var(--cmms-primary)" }
                  }
                >
                  {msg.text}
                </div>
              ))}
            </div>

            <div className="flex gap-2 border-t p-3" style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)" }}>
              <Input
                type="text"
                aria-label="พิมพ์ถาม AI"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitChat();
                }}
                placeholder="พิมพ์ถาม AI..."
                className="flex-1 rounded-full"
              />
              <button
                aria-label="ส่งข้อความ"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: "var(--cmms-primary)" }}
                onClick={submitChat}
              >
                <Send size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          aria-label={isChatOpen ? "ปิดผู้ช่วย AI" : "เปิดผู้ช่วย AI"}
          className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl transition-all duration-300 hover:scale-110"
          style={{ background: isChatOpen ? "var(--cmms-danger)" : "var(--cmms-primary)" }}
        >
          {isChatOpen ? <X size={24} strokeWidth={2} aria-hidden="true" /> : <MessageSquare size={24} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
