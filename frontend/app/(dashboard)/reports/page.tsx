"use client";

import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import {
  DocumentArrowDownIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";

export default function ReportsHubPage() {
  return (
    <VStack gap={6}>
      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>REPORTS HUB · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ศูนย์รวมรายงาน & การส่งออกข้อมูล</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              ISO 9001 / ISO 55000
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            รายงานสรุปผลการซ่อมบำรุงประจำเดือน PDF สำหรับผู้บริหาร และการส่งออกไฟล์ Excel/CSV
          </Text>
        </VStack>
      </div>

      <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={6}>
        <Card elevation="low" padding={6}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              <div className="w-12 h-12 rounded-xl cmms-icon-tile">
                <DocumentArrowDownIcon className="w-6 h-6" />
              </div>
              <VStack gap={0}>
                <Heading level={4} style={{ margin: 0 }}>รายงาน PDF สรุปประจำเดือนสำหรับผู้บริหาร</Heading>
                <Text type="body" size="sm" color="secondary">รายงานสรุปผลซ่อมบำรุงประจำเดือนสำหรับผู้บริหาร</Text>
              </VStack>
            </HStack>

            <Text type="body" color="secondary">
              สรุปภาพรวม KPI ประสิทธิภาพงานซ่อม MTBF, MTTR, สรุปการใช้อะไหล่ และค่าใช้จ่ายประจำเดือนในรูปแบบ PDF สำเร็จรูป
            </Text>

            <button
              type="button"
              onClick={() => (window.location.href = "/reports/monthly_pdf")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
            >
              เปิดศูนย์ออกรายงาน PDF
            </button>
          </VStack>
        </Card>

        <Card elevation="low" padding={6}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              <div className="w-12 h-12 rounded-xl cmms-icon-tile green">
                <TableCellsIcon className="w-6 h-6" />
              </div>
              <VStack gap={0}>
                <Heading level={4} style={{ margin: 0 }}>ศูนย์ส่งออกข้อมูล Excel & CSV</Heading>
                <Text type="body" size="sm" color="secondary">ส่งออกข้อมูลดิบและรายงานวิเคราะห์เป็น CSV</Text>
              </VStack>
            </HStack>

            <Text type="body" color="secondary">
              เลือกชุดข้อมูลใบแจ้งซ่อม รายการอะไหล่ สต็อก ประวัติเครื่องจักร และช่วงเวลาที่ต้องการส่งออกเป็นไฟล์ Excel หรือ CSV
            </Text>

            <button
              type="button"
              onClick={() => (window.location.href = "/reports/export_excel")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
            >
              เปิดหน้าส่งออก Excel & CSV
            </button>
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
