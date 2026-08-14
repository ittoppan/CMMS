"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Table, proportional, pixel, useTablePagination } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Link } from "@astryxdesign/core/Link";
import CountUp from "react-countup";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

interface Asset extends Record<string, unknown> {
  code: string;
  name: string;
  department: string;
  status: "operational" | "under-repair" | "decommissioned" | "standby";
  location: string;
  lastPM: string;
}

// แปลงสถานะจริงจาก DB (asset_registry.status) เป็นค่าที่ UI ใช้
const dbStatusToUi: Record<string, Asset["status"]> = {
  active: "operational",
  under_repair: "under-repair",
  inactive: "standby",
  disposed: "decommissioned",
};

const statusLabelMap: Record<string, string> = {
  operational: "พร้อมใช้งาน",
  standby: "สแตนด์บาย",
  "under-repair": "กำลังซ่อม",
  decommissioned: "เลิกใช้งาน",
};

const statusChipStyle: Record<string, React.CSSProperties> = {
  operational: { background: "rgba(16,185,129,0.12)", color: "var(--cmms-success)" },
  standby: { background: "rgba(245,158,11,0.12)", color: "var(--cmms-warning)" },
  "under-repair": { background: "rgba(244,63,94,0.12)", color: "var(--cmms-danger)" },
  decommissioned: { background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)" },
};

const departmentLabelMap: Record<string, string> = {
  Production: "ฝ่ายผลิต",
  Utilities: "สาธารณูปโภค",
  Fabrication: "งานผลิตชิ้นส่วน",
  Facility: "อาคารสถานที่",
  Logistics: "ลอจิสติกส์",
};

const departments = [
  { value: "All", label: "ทั้งหมด" },
  { value: "Production", label: "ฝ่ายผลิต" },
  { value: "Utilities", label: "สาธารณูปโภค" },
  { value: "Fabrication", label: "งานผลิตชิ้นส่วน" },
  { value: "Facility", label: "อาคารสถานที่" },
  { value: "Logistics", label: "ลอจิสติกส์" },
];
const statuses = ["All", "operational", "standby", "under-repair", "decommissioned"];

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/index.php?resource=assets");
      const json = await res.json();
      if (json.status === "success" && json.data) {
        const fetched = json.data.map((row: any) => ({
          code: row.code || `AST-${row.id}`,
          name: row.name || "ไม่ระบุ",
          department: row.department || row.category || "-",
          status: dbStatusToUi[row.status] || (row.status as Asset["status"]) || "operational",
          location: row.location || "-",
          lastPM: row.last_pm || "-"
        }));
        setAssets(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch assets", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const kpiData = useMemo(() => {
    return {
      total: assets.length,
      operational: assets.filter(a => a.status === 'operational').length,
      underRepair: assets.filter(a => a.status === 'under-repair').length,
      standby: assets.filter(a => a.status === 'standby').length,
    };
  }, [assets]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
      const matchDept = deptFilter === "All" || a.department === deptFilter;
      const matchStatus = statusFilter === "All" || a.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [search, deptFilter, statusFilter, assets]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const pagination = useTablePagination<Asset>({
    page,
    onPageChange: setPage,
    totalItems,
    pageSize,
  });

  const columns: TableColumn<Asset>[] = [
    { key: "code", header: "รหัสเครื่องจักร", width: proportional(1), renderCell: (item: Asset) => <Link href={`/assets/${item.code}`}>{item.code}</Link> },
    { key: "name", header: "ชื่อเครื่องจักร", width: proportional(2) },
    { key: "department", header: "แผนก", width: proportional(1), renderCell: (item: Asset) => departmentLabelMap[item.department] || item.department },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1),
      renderCell: (item: Asset) => (
        <span className="cmms-andon-chip" style={statusChipStyle[item.status] || statusChipStyle.decommissioned}>
          {statusLabelMap[item.status] || item.status}
        </span>
      ),
    },
    { key: "location", header: "สถานที่ติดตั้ง", width: proportional(2) },
    { key: "lastPM", header: "วัน PM ล่าสุด", width: proportional(1) },
  ];

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>ASSETS · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ทะเบียนเครื่องจักรและทรัพย์สิน</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <BuildingOffice2Icon className="w-3.5 h-3.5" /> ทะเบียน {kpiData.total} รายการ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ระบบทะเบียนประวัติเครื่องจักรและอุปกรณ์ — ดูสถานะและวัน PM ล่าสุดได้ในที่เดียว
          </Text>
        </VStack>
        <a href="/assets/create" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary">
          <PlusIcon className="w-4 h-4" />
          เพิ่มเครื่องจักร
        </a>
      </div>

      <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile">
              <BuildingOffice2Icon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เครื่องจักรทั้งหมด</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={kpiData.total} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile green">
              <CheckCircleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">พร้อมใช้งาน</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={kpiData.operational} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile red">
              <WrenchScrewdriverIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">กำลังซ่อม</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={kpiData.underRepair} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile amber">
              <ClockIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">สแตนด์บาย</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={kpiData.standby} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <HStack gap={3} vAlign="end" wrap="wrap">
            <TextInput label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาด้วยรหัส ชื่อ หรือสถานที่..."
              value={search}
              onChange={setSearch}
              hasClear
              startIcon={MagnifyingGlassIcon}
              style={{ minWidth: 280 }}  />
            <Selector
              label="แผนก"
              isLabelHidden
              placeholder="แผนกทั้งหมด"
              value={deptFilter}
              onChange={(v) => { setDeptFilter(v); setPage(1); }}
              options={departments}
              style={{ minWidth: 160 }}
            />
            <Selector
              label="สถานะ"
              isLabelHidden
              placeholder="สถานะทั้งหมด"
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={statuses.map((s) => ({ value: s, label: s === "All" ? "ทั้งหมด" : statusLabelMap[s] }))}
              style={{ minWidth: 160 }}
            />
          </HStack>

          {!loading && filtered.length === 0 ? (
            <EmptyState
              title="ไม่พบเครื่องจักร"
              description="ลองเปลี่ยนตัวกรอง หรือเพิ่มเครื่องจักรใหม่ในระบบ"
            />
          ) : (
            <Table<Asset>
              data={paged}
              columns={columns}
              idKey="code"
              density="balanced"
              dividers="rows"
              hasHover
              plugins={{ pagination }}
            />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
