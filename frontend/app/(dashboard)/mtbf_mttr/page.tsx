"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  ChartBarIcon,
  BoltIcon,
  ClockIcon
} from "@heroicons/react/24/outline";

interface MtbfRecord extends Record<string, unknown> {
  rawId: number;
  id: string;
  assetName: string;
  period: string;
  operatingHours: number;
  totalFailures: number;
  totalDowntime: number;
  mtbfHours: number;
  mttrMinutes: number;
}

const MONTHS_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default function MtbfMttrPage() {
  const router = useRouter();
  const [data, setData] = useState<MtbfRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/mtbf_mttr.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `MTBF-${String(row.id).padStart(3, '0')}`,
          assetName: row.asset_name || "ไม่ระบุ",
          period: `${row.year} / ${MONTHS_TH[row.month] || row.month}`,
          operatingHours: Number(row.operating_hours || 0),
          totalFailures: Number(row.total_failures || 0),
          totalDowntime: Number(row.total_downtime_minutes || 0),
          mtbfHours: Number(row.mtbf_hours || 0),
          mttrMinutes: Number(row.mttr_minutes || 0),
        }));
        setData(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch MTBF/MTTR", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this MTBF/MTTR record?")) return;
    try {
      await fetch(`/api/v1/mtbf_mttr.php?id=${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      console.error("Failed to delete MTBF/MTTR", e);
    }
  };

  const stats = useMemo(() => {
    const avgMtbf = data.length
      ? data.reduce((sum, d) => sum + d.mtbfHours, 0) / data.length
      : 0;
    const avgMttr = data.length
      ? data.reduce((sum, d) => sum + d.mttrMinutes, 0) / data.length
      : 0;
    return {
      total: data.length,
      avgMtbf: avgMtbf.toFixed(1),
      avgMttr: avgMttr.toFixed(0),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.assetName.toLowerCase().includes(q) ||
        s.period.toLowerCase().includes(q)
    );
  }, [search, data]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(totalItems / pageSize);

  const columns: TableColumn<MtbfRecord>[] = [
    { key: "id", header: "รหัส", width: proportional(1) },
    { key: "assetName", header: "เครื่องจักร/อุปกรณ์", width: proportional(2) },
    { key: "period", header: "รอบเดือน", width: proportional(1.2) },
    {
      key: "mtbfHours",
      header: "MTBF (ชม.)",
      width: proportional(1),
      renderCell: (item) => (
        <Text type="body" weight="semibold">{item.mtbfHours.toFixed(1)}</Text>
      ),
    },
    {
      key: "mttrMinutes",
      header: "MTTR (นาที)",
      width: proportional(1),
      renderCell: (item) => <Text type="body">{item.mttrMinutes.toFixed(0)}</Text>,
    },
    {
      key: "totalFailures",
      header: "จำนวนครั้งเสีย",
      width: proportional(1),
      renderCell: (item) => (
        <Badge label={`${item.totalFailures} ครั้ง`} variant="neutral" />
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(1.5),
      renderCell: (item) => (
        <HStack gap={2}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => router.push(`/mtbf_mttr/edit?id=${item.rawId}`)}
            label="แก้ไข"
          />
          <IconButton
            size="sm"
            variant="destructive"
            label="ลบข้อมูล MTBF"
            icon={<Icon icon={TrashIcon} size="sm" />}
            onClick={() => handleDelete(item.rawId)}
          />
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>รายงานดัชนีชี้วัด MTBF & MTTR (Reliability KPI)</Heading>
            <Badge label="ระบบ CMMS" variant="info" />
          </HStack>
          <Text type="body" color="secondary">ติดตามค่าระยะเวลาเฉลี่ยก่อนการชำรุด (MTBF) และระยะเวลาเฉลี่ยในการซ่อม (MTTR)</Text>
        </VStack>
        <Button label="บันทึกข้อมูล MTBF/MTTR" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => router.push("/mtbf_mttr/create")} />
      </HStack>

      <Grid columns={3} gap={4}>
        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-primary)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">จำนวนบันทึกทั้งหมด</Text>
            <Heading level={3}>{stats.total} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
          </VStack>
        </Card>

        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-success)' }}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 10, borderRadius: 8, background: 'var(--color-success-wash)' }}>
              <Icon icon={BoltIcon} color="success" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ค่าเฉลี่ย MTBF</Text>
              <Heading level={3}>{stats.avgMtbf} <span style={{ fontSize: 14 }}>ชั่วโมง</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-warning)' }}>
          <HStack gap={3} vAlign="center">
            <div style={{ padding: 10, borderRadius: 8, background: 'var(--color-warning-wash)' }}>
              <Icon icon={ClockIcon} color="warning" size="md" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ค่าเฉลี่ย MTTR</Text>
              <Heading level={3}>{stats.avgMttr} <span style={{ fontSize: 14 }}>นาที</span></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card padding={4}>
        <VStack gap={4}>
          <Toolbar label="ค้นหาข้อมูล MTBF/MTTR" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาเครื่องจักร, รหัส หรือรอบเดือน..."
                startIcon={<Icon icon={MagnifyingGlassIcon} />}
                value={search}
                onChange={setSearch}
                style={{ width: 350 }}
              />
            </HStack>} />

          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}>กำลังโหลดข้อมูล...</div>
          ) : (
            <Table columns={columns} data={paged} />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
