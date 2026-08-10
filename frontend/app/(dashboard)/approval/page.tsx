"use client";

import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  DocumentCheckIcon,
  WrenchScrewdriverIcon,
  CubeIcon
} from "@heroicons/react/24/outline";

interface ApprovalItem extends Record<string, unknown> {
  id: string;
  type: string;
  documentNo: string;
  requester: string;
  detail: string;
  amountDate: string;
  status: "pending" | "approved" | "rejected";
}

const mockApprovals: ApprovalItem[] = [
  { id: "app-1", type: "ปิดงานซ่อมบำรุง", documentNo: "EN-2607-004", requester: "ประเสริฐ ช่างกล", detail: "ซ่อมลูกปืนสายพานลำเลียง Main Line เสร็จสมบูรณ์ ขออนุมัติปิดงาน", amountDate: "2026-07-31", status: "pending" },
  { id: "app-2", type: "เบิกอะไหล่ข้ามคลัง", documentNo: "REQ-2026-089", requester: "วิชัย ช่างไฟ", detail: "ขอเบิก SKF 6205 Bearing 4 pcs สำหรับงานซ่อม Flexo #1", amountDate: "2026-07-31", status: "pending" },
  { id: "app-3", type: "ใบอนุญาตทำงานเสี่ยง LOTO", documentNo: "WP-2026-002", requester: "อนันต์ พนักงานคุมเครื่อง", detail: "ขออนุมัติทำงานในพื้นที่อับอากาศ Utility House", amountDate: "2026-07-30", status: "approved" },
];

export default function ApprovalCenterPage() {
  const [items, setItems] = useState<ApprovalItem[]>(mockApprovals);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleAction = (id: string, newStatus: "approved" | "rejected") => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
    setActionSuccess(newStatus === "approved" ? "อนุมัติรายการเรียบร้อยแล้ว" : "ปฏิเสธรายการเรียบร้อยแล้ว");
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const columns: TableColumn<ApprovalItem>[] = [
    { key: "documentNo", header: "เลขที่เอกสาร", width: proportional(1.2) },
    { key: "type", header: "ประเภทรายการ", width: proportional(1.5) },
    { key: "requester", header: "ผู้ยื่นคำขอ", width: proportional(1.2) },
    { key: "detail", header: "รายละเอียดคำขอ", width: proportional(2.5) },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1),
      renderCell: (item) => (
        <Badge
          variant={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}
          label={item.status === 'approved' ? 'อนุมัติแล้ว' : item.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
        />
      ),
    },
    {
      key: "actions",
      header: "การอนุมัติ",
      width: proportional(1.8),
      renderCell: (item) => (
        item.status === "pending" ? (
          <HStack gap={2}>
            <Button
              label="อนุมัติ"
              variant="primary"
              size="sm"
              icon={<Icon icon={CheckCircleIcon} size="xsm" />}
              onClick={() => handleAction(item.id, "approved")}
            />
            <Button
              label="ปฏิเสธ"
              variant="secondary"
              size="sm"
              icon={<Icon icon={XCircleIcon} size="xsm" />}
              onClick={() => handleAction(item.id, "rejected")}
            />
          </HStack>
        ) : (
          <Text type="body" size="sm" color="disabled">ดำเนินการแล้ว</Text>
        )
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ศูนย์อนุมัติเอกสารและคำขอ</Heading>
            <Badge label="จัดการขั้นตอนการอนุมัติ" variant="info" />
          </HStack>
          <Text type="body" color="secondary">อนุมัติปิดงานซ่อม การเบิกอะไหล่ และใบอนุญาตทำงานเสี่ยงสำหรับหัวหน้างานและผู้จัดการ</Text>
        </VStack>
      </HStack>

      {actionSuccess && (
        <div style={{
          padding: '12px 20px', borderRadius: 8,
          background: 'var(--cmms-success-light)', border: '1px solid var(--cmms-success)',
          color: 'var(--cmms-success)', fontWeight: 600,
        }}>
          ✅ {actionSuccess}
        </div>
      )}

      <Grid columns={3} gap={4}>
        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-warning)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">รายการรอการอนุมัติ</Text>
            <Heading level={3}>{items.filter(i => i.status === 'pending').length} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
          </VStack>
        </Card>

        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-success)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">อนุมัติแล้ววันนี้</Text>
            <Heading level={3}>{items.filter(i => i.status === 'approved').length} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
          </VStack>
        </Card>

        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-danger)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">ปฏิเสธ / ส่งกลับแก้ไข</Text>
            <Heading level={3}>{items.filter(i => i.status === 'rejected').length} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
          </VStack>
        </Card>
      </Grid>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <Table<ApprovalItem>
          data={items}
          columns={columns}
          idKey="id"
          density="balanced"
          dividers="rows"
        />
      </Card>
    </VStack>
  );
}
