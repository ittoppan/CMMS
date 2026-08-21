"use client";

import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, Table } from "lucide-react";

export default function ReportsHubPage() {
  const hero = usePageHero("reports");
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              ISO 9001 / ISO 55000
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="cmms-icon-tile h-12 w-12 rounded-xl">
                <FileDown size={24} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold">รายงาน PDF สรุปประจำเดือนสำหรับผู้บริหาร</h3>
                <p className="text-sm text-[var(--cmms-text-secondary)]">รายงานสรุปผลซ่อมบำรุงประจำเดือนสำหรับผู้บริหาร</p>
              </div>
            </div>

            <p className="text-[var(--cmms-text-secondary)]">
              สรุปภาพรวม KPI ประสิทธิภาพงานซ่อม MTBF, MTTR, สรุปการใช้อะไหล่ และค่าใช้จ่ายประจำเดือนในรูปแบบ PDF สำเร็จรูป
            </p>

            <Button onClick={() => (window.location.href = "/reports/monthly_pdf")}>
              เปิดศูนย์ออกรายงาน PDF
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="cmms-icon-tile green h-12 w-12 rounded-xl">
                <Table size={24} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold">ศูนย์ส่งออกข้อมูล Excel &amp; CSV</h3>
                <p className="text-sm text-[var(--cmms-text-secondary)]">ส่งออกข้อมูลดิบและรายงานวิเคราะห์เป็น CSV</p>
              </div>
            </div>

            <p className="text-[var(--cmms-text-secondary)]">
              เลือกชุดข้อมูลใบแจ้งซ่อม รายการอะไหล่ สต็อก ประวัติเครื่องจักร และช่วงเวลาที่ต้องการส่งออกเป็นไฟล์ Excel หรือ CSV
            </p>

            <Button onClick={() => (window.location.href = "/reports/export_excel")}>
              เปิดหน้าส่งออก Excel &amp; CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
