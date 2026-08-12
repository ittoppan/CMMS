"use client";

import { useEffect, useState, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  FireIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface TechRow {
  id: string;
  name: string;
  openCount: number;
  overdueCount: number;
  activeCount: number;
  due7dCount: number;
  done7dCount: number;
  urgentCount: number;
}

export default function WorkloadPage() {
  const [rows, setRows] = useState<TechRow[]>([]);
  const [summary, setSummary] = useState({
    total_open: 0,
    total_overdue: 0,
    total_urgent: 0,
    technicians: 0,
    done_7d: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/workload.php");
      const json = await res.json();
      if (json.status === "success") {
        setRows(
          (json.data || []).map((r: any) => ({
            id: `tech-${r.user_id}`,
            name: r.full_name || `ผู้ใช้ #${r.user_id}`,
            openCount: r.open_count,
            overdueCount: r.overdue_count,
            activeCount: r.active_count,
            due7dCount: r.due_7d_count,
            done7dCount: r.done_7d_count,
            urgentCount: r.urgent_count,
          }))
        );
        setSummary(json.summary || {});
      } else {
        setError(json.message || "ไม่สามารถโหลดภาระงานได้");
      }
    } catch (e) {
      console.error("Fetch workload error", e);
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkload();
  }, [fetchWorkload]);

  const columns: TableColumn<TechRow>[] = [
    {
      key: "name",
      header: "ช่าง / ผู้รับผิดชอบ",
      width: proportional(2),
      renderCell: (item) => (
        <HStack gap={2} vAlign="center">
          <div
            style={{
              width: 30, height: 30, borderRadius: 999,
              background: "var(--cmms-gradient-primary)",
              color: "#fff", fontWeight: 700, fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {item.name.trim().charAt(0).toUpperCase()}
          </div>
          <Text type="body" weight="bold">{item.name}</Text>
        </HStack>
      ),
    },
    {
      key: "openCount",
      header: "งานค้าง (เปิด)",
      width: proportional(1),
      renderCell: (item) => (
        <Badge variant={item.openCount > 0 ? "warning" : "success"} label={String(item.openCount)} />
      ),
    },
    {
      key: "activeCount",
      header: "กำลังทำ",
      width: proportional(1),
      renderCell: (item) => <Text type="body">{item.activeCount}</Text>,
    },
    {
      key: "overdueCount",
      header: "เกินกำหนด",
      width: proportional(1),
      renderCell: (item) =>
        item.overdueCount > 0 ? (
          <Badge variant="error" label={`⏰ ${item.overdueCount}`} />
        ) : (
          <Text type="body" color="disabled">-</Text>
        ),
    },
    {
      key: "urgentCount",
      header: "ด่วน/วิกฤต",
      width: proportional(1),
      renderCell: (item) =>
        item.urgentCount > 0 ? (
          <Badge variant="error" label={`🔥 ${item.urgentCount}`} />
        ) : (
          <Text type="body" color="disabled">-</Text>
        ),
    },
    {
      key: "due7dCount",
      header: "ครบกำหนด 7 วัน",
      width: proportional(1.2),
      renderCell: (item) => <Text type="body">{item.due7dCount} งาน</Text>,
    },
    {
      key: "done7dCount",
      header: "ปิดงาน 7 วันล่าสุด",
      width: proportional(1.2),
      renderCell: (item) => (
        <Text type="body" color="success">{item.done7dCount} งาน</Text>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ภาระงานช่าง (Workload)</Heading>
            <Badge label="คำนวณจากงานซ่อมจริง" variant="info" />
          </HStack>
          <Text type="body" color="secondary">
            ภาพรวมงานค้าง งานเกินกำหนด และผลงานรายคน เพื่อกระจายงานได้ทั่วถึง
          </Text>
        </VStack>
        <Button
          label="รีเฟรช"
          variant="secondary"
          size="sm"
          icon={<Icon icon={ArrowPathIcon} size="sm" />}
          onClick={fetchWorkload}
        />
      </HStack>

      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <Grid columns={5} gap={4}>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-info)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={UserGroupIcon} size="md" color="info" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">ช่างที่มีงาน</Text>
              <Heading level={3}>{summary.technicians} คน</Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-warning)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={ClipboardDocumentListIcon} size="md" color="warning" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">งานค้างทั้งหมด</Text>
              <Heading level={3}>{summary.total_open} งาน</Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-danger)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={ExclamationTriangleIcon} size="md" color="error" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">เกินกำหนด</Text>
              <Heading level={3}>{summary.total_overdue} งาน</Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-danger)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={FireIcon} size="md" color="error" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">ด่วน / วิกฤต</Text>
              <Heading level={3}>{summary.total_urgent} งาน</Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} style={{ borderLeft: "4px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={CheckCircleIcon} size="md" color="success" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">ปิดงาน 7 วันล่าสุด</Text>
              <Heading level={3}>{summary.done_7d} งาน</Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card padding={0} style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="ยังไม่มีข้อมูลภาระงาน"
            description="เมื่อมีงานซ่อมที่มอบหมายให้ช่าง จะแสดงภาพรวมที่นี่"
            icon={<Icon icon={UserGroupIcon} size="lg" />}
          />
        ) : (
          <Table<TechRow> data={rows} columns={columns} idKey="id" density="balanced" dividers="rows" />
        )}
      </Card>

      <Text type="body" size="sm" color="disabled">
        หมายเหตุ: งานเกินกำหนด = ยังไม่ปิดงานและเกินวันกำหนดเสร็จ (estimated_completion_date) — ข้อมูลจากตาราง repair จริง
      </Text>
    </VStack>
  );
}
