"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
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
  ClockIcon,
  PencilSquareIcon,
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
        <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "#64748B" }}>
          {item.totalFailures} ครั้ง
        </span>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(1.5),
      renderCell: (item) => (
        <HStack gap={2}>
          <button
            type="button"
            onClick={() => router.push(`/mtbf_mttr/edit?id=${item.rawId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            <PencilSquareIcon className="w-3.5 h-3.5" />
            แก้ไข
          </button>
          <button
            type="button"
            onClick={() => handleDelete(item.rawId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            ลบ
          </button>
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>MTBF MTTR · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>รายงานดัชนีชี้วัด MTBF & MTTR (Reliability KPI)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ChartBarIcon className="w-3.5 h-3.5" /> ระบบ CMMS
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ติดตามค่าระยะเวลาเฉลี่ยก่อนการชำรุด (MTBF) และระยะเวลาเฉลี่ยในการซ่อม (MTTR)
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/mtbf_mttr/create")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300"
        >
          <PlusIcon className="w-4 h-4" />
          บันทึกข้อมูล MTBF/MTTR
        </button>
      </div>

      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
              <ChartBarIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">จำนวนบันทึกทั้งหมด</Text>
              <Heading level={2}>{stats.total} <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md shrink-0">
              <BoltIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ค่าเฉลี่ย MTBF</Text>
              <Heading level={2}>{stats.avgMtbf} <Text type="body" size="sm">ชั่วโมง</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
              <ClockIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ค่าเฉลี่ย MTTR</Text>
              <Heading level={2}>{stats.avgMttr} <Text type="body" size="sm">นาที</Text></Heading>
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
                startIcon={<MagnifyingGlassIcon className="w-4 h-4" />}
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
