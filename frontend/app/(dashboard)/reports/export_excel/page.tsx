"use client";

import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Selector } from "@astryxdesign/core/Selector";
import { 
  ArrowDownTrayIcon,
  DocumentTextIcon,
  TableCellsIcon,
  CheckCircleIcon,
  SparklesIcon,
  CircleStackIcon,
} from "@heroicons/react/24/outline";

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
    <VStack gap={6}>
      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>REPORTS EXPORT EXCEL · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ศูนย์ส่งออกข้อมูล Excel & CSV</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <TableCellsIcon className="w-3.5 h-3.5" /> รองรับ Excel & Sage 300
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ส่งออกรายงานสรุปงานซ่อม ค่าใช้จ่าย รายการสต็อก และทะเบียนเครื่องจักรเพื่อส่งต่อให้ฝ่ายบัญชีและการเงิน
          </Text>
        </VStack>
      </div>

      {/* Alert Notice */}
      {successMsg && (
        <Card padding={4} style={{ background: 'var(--cmms-success-bg)', border: '1px solid var(--cmms-success)' }}>
          <HStack gap={3} vAlign="center">
            <CheckCircleIcon className="w-5 h-5" style={{ color: "var(--cmms-success)" }} />
            <Text type="body" weight="bold" style={{ color: 'var(--cmms-success)' }}>
              {successMsg}
            </Text>
          </HStack>
        </Card>
      )}

      {/* Export Options Form */}
      <Grid columns={{ minWidth: 400, repeat: "fit" }} gap={6}>
        <Card padding={5}>
          <VStack gap={4}>
            <Heading level={4}>1. เลือกชุดข้อมูลและเงื่อนไขการส่งออก</Heading>
            
            <VStack gap={3}>
              <VStack gap={1}>
                <Text type="body" size="sm" weight="semibold">ประเภทรายงานข้อมูล:</Text>
                <Selector
                  label="ประเภทรายงาน"
                  isLabelHidden
                  value={reportType}
                  onChange={(v) => setReportType(String(v))}
                  options={[
                    { value: "repair_all", label: "รายการใบสั่งงานซ่อมบำรุงทั้งหมด" },
                    { value: "spare_parts", label: "ยอดสต็อกและการเบิกจ่ายอะไหล่" },
                    { value: "assets", label: "ทะเบียนเครื่องจักรและทรัพย์สิน F-EN-01" },
                  ]}
                />
              </VStack>

              <HStack gap={3}>
                <VStack gap={1} style={{ flex: 1 }}>
                  <Text type="body" size="sm" weight="semibold">เลือกปี:</Text>
                  <Selector
                    label="ปี"
                    isLabelHidden
                    value={year}
                    onChange={(v) => setYear(String(v))}
                    options={[
                      { value: "2026", label: "ปี 2026 / 2569" },
                      { value: "2025", label: "ปี 2025 / 2568" },
                      { value: "2024", label: "ปี 2024 / 2567" },
                    ]}
                  />
                </VStack>

                <VStack gap={1} style={{ flex: 1 }}>
                  <Text type="body" size="sm" weight="semibold">เลือกเดือน:</Text>
                  <Selector
                    label="เดือน"
                    isLabelHidden
                    value={month}
                    onChange={(v) => setMonth(String(v))}
                    options={[
                      { value: "all", label: "ทุกเดือน (ทั้งปี)" },
                      { value: "1", label: "มกราคม" },
                      { value: "7", label: "กรกฎาคม" },
                      { value: "12", label: "ธันวาคม" },
                    ]}
                  />
                </VStack>
              </HStack>
            </VStack>

            <HStack hAlign="end" gap={2} style={{ marginTop: 8 }}>
              <button
                type="button"
                disabled={exporting}
                onClick={handleExportCSV}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                {exporting ? "กำลังส่งออก..." : "ส่งออกไฟล์ Excel / CSV ทันที"}
              </button>
            </HStack>
          </VStack>
        </Card>

        {/* Right Info Card */}
        <Card padding={5} style={{ background: 'var(--cmms-bg-muted)' }}>
          <VStack gap={4}>
            <Heading level={4}>รูปแบบไฟล์และการนำไปใช้งาน</Heading>
            <VStack gap={3}>
              <HStack gap={3} vAlign="center">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <TableCellsIcon className="w-5 h-5" />
                </div>
                <VStack gap={0}>
                  <Text type="body" weight="bold">รองรับ Microsoft Excel 100%</Text>
                  <Text type="body" size="sm" color="secondary">ไฟล์ UTF-8 BOM แสดงภาษาไทยสมบูรณ์ สระไม่จม</Text>
                </VStack>
              </HStack>

              <HStack gap={3} vAlign="center">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <CircleStackIcon className="w-5 h-5" />
                </div>
                <VStack gap={0}>
                  <Text type="body" weight="bold">นำเข้า Sage 300 ERP ได้ทันที</Text>
                  <Text type="body" size="sm" color="secondary">ฟอร์แมตมาตรฐานสำหรับนำเข้า I/C Stock Journal</Text>
                </VStack>
              </HStack>
            </VStack>
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
