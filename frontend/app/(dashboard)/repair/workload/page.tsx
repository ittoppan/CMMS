"use client";

import { useEffect, useState, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import AndonLamp from "@/components/AndonLamp";
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

interface TechRow extends Record<string, unknown> {
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
  const hero = usePageHero("repair/workload");
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
              background: "var(--cmms-primary)",
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
        <span className="cmms-andon-chip" style={item.openCount > 0 ? { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" } : { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }}>
          {item.openCount}
        </span>
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
          <span className="cmms-andon-chip" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}>{item.overdueCount}</span>
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
          <span className="cmms-andon-chip" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}>{item.urgentCount}</span>
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
        <Text type="body" style={{ color: "var(--cmms-success)" }}>{item.done7dCount} งาน</Text>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              คำนวณจากงานซ่อมจริง
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={fetchWorkload}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300"
        >
          <ArrowPathIcon className="w-4 h-4" />
          รีเฟรช
        </button>
      </div>

      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <Grid columns={5} gap={4}>
        <Card padding={4} className="cmms-kpi-card blue">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="idle" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">ช่างที่มีงาน</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{summary.technicians} คน</Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} className="cmms-kpi-card amber">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="warn" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">งานค้างทั้งหมด</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{summary.total_open} งาน</Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} className="cmms-kpi-card red">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="down" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">เกินกำหนด</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{summary.total_overdue} งาน</Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} className="cmms-kpi-card red">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="warn" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">ด่วน / วิกฤต</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{summary.total_urgent} งาน</Heading>
            </VStack>
          </HStack>
        </Card>
        <Card padding={4} className="cmms-kpi-card green">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="ok" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">ปิดงาน 7 วันล่าสุด</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{summary.done_7d} งาน</Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <HStack hAlign="between" vAlign="center" style={{ padding: '14px 20px', borderBottom: '1px solid var(--cmms-border)' }}>
          <HStack gap={2} vAlign="center">
            <div className="w-8 h-8 rounded-lg cmms-icon-tile">
              <UserGroupIcon className="w-4 h-4" />
            </div>
            <Text type="body" weight="bold">ภาระงานรายช่าง</Text>
            <span className="cmms-count-pill">{rows.length} ช่าง</span>
          </HStack>
        </HStack>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="ยังไม่มีข้อมูลภาระงาน"
            description="เมื่อมีงานซ่อมที่มอบหมายให้ช่าง จะแสดงภาพรวมที่นี่"
            icon={<UserGroupIcon className="w-6 h-6" />}
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
