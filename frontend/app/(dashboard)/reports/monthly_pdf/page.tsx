"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Grid } from "@astryxdesign/core/Grid";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  PrinterIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  BanknotesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
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
        fetch(`/api/v1/analytics_monthly.php?year=${year}`, { headers: { "ngrok-skip-browser-warning": "1" } }),
        fetch("/api/v1/index.php", { headers: { "ngrok-skip-browser-warning": "1" } }),
        fetch("/api/v1/index.php?resource=assets", { headers: { "ngrok-skip-browser-warning": "1" } }),
        fetch("/api/v1/pm_am.php", { headers: { "ngrok-skip-browser-warning": "1" } }),
        fetch("/api/v1/menu_permissions.php?user=1", { headers: { "ngrok-skip-browser-warning": "1" } }),
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
        backgroundColor: "#ffffff",
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
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูลรายงาน...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      {/* Header + Controls */}
      <div className="cmms-page-hero flex flex-col xl:flex-row xl:items-end justify-between gap-6 print:hidden">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>รายงานสรุปงานซ่อมบำรุงประจำเดือน</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <PrinterIcon className="w-3.5 h-3.5" /> พิมพ์เอกสาร A4 (ISO)
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            รายงานสรุปผลการดำเนินงานซ่อมบำรุงเสนอผู้บริหารประจำเดือน — ข้อมูลจริงจากระบบ
          </Text>
        </VStack>
        <HStack gap={3} vAlign="end" wrap="wrap">
          <Selector label="ปี" isLabelHidden value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions} />
          <Selector label="เดือน" isLabelHidden value={String(month)} onChange={(v) => setMonth(Number(v))} options={monthOptions} />
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            <ArrowPathIcon className="w-4 h-4" />
            รีเฟรช
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300 disabled:opacity-50"
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            {downloading ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF"}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300"
          >
            <PrinterIcon className="w-4 h-4" />
            พิมพ์เอกสาร A4
          </button>
        </HStack>
      </div>

      {/* A4 Printable Document Sheet */}
      <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
        <div ref={reportRef}>
          <Card padding={8} style={{ backgroundColor: "white", color: "#1e293b" }}>
            <VStack gap={6}>
              {/* Header เอกสาร */}
              <HStack hAlign="between" vAlign="center" style={{ borderBottom: "2px solid #0f172a", paddingBottom: 16 }}>
                <HStack gap={3} vAlign="center">
                  <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "#4f46e5", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 20 }}>
                    C
                  </div>
                  <VStack gap={0}>
                    <Text type="body" weight="bold" style={{ fontSize: 18, color: "#0f172a" }}>บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด</Text>
                    <Text type="body" size="sm" style={{ color: "#64748b" }}>รายงานสรุปผลการดำเนินงานซ่อมบำรุงเสนอผู้บริหาร</Text>
                  </VStack>
                </HStack>
                <VStack gap={0} hAlign="end">
                  <Badge label={`ประจำเดือน: ${THAI_MONTHS[month - 1]} ${year + 543}`} variant="neutral" />
                  <Text type="body" size="sm" style={{ color: "#64748b", marginTop: 4 }}>เอกสารเลขที่: {docNo} · พิมพ์เมื่อ {todayStr}</Text>
                </VStack>
              </HStack>

              {/* สรุป KPI สำคัญ */}
              <Grid columns={4} gap={4}>
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                  <HStack gap={2} hAlign="center">
                    <WrenchScrewdriverIcon className="w-4 h-4" style={{ color: "var(--cmms-primary)" }} />
                    <Text type="body" size="sm" style={{ color: "var(--cmms-text-secondary)" }}>ใบแจ้งซ่อมเดือนนี้</Text>
                  </HStack>
                  <Heading level={3} style={{ color: "#0f172a" }}>{fmt(monthTotal)} <span style={{ fontSize: 12 }}>งาน</span></Heading>
                  <Text type="body" size="sm" style={{ color: "#94a3b8" }}>เสร็จ {cur.completed} · แจ้งใหม่ {cur.breakdown}</Text>
                </div>
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                  <HStack gap={2} hAlign="center">
                    <CheckCircleIcon className="w-4 h-4" style={{ color: "var(--cmms-success)" }} />
                    <Text type="body" size="sm" style={{ color: "var(--cmms-text-secondary)" }}>ปิดงานได้สำเร็จ</Text>
                  </HStack>
                  <Heading level={3} style={{ color: "#16a34a" }}>{closeRate.toFixed(1)}%</Heading>
                </div>
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                  <HStack gap={2} hAlign="center">
                    <ClockIcon className="w-4 h-4" style={{ color: "var(--cmms-info)" }} />
                    <Text type="body" size="sm" style={{ color: "var(--cmms-text-secondary)" }}>MTBF เดือนนี้</Text>
                  </HStack>
                  <Heading level={3} style={{ color: "#7c3aed" }}>{fmt(cur.mtbf)} <span style={{ fontSize: 12 }}>ชม.</span></Heading>
                  <Text type="body" size="sm" style={{ color: "#94a3b8" }}>MTTR {cur.mttr} ชม.</Text>
                </div>
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                  <HStack gap={2} hAlign="center">
                    <BanknotesIcon className="w-4 h-4" style={{ color: "var(--cmms-warning)" }} />
                    <Text type="body" size="sm" style={{ color: "var(--cmms-text-secondary)" }}>ค่าใช้จ่ายเดือนนี้</Text>
                  </HStack>
                  <Heading level={3} style={{ color: "#0f172a" }}>฿{fmt(monthCost)}</Heading>
                  <Text type="body" size="sm" style={{ color: "#94a3b8" }}>ทั้งปี ฿{fmt(yearCost)}</Text>
                </div>
              </Grid>

              {/* ตารางสรุปแยกตามประเภท */}
              <VStack gap={3}>
                <Text type="body" weight="bold" style={{ fontSize: 16, color: "#0f172a" }}>1. สรุปผลการทำ PM และ AM (แผนงานจริง {pmTotal} แผน)</Text>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, border: "1px solid #cbd5e1" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>ความถี่</th>
                      <th style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>แผนทั้งหมด</th>
                      <th style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>ทำสำเร็จแล้ว</th>
                      <th style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>อัตราสำเร็จ (%)</th>
                      <th style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pmGroups.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: "8px 12px", border: "1px solid #cbd5e1", color: "#94a3b8" }}>ยังไม่มีแผน PM/AM</td>
                      </tr>
                    )}
                    {pmGroups.map((g) => {
                      const rate = g.total > 0 ? (g.done / g.total) * 100 : 0;
                      const pass = rate >= 95;
                      return (
                        <tr key={g.freq}>
                          <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>{FREQ_LABEL[g.freq] || g.freq}</td>
                          <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>{g.total}</td>
                          <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>{g.done}</td>
                          <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>{rate.toFixed(1)}%</td>
                          <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1", color: pass ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
                            {pass ? "ผ่านเกณฑ์" : "ต้องปรับปรุง"}
                          </td>
                        </tr>
                      );
                    })}
                    {pmGroups.length > 0 && (
                      <tr style={{ backgroundColor: "#f8fafc", fontWeight: "bold" }}>
                        <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>รวม</td>
                        <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>{pmTotal}</td>
                        <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>{pmDone}</td>
                        <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1" }}>{pmRate.toFixed(1)}%</td>
                        <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1", color: pmRate >= 95 ? "#16a34a" : "#dc2626" }}>
                          {pmRate >= 95 ? "ผ่านเกณฑ์" : "ต้องปรับปรุง"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <Text type="body" size="sm" style={{ color: "#94a3b8" }}>
                  หมายเหตุ: อุปกรณ์ที่ลงทะเบียน {assets} เครื่อง · ค่าใช้จ่ายซ่อมรวมทั้งปี (ใบสั่งงานจริง) ฿{fmt(yearCost)} · เกณฑ์ผ่าน ≥ 95%
                </Text>
              </VStack>

              {/* ลายเซ็นอนุมัติ */}
              <HStack hAlign="between" style={{ marginTop: 40, paddingTop: 20 }}>
                <VStack gap={6} hAlign="center" style={{ width: 220 }}>
                  <Text type="body" size="sm" style={{ color: "#64748b" }}>รายงานโดย (ช่างซ่อมบำรุง)</Text>
                  <div style={{ borderBottom: "1px solid #94a3b8", width: "100%", height: 30 }} />
                  <Text type="body" size="sm">( {fullName || "ผู้ดูแลระบบ"} )</Text>
                </VStack>
                <VStack gap={6} hAlign="center" style={{ width: 220 }}>
                  <Text type="body" size="sm" style={{ color: "#64748b" }}>ตรวจสอบโดย (วิศวกรซ่อมบำรุง)</Text>
                  <div style={{ borderBottom: "1px solid #94a3b8", width: "100%", height: 30 }} />
                  <Text type="body" size="sm">( นายสมศักดิ์ รักดี )</Text>
                </VStack>
                <VStack gap={6} hAlign="center" style={{ width: 220 }}>
                  <Text type="body" size="sm" style={{ color: "#64748b" }}>อนุมัติโดย (ผู้จัดการโรงงาน)</Text>
                  <div style={{ borderBottom: "1px solid #94a3b8", width: "100%", height: 30 }} />
                  <Text type="body" size="sm">( ผจก. ฝ่ายผลิตและวิศวกรรม )</Text>
                </VStack>
              </HStack>
            </VStack>
          </Card>
        </div>
      </div>
    </VStack>
  );
}
