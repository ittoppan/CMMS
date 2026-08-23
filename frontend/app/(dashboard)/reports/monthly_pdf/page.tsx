"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Printer,
  FileDown,
  RefreshCw,
  CheckCircle2,
  Clock,
  Banknote,
  Wrench,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const FREQ_LABEL: Record<string, string> = {
  daily: "รายวัน (Daily)",
  weekly: "รายสัปดาห์ (Weekly)",
  monthly: "รายเดือน (Monthly)",
  quarterly: "รายไตรมาส (Quarterly)",
  yearly: "รายปี (Yearly)",
  other: "อื่น ๆ",
};

interface MonthStat {
  monthNum: number;
  completed: number;
  breakdown: number;
  cost: number;
  mtbf: number;
  mttr: number;
}

interface PmRow {
  title: string;
  frequency_type: string;
  status: string;
  due_date: string;
  last_done_date: string;
}

interface WorkOrder {
  status: string;
  cost_parts: string | number;
  cost_labor: string | number;
  cost_outsource: string | number;
}

export default function MonthlyPdfReportPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7);
  const [monthly, setMonthly] = useState<MonthStat[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [assets, setAssets] = useState(0);
  const [pmPlans, setPmPlans] = useState<PmRow[]>([]);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, woRes, aRes, pmRes, meRes] = await Promise.all([
        fetch(`/api/v1/analytics_monthly.php?year=${year}`),
        fetch("/api/v1/index.php"),
        fetch("/api/v1/index.php?resource=assets"),
        fetch("/api/v1/pm_am.php"),
        fetch("/api/v1/menu_permissions.php?user=1"),
      ]);
      const mJson = await mRes.json();
      const woJson = await woRes.json();
      const aJson = await aRes.json();
      const pmJson = await pmRes.json();
      const meJson = await meRes.json();

      setMonthly(mJson?.data || []);
      const wo = Array.isArray(woJson?.data) ? woJson.data : Array.isArray(woJson) ? woJson : [];
      setWorkOrders(wo);
      const aArr = aJson?.data || aJson?.assets;
      setAssets(Array.isArray(aArr) ? aArr.length : 0);
      const pm = Array.isArray(pmJson) ? pmJson : pmJson?.data || [];
      setPmPlans(pm);
      if (meJson?.user?.full_name) {
        setFullName(String(meJson.user.full_name).split("(")[0].trim());
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลรายงานได้ (กรุณาลองใหม่)");
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cur: MonthStat = monthly.find((m) => m.monthNum === month) || {
    monthNum: month, completed: 0, breakdown: 0, cost: 0, mtbf: 0, mttr: 0,
  };
  const monthTotal = cur.completed + cur.breakdown;
  const closeRate = monthTotal > 0 ? (cur.completed / monthTotal) * 100 : 0;
  const monthCost = cur.cost * 10000; // API ส่งค่าเป็น หมื่นบาท

  // ค่าใช้จ่ายรวมทั้งปี (บาท) — จากใบสั่งงานจริง
  const yearCost = workOrders.reduce(
    (s, w) => s + (parseFloat(String(w.cost_parts)) || 0) + (parseFloat(String(w.cost_labor)) || 0) + (parseFloat(String(w.cost_outsource)) || 0),
    0
  );

  // สรุป PM/AM จัดกลุ่มตามความถี่
  const pmGroups = (() => {
    const map: Record<string, { freq: string; total: number; done: number }> = {};
    pmPlans.forEach((p) => {
      const k = p.frequency_type || "other";
      map[k] = map[k] || { freq: k, total: 0, done: 0 };
      map[k].total += 1;
      if (p.status === "completed") map[k].done += 1;
    });
    return Object.values(map);
  })();
  const pmTotal = pmPlans.length;
  const pmDone = pmPlans.filter((p) => p.status === "completed").length;
  const pmRate = pmTotal > 0 ? (pmDone / pmTotal) * 100 : 0;

  const docNo = `RPT-${year}-${String(month).padStart(2, "0")}`;
  const today = new Date();
  const todayStr = `${today.getDate()} ${THAI_MONTHS[today.getMonth()]} ${today.getFullYear() + 543}`;

  const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

  const handleDownload = async () => {
    if (!reportRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "rgb(255, 255, 255)",
        logging: false,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pw) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(img, "PNG", 0, position, pw, imgHeight);
      heightLeft -= ph;
      while (heightLeft > 0) {
        position -= ph;
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, position, pw, imgHeight);
        heightLeft -= ph;
      }
      pdf.save(`RPT-${year}-${String(month).padStart(2, "0")}-CMMS-Maintenance-Summary.pdf`);
    } catch (e) {
      console.error("PDF generation failed:", e);
      alert("ไม่สามารถสร้าง PDF ได้ในเบราว์เซอร์นี้ — กรุณาใช้ปุ่ม \"พิมพ์เอกสาร A4\" แล้วเลือก \"บันทึกเป็น PDF\"");
    }
    setDownloading(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const monthOptions = THAI_MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions = [2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: `ปี ${y}` }));

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={28} />
        <span className="text-[var(--cmms-text-secondary)]">กำลังโหลดข้อมูลรายงาน...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {/* Header + Controls */}
      <div className="cmms-page-hero flex flex-col xl:flex-row xl:items-end justify-between gap-6 print:hidden">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>MONTHLY REPORT · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>รายงานสรุปงานซ่อมบำรุงประจำเดือน</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Printer size={14} strokeWidth={1.75} aria-hidden="true" /> พิมพ์เอกสาร A4 (ISO)
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            รายงานสรุปผลการดำเนินงานซ่อมบำรุงเสนอผู้บริหารประจำเดือน — ข้อมูลจริงจากระบบ
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))} aria-label="ปี">
            <SelectTrigger className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))} aria-label="เดือน">
            <SelectTrigger className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchData} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
          <Button variant="outline" disabled={downloading} onClick={handleDownload} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <FileDown size={16} strokeWidth={1.75} aria-hidden="true" />
            {downloading ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF"}
          </Button>
          <Button onClick={handlePrint}>
            <Printer size={16} strokeWidth={1.75} aria-hidden="true" />
            พิมพ์เอกสาร A4
          </Button>
        </div>
      </div>

      {/* A4 Printable Document Sheet */}
      <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
        <div ref={reportRef}>
          <Card style={{ backgroundColor: "white", color: "var(--tp-navy-dark)" }}>
            <CardContent className="space-y-6 p-8">
              {/* Header เอกสาร */}
              <div className="flex flex-col gap-4 border-b-2 pb-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--tp-navy-dark)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl font-bold" style={{ backgroundColor: "var(--cmms-primary)", color: "white" }}>
                    C
                  </div>
                  <div>
                    <p className="text-lg font-bold leading-snug" style={{ color: "var(--tp-navy-dark)" }}>บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด</p>
                    <p className="text-sm" style={{ color: "var(--cmms-text-muted)" }}>รายงานสรุปผลการดำเนินงานซ่อมบำรุงเสนอผู้บริหาร</p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <Badge variant="neutral">{`ประจำเดือน: ${THAI_MONTHS[month - 1]} ${year + 543}`}</Badge>
                  <p className="mt-1 text-sm" style={{ color: "var(--cmms-text-muted)" }}>เอกสารเลขที่: {docNo} · พิมพ์เมื่อ {todayStr}</p>
                </div>
              </div>

              {/* สรุป KPI สำคัญ */}
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <div className="rounded-md border p-3 text-center" style={{ backgroundColor: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
                  <div className="flex items-center justify-center gap-2">
                    <Wrench size={16} strokeWidth={1.75} style={{ color: "var(--cmms-primary)" }} aria-hidden="true" />
                    <span className="text-sm" style={{ color: "var(--cmms-text-secondary)" }}>ใบแจ้งซ่อมเดือนนี้</span>
                  </div>
                  <h3 className="mt-1 text-xl font-bold" style={{ color: "var(--tp-navy-dark)" }}>{fmt(monthTotal)} <span className="text-xs font-normal">งาน</span></h3>
                  <p className="text-sm" style={{ color: "var(--cmms-text-muted)" }}>เสร็จ {cur.completed} · แจ้งใหม่ {cur.breakdown}</p>
                </div>
                <div className="rounded-md border p-3 text-center" style={{ backgroundColor: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} strokeWidth={1.75} style={{ color: "var(--cmms-success)" }} aria-hidden="true" />
                    <span className="text-sm" style={{ color: "var(--cmms-text-secondary)" }}>ปิดงานได้สำเร็จ</span>
                  </div>
                  <h3 className="mt-1 text-xl font-bold" style={{ color: "var(--cmms-success)" }}>{closeRate.toFixed(1)}%</h3>
                </div>
                <div className="rounded-md border p-3 text-center" style={{ backgroundColor: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
                  <div className="flex items-center justify-center gap-2">
                    <Clock size={16} strokeWidth={1.75} style={{ color: "var(--cmms-info)" }} aria-hidden="true" />
                    <span className="text-sm" style={{ color: "var(--cmms-text-secondary)" }}>MTBF เดือนนี้</span>
                  </div>
                  <h3 className="mt-1 text-xl font-bold" style={{ color: "var(--cmms-primary)" }}>{fmt(cur.mtbf)} <span className="text-xs font-normal">ชม.</span></h3>
                  <p className="text-sm" style={{ color: "var(--cmms-text-muted)" }}>MTTR {cur.mttr} ชม.</p>
                </div>
                <div className="rounded-md border p-3 text-center" style={{ backgroundColor: "var(--cmms-bg-wash)", borderColor: "var(--cmms-border)" }}>
                  <div className="flex items-center justify-center gap-2">
                    <Banknote size={16} strokeWidth={1.75} style={{ color: "var(--cmms-warning)" }} aria-hidden="true" />
                    <span className="text-sm" style={{ color: "var(--cmms-text-secondary)" }}>ค่าใช้จ่ายเดือนนี้</span>
                  </div>
                  <h3 className="mt-1 text-xl font-bold" style={{ color: "var(--tp-navy-dark)" }}>฿{fmt(monthCost)}</h3>
                  <p className="text-sm" style={{ color: "var(--cmms-text-muted)" }}>ทั้งปี ฿{fmt(yearCost)}</p>
                </div>
              </div>

              {/* ตารางสรุปแยกตามประเภท */}
              <div className="space-y-3">
                <p className="text-base font-bold" style={{ color: "var(--tp-navy-dark)" }}>1. สรุปผลการทำ PM และ AM (แผนงานจริง {pmTotal} แผน)</p>
                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse", border: "1px solid var(--cmms-border)" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--cmms-bg-muted)", textAlign: "left" }}>
                      <th scope="col" className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>ความถี่</th>
                      <th scope="col" className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>แผนทั้งหมด</th>
                      <th scope="col" className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>ทำสำเร็จแล้ว</th>
                      <th scope="col" className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>อัตราสำเร็จ (%)</th>
                      <th scope="col" className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pmGroups.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)", color: "var(--cmms-text-muted)" }}>ยังไม่มีแผน PM/AM</td>
                      </tr>
                    )}
                    {pmGroups.map((g) => {
                      const rate = g.total > 0 ? (g.done / g.total) * 100 : 0;
                      const pass = rate >= 95;
                      return (
                        <tr key={g.freq}>
                          <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>{FREQ_LABEL[g.freq] || g.freq}</td>
                          <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>{g.total}</td>
                          <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>{g.done}</td>
                          <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>{rate.toFixed(1)}%</td>
                          <td className="px-3 py-2 font-bold" style={{ border: "1px solid var(--cmms-border)", color: pass ? "var(--cmms-success)" : "var(--cmms-danger)" }}>
                            {pass ? "ผ่านเกณฑ์" : "ต้องปรับปรุง"}
                          </td>
                        </tr>
                      );
                    })}
                    {pmGroups.length > 0 && (
                      <tr className="font-bold" style={{ backgroundColor: "var(--cmms-bg-wash)" }}>
                        <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>รวม</td>
                        <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>{pmTotal}</td>
                        <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>{pmDone}</td>
                        <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)" }}>{pmRate.toFixed(1)}%</td>
                        <td className="px-3 py-2" style={{ border: "1px solid var(--cmms-border)", color: pmRate >= 95 ? "var(--cmms-success)" : "var(--cmms-danger)" }}>
                          {pmRate >= 95 ? "ผ่านเกณฑ์" : "ต้องปรับปรุง"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="text-sm" style={{ color: "var(--cmms-text-muted)" }}>
                  หมายเหตุ: อุปกรณ์ที่ลงทะเบียน {assets} เครื่อง · ค่าใช้จ่ายซ่อมรวมทั้งปี (ใบสั่งงานจริง) ฿{fmt(yearCost)} · เกณฑ์ผ่าน ≥ 95%
                </p>
              </div>

              {/* ลายเซ็นอนุมัติ */}
              <div className="flex flex-col gap-8 pt-10 sm:flex-row sm:justify-between sm:pt-5">
                <div className="flex w-full flex-col items-center gap-6 sm:w-[220px]">
                  <span className="text-sm" style={{ color: "var(--cmms-text-muted)" }}>รายงานโดย (ช่างซ่อมบำรุง)</span>
                  <div className="h-[30px] w-full" style={{ borderBottom: "1px solid var(--cmms-text-muted)" }} />
                  <span className="text-sm">( {fullName || "ผู้ดูแลระบบ"} )</span>
                </div>
                <div className="flex w-full flex-col items-center gap-6 sm:w-[220px]">
                  <span className="text-sm" style={{ color: "var(--cmms-text-muted)" }}>ตรวจสอบโดย (วิศวกรซ่อมบำรุง)</span>
                  <div className="h-[30px] w-full" style={{ borderBottom: "1px solid var(--cmms-text-muted)" }} />
                  <span className="text-sm">( นายสมศักดิ์ รักดี )</span>
                </div>
                <div className="flex w-full flex-col items-center gap-6 sm:w-[220px]">
                  <span className="text-sm" style={{ color: "var(--cmms-text-muted)" }}>อนุมัติโดย (ผู้จัดการโรงงาน)</span>
                  <div className="h-[30px] w-full" style={{ borderBottom: "1px solid var(--cmms-text-muted)" }} />
                  <span className="text-sm">( ผจก. ฝ่ายผลิตและวิศวกรรม )</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
