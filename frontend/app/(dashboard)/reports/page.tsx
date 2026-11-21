"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DetailHeader } from "@/components/layout";
import { BarChart3, FileDown, Table, ChartPie, Upload } from "lucide-react";

export default function ReportsHubPage() {
  const hero = usePageHero("reports");
  return (
    <div className="space-y-6">
      {/* Header */}
      <DetailHeader
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        title={hero.title}
        description={hero.desc}
        status={<span className="cmms-andon-chip">ISO 9001 / ISO 55000</span>}
      />

      {/* CTA → Report Center ใหม่ */}
      <div
        className="flex flex-col justify-between gap-4 rounded-xl bg-[var(--cmms-primary)] p-6 text-white sm:flex-row sm:items-center"
      >
        <div className="flex items-start gap-4">
          <div className="cmms-icon-tile on-dark h-12 w-12 shrink-0 rounded-xl">
            <BarChart3 size={24} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">ศูนย์ออกรายงานใหม่ (Report Center)</h2>
            <p className="text-sm text-white/80">
              12 หมวดรายงานจากข้อมูลจริง — กรองช่วงเวลา/เครื่องจักร/แผนก แล้วส่งออก CSV, Excel หรือพิมพ์ PDF ได้ทันที
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="shrink-0 bg-white text-[var(--cmms-primary)] hover:bg-white/90"
          onClick={() => (window.location.href = "/reports/report-center")}
        >
          เปิด Report Center
        </Button>
      </div>

      <ModuleGuide
        name="ศูนย์รายงาน (Reports Hub)"
        summary="จุดรวมทางเข้าไปยังรายงานและการส่งออกข้อมูล — Report Center, รายงาน PDF ประจำเดือน, ส่งออก/นำเข้า Excel"
        steps={[
          "เลือกประเภทรายงานจากการ์ด/ปุ่มทางลัด (Report Center, PDF ประจำเดือน, Export/Import)",
          "กำหนดช่วงเวลา/ตัวกรองในหน้าปลายทาง แล้วสร้างหรือส่งออกผลลัพธ์",
          "ตรวจสอบไฟล์/ผลลัพธ์ก่อนส่งต่อ — ข้อมูลมาจากระบบจริง ณ เวลาที่ออกรายงาน",
        ]}
        source="หน้านี้เป็นศูนย์นำทาง — ข้อมูลดึงจากโมดูลรายงานปลายทางตามแต่ละหน้า"
        note="รายงานที่พิมพ์/ส่งออกสะท้อนข้อมูล ณ เวลาที่สร้าง ควรระบุช่วงเวลาและแหล่งที่มาเมื่อส่งต่อ"
        related={[
          { href: "/reports/monthly_pdf", label: "รายงาน PDF ประจำเดือน" },
          { href: "/reports/export_excel", label: "ส่งออก Excel/CSV" },
          { href: "/reports/import_excel", label: "นำเข้า Excel" },
        ]}
      />

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

        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="cmms-icon-tile warning h-12 w-12 rounded-xl">
                <ChartPie size={24} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold">วิเคราะห์เจาะลึก (Drill-down Analytics)</h3>
                <p className="text-sm text-[var(--cmms-text-secondary)]">วิเคราะห์ 8 มุมจากข้อมูลจริง</p>
              </div>
            </div>

            <p className="text-[var(--cmms-text-secondary)]">
              Downtime &amp; ความพร้อม · ค่าใช้จ่าย · SLA · PM vs Breakdown · สต็อก · ภาระงานช่าง · Inspection · สอบเทียบ
            </p>

            <Button variant="secondary" onClick={() => (window.location.href = "/analytics/advanced")}>
              เปิดหน้าวิเคราะห์เจาะลึก
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="cmms-icon-tile blue h-12 w-12 rounded-xl">
                <Upload size={24} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold">นำเข้าข้อมูล Excel (Import)</h3>
                <p className="text-sm text-[var(--cmms-text-secondary)]">ดาวน์โหลดแม่แบบ ตรวจสอบ แล้วยืนยันนำเข้า</p>
              </div>
            </div>

            <p className="text-[var(--cmms-text-secondary)]">
              นำเข้าใบสั่งงานซ่อม ทะเบียนเครื่องจักร แผน PM/AM อะไหล่ และสอบเทียบเป็นชุด — ระบบตรวจสอบทีละแถวก่อนบันทึกตามแม่แบบ
            </p>

            <Button variant="secondary" onClick={() => (window.location.href = "/reports/import_excel")}>
              เปิดหน้านำเข้า Excel
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
