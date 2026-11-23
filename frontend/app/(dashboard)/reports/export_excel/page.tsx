"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";
import { usePageHero } from "@/lib/i18n";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DetailHeader } from "@/components/layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Download, Table, Database, Upload, FileSpreadsheet } from "lucide-react";
import { reportUrl } from "@/components/reports/report-lib";

/**
 * ส่งออกข้อมูลจาก Report Center (server-side) — ใช้ตัวกรองชุดเดียวกับที่เห็นบนหน้าจอ
 * ไฟล์ที่ได้มาจาก /api/v1/reports.php?export=csv|xlsx ซึ่งบังคับ scope ตาม role + บันทึก report_audit_log
 * (เดิมหน้านี้ดึง /api/v1/index.php มาแปลง CSV ในเบราว์เซอร์ ทำให้ filter ปี/เดือนไม่ถูกใช้ และไม่ผ่าน scope)
 */

const RESOURCES = [
  { value: "work-orders", label: "ใบสั่งงานซ่อม (Work Orders)" },
  { value: "requests", label: "ใบแจ้งซ่อม (Repair Requests)" },
  { value: "pm", label: "แผน PM / AM" },
  { value: "inspections", label: "งานตรวจสอบ (Inspections)" },
  { value: "assets", label: "ทะเบียนเครื่องจักรและทรัพย์สิน" },
  { value: "spare-parts", label: "อะไหล่และสต็อก" },
  { value: "downtime", label: "Downtime" },
  { value: "sla", label: "SLA" },
  { value: "mttr-mtbf", label: "MTTR / MTBF" },
  { value: "technicians", label: "ผลงานช่าง (Technicians)" },
  { value: "cost", label: "ค่าใช้จ่าย (Cost)" },
] as const;

const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const YEARS = ["2026", "2025", "2024"];

/** แปลง ปี/เดือน ที่เลือกเป็น range_start / range_end (รูปแบบ YYYY-MM-DD ที่ API รับ) */
function rangeFrom(year: string, month: string): { start: string; end: string; label: string } {
  const y = Number(year);
  if (month === "all") {
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `ทั้งปี ${y}` };
  }
  const m = Number(month);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
    label: `${MONTHS[m - 1]} ${y}`,
  };
}

