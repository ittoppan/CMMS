"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Download, Table, CheckCircle2, Database } from "lucide-react";

export default function ExportExcelReportPage() {
  const [reportType, setReportType] = useState("repair_all");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const handleExportCSV = async () => {
    setExporting(true);
    setSuccessMsg("");
    try {
      let endpoint = "/api/v1/index.php?resource=work-orders";
      if (reportType === "spare_parts") endpoint = "/api/v1/index.php?resource=spare-parts";
      if (reportType === "assets") endpoint = "/api/v1/index.php?resource=assets";

      const res = await fetch(endpoint);
      const json = await res.json();
      const rawData = json.data || json;

      if (!Array.isArray(rawData) || rawData.length === 0) {
        alert("ไม่มีข้อมูลส่งออกในช่วงเวลานี้");
        setExporting(false);
        return;
      }

      // Convert JSON Array to CSV format with UTF-8 BOM
      const headers = Object.keys(rawData[0]).join(",");
      const rows = rawData.map(obj => Object.values(obj).map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(","));
      const csvContent = "\uFEFF" + [headers, ...rows].join("\n");

      // Trigger File Download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cmms_export_${reportType}_${year}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setSuccessMsg(`ส่งออกไฟล์ Excel/CSV สำเร็จแล้ว (${rawData.length} รายการ)`);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (e) {
      console.error("Export error", e);
      alert("เกิดข้อผิดพลาดในการส่งออกไฟล์");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>REPORTS EXPORT EXCEL · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>ศูนย์ส่งออกข้อมูล Excel &amp; CSV</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Table size={14} strokeWidth={1.75} aria-hidden="true" /> รองรับ Excel &amp; Sage 300
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            ส่งออกรายงานสรุปงานซ่อม ค่าใช้จ่าย รายการสต็อก และทะเบียนเครื่องจักรเพื่อส่งต่อให้ฝ่ายบัญชีและการเงิน
          </p>
        </div>
      </div>

      {/* Success Notice */}
      {successMsg && (
        <Alert variant="success" title={successMsg} />
      )}

      {/* Export Options Form */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-bold">1. เลือกชุดข้อมูลและเงื่อนไขการส่งออก</h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="export-report-type" className="text-sm font-semibold">ประเภทรายงานข้อมูล:</label>
                <Select
                  value={reportType}
                  onValueChange={(v) => setReportType(v)}
                >
                  <SelectTrigger id="export-report-type" aria-label="ประเภทรายงาน">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repair_all">รายการใบสั่งงานซ่อมบำรุงทั้งหมด</SelectItem>
                    <SelectItem value="spare_parts">ยอดสต็อกและการเบิกจ่ายอะไหล่</SelectItem>
                    <SelectItem value="assets">ทะเบียนเครื่องจักรและทรัพย์สิน F-EN-01</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 space-y-1">
                  <label htmlFor="export-year" className="text-sm font-semibold">เลือกปี:</label>
                  <Select
                    value={year}
                    onValueChange={(v) => setYear(v)}
                  >
                    <SelectTrigger id="export-year" aria-label="ปี">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2026">ปี 2026 / 2569</SelectItem>
                      <SelectItem value="2025">ปี 2025 / 2568</SelectItem>
                      <SelectItem value="2024">ปี 2024 / 2567</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1 space-y-1">
                  <label htmlFor="export-month" className="text-sm font-semibold">เลือกเดือน:</label>
                  <Select
                    value={month}
                    onValueChange={(v) => setMonth(v)}
                  >
                    <SelectTrigger id="export-month" aria-label="เดือน">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทุกเดือน (ทั้งปี)</SelectItem>
                      <SelectItem value="1">มกราคม</SelectItem>
                      <SelectItem value="7">กรกฎาคม</SelectItem>
                      <SelectItem value="12">ธันวาคม</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button disabled={exporting} onClick={handleExportCSV}>
                <Download size={16} strokeWidth={1.75} aria-hidden="true" />
                {exporting ? "กำลังส่งออก..." : "ส่งออกไฟล์ Excel / CSV ทันที"}
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
                  <p className="text-sm text-[var(--cmms-text-secondary)]">ไฟล์ UTF-8 BOM แสดงภาษาไทยสมบูรณ์ สระไม่จม</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="cmms-icon-tile green h-10 w-10">
                  <Database size={20} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-bold">นำเข้า Sage 300 ERP ได้ทันที</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">ฟอร์แมตมาตรฐานสำหรับนำเข้า I/C Stock Journal</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
