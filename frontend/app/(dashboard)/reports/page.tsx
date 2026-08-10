"use client";

import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Grid } from "@astryxdesign/core/Grid";
import {
  DocumentArrowDownIcon,
  TableCellsIcon,
  ChartBarIcon,
  PrinterIcon,
  DocumentCheckIcon
} from "@heroicons/react/24/outline";

export default function ReportsHubPage() {
  return (
    <VStack gap={6}>
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>📊 ศูนย์รวมรายงาน & การส่งออกข้อมูล</Heading>
            <Badge label="ISO 9001 / ISO 55000" variant="info" />
          </HStack>
          <Text type="body" color="secondary">รายงานสรุปผลการซ่อมบำรุงประจำเดือน PDF สำหรับผู้บริหาร และการส่งออกไฟล์ Excel/CSV</Text>
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={6}>
        <Card elevation="low" padding={6} style={{ borderTop: '4px solid var(--cmms-primary)' }}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--cmms-primary-light)', color: 'var(--cmms-primary)' }}>
                <Icon icon={DocumentArrowDownIcon} size="md" />
              </div>
              <VStack gap={0}>
                <Heading level={4}>รายงาน PDF สรุปประจำเดือนสำหรับผู้บริหาร</Heading>
                <Text type="body" size="sm" color="secondary">รายงานสรุปผลซ่อมบำรุงประจำเดือนสำหรับผู้บริหาร</Text>
              </VStack>
            </HStack>

            <Text type="body" color="secondary">
              สรุปภาพรวม KPI ประสิทธิภาพงานซ่อม MTBF, MTTR, สรุปการใช้อะไหล่ และค่าใช้จ่ายประจำเดือนในรูปแบบ PDF สำเร็จรูป
            </Text>

            <Button
              label="เปิดศูนย์ออกรายงาน PDF"
              variant="primary"
              onClick={() => (window.location.href = "/reports/monthly_pdf")}
            />
          </VStack>
        </Card>

        <Card elevation="low" padding={6} style={{ borderTop: '4px solid var(--cmms-success)' }}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--cmms-success-light)', color: 'var(--cmms-success)' }}>
                <Icon icon={TableCellsIcon} size="md" />
              </div>
              <VStack gap={0}>
                <Heading level={4}>ศูนย์ส่งออกข้อมูล Excel & CSV</Heading>
                <Text type="body" size="sm" color="secondary">ส่งออกข้อมูลดิบและรายงานวิเคราะห์เป็น CSV</Text>
              </VStack>
            </HStack>

            <Text type="body" color="secondary">
              เลือกชุดข้อมูลใบแจ้งซ่อม รายการอะไหล่ สต็อก ประวัติเครื่องจักร และช่วงเวลาที่ต้องการส่งออกเป็นไฟล์ Excel หรือ CSV
            </Text>

            <Button
              label="เปิดหน้าส่งออก Excel & CSV"
              variant="primary"
              onClick={() => (window.location.href = "/reports/export_excel")}
            />
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