export default function ExportExcelReportPage() {
  const hero = usePageHero("reports/export_excel");

  const [resource, setResource] = useState<string>("work-orders");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("all");
  const [busy, setBusy] = useState<"csv" | "xlsx" | "">("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const range = rangeFrom(year, month);

  const handleExport = async (format: "csv" | "xlsx") => {
    setBusy(format);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      const url = reportUrl(resource, { range: "custom", range_start: range.start, range_end: range.end }, format);
      const res = await fetch(url, { credentials: "same-origin" });
      const ctype = res.headers.get("content-type") ?? "";

      if (!res.ok || ctype.includes("application/json")) {
        let msg = `ส่งออกไม่สำเร็จ (HTTP ${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = String(j.error);
        } catch {
          /* ไม่ใช่ JSON — ใช้ข้อความเดิม */
        }
        setErrorMsg(msg);
        return;
      }

      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^";]+)"?/i.exec(cd);
      const fallback = `cmms_${resource}_${range.start}_${range.end}.${format}`;
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = m?.[1] ?? fallback;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setSuccessMsg(`ส่งออก ${format.toUpperCase()} แล้ว — ${range.label} (เฉพาะข้อมูลตามสิทธิ์ของคุณ)`);
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (e) {
      console.error("Export error", e);
      setErrorMsg("เกิดข้อผิดพลาดในการส่งออกไฟล์");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <DetailHeader
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        title="ศูนย์ส่งออกข้อมูล Excel & CSV"
        description="ส่งออกรายงานจากข้อมูลจริงตามช่วงเวลาที่เลือก — ใช้ตัวกรองเดียวกับ Report Center และเคารพสิทธิ์ผู้ใช้"
        status={<span className="cmms-andon-chip"><Table size={14} strokeWidth={1.75} aria-hidden="true" /> รองรับ Excel & Sage 300</span>}
        primaryAction={
          <Button variant="secondary" onClick={() => (window.location.href = "/reports/import_excel")}>
            <Upload size={14} strokeWidth={1.75} aria-hidden="true" /> นำเข้าข้อมูล Excel
          </Button>
        }
      />

      <ModuleGuide
        name="ส่งออกข้อมูล Excel/CSV"
        summary="ส่งออกข้อมูลจากระบบเป็นไฟล์ Excel/CSV ตามประเภทรายงานและช่วงเวลา เพื่อใช้งานต่อหรือส่งต่อหน่วยงานที่เกี่ยวข้อง"
        steps={[
          "เลือกประเภทรายงาน ปี และเดือน (หรือทั้งปี) ที่ต้องการส่งออก",
          "กด CSV หรือ Excel — เซิร์ฟเวอร์สร้างไฟล์ด้วยตัวกรองเดียวกับหน้าจอรายงานและบันทึกประวัติการส่งออก",
          "ตรวจสอบไฟล์ก่อนนำไปใช้ โดยเฉพาะเมื่อนำเข้าระบบบัญชีหรือ Sage",
        ]}
        source="ไฟล์สร้างจาก /api/v1/reports.php (export=csv|xlsx) ซึ่งใช้สูตร/ตัวกรอง/ขอบเขตสิทธิ์ชุดเดียวกับรายงานบนหน้าจอ"
        note="ไฟล์สะท้อนข้อมูล ณ เวลาที่ส่งออกและเฉพาะข้อมูลที่ผู้ใช้มีสิทธิ์เห็น — รายงานที่จำกัดสิทธิ์ (เช่น ค่าใช้จ่าย) จะถูกปฏิเสธพร้อมเหตุผล"
        related={[
          { href: "/reports/import_excel", label: "นำเข้า Excel" },
          { href: "/reports/report-center", label: "ศูนย์ออกรายงาน" },
        ]}
      />

      {successMsg && <Alert variant="success" title={successMsg} />}
      {errorMsg && <Alert variant="danger" title={errorMsg} />}

      {/* Export Options Form */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-bold">1. เลือกชุดข้อมูลและเงื่อนไขการส่งออก</h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="export-resource" className="text-sm font-semibold">ประเภทรายงานข้อมูล:</label>
                <Select value={resource} onValueChange={setResource}>
                  <SelectTrigger id="export-resource" aria-label="ประเภทรายงาน">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOURCES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 space-y-1">
                  <label htmlFor="export-year" className="text-sm font-semibold">เลือกปี:</label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger id="export-year" aria-label="ปี">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => (
                        <SelectItem key={y} value={y}>ปี {y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1 space-y-1">
                  <label htmlFor="export-month" className="text-sm font-semibold">เลือกเดือน:</label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger id="export-month" aria-label="เดือน">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทุกเดือน (ทั้งปี)</SelectItem>
                      {MONTHS.map((label, i) => (
                        <SelectItem key={label} value={String(i + 1)}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-sm text-[var(--cmms-text-secondary)]">
                ช่วงข้อมูลที่จะส่งออก: <span className="font-semibold">{range.label}</span> ({range.start} ถึง {range.end})
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="outline" disabled={busy !== ""} onClick={() => handleExport("xlsx")}>
                <Download size={16} strokeWidth={1.75} aria-hidden="true" />
                {busy === "xlsx" ? "กำลังสร้าง Excel..." : "ส่งออก Excel"}
              </Button>
              <Button variant="outline" disabled={busy !== ""} onClick={() => handleExport("csv")}>
                <FileSpreadsheet size={16} strokeWidth={1.75} aria-hidden="true" />
                {busy === "csv" ? "กำลังสร้าง CSV..." : "ส่งออก CSV"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Info Card */}
        <Card style={{ background: "var(--cmms-bg-muted)" }}>
          <CardContent className="space-y-4">
            <h3 className="font-bold">รูปแบบไฟล์และการนำไปใช้งาน</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="cmms-icon-tile h-10 w-10">
                  <Table size={20} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-bold">รองรับ Microsoft Excel 100%</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">CSV เป็น UTF-8 BOM แสดงภาษาไทยสมบูรณ์ สระไม่จม</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="cmms-icon-tile green h-10 w-10">
                  <Database size={20} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-bold">นำเข้า Sage 300 ERP ได้ทันที</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">หัวคอลัมน์ตรงกับรายงานบนหน้าจอ — ตรวจสอบก่อนนำเข้า I/C Stock Journal</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
