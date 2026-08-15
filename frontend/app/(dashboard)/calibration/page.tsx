"use client";

import { useState, useMemo, useEffect } from "react";
import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import CountUp from "react-countup";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  PlusIcon,
  ScaleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface CalibrationRecord extends Record<string, unknown> {
  rawId: number;
  id: string;
  instrument: string;
  location: string;
  calType: string;
  lastCal: string;
  dueDate: string;
  certNo: string;
  status: string;
}

const statusChipStyle: Record<string, React.CSSProperties> = {
  completed: { background: "rgba(16,185,129,0.12)", color: "var(--cmms-success)" },
  pending: { background: "rgba(245,158,11,0.12)", color: "var(--cmms-warning)" },
  scheduled: { background: "rgba(245,158,11,0.12)", color: "var(--cmms-warning)" },
  overdue: { background: "rgba(244,63,94,0.12)", color: "var(--cmms-danger)" },
};

const statusLabel: Record<string, string> = {
  completed: "ปกติ",
  pending: "รอดำเนินการ",
  scheduled: "รอเข้าตาราง",
  overdue: "หมดอายุแล้ว",
};

export default function CalibrationPage() {
  const hero = usePageHero("calibration");
  const router = useRouter();
  const [data, setData] = useState<CalibrationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchCalibration = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/calibration.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => {
          let status = row.status || "pending";
          if (status === "pending" && new Date(row.next_calibration_date) < new Date()) {
            status = "overdue";
          }
          return {
            rawId: row.id,
            id: `CAL-${String(row.id).padStart(3, '0')}`,
            instrument: row.asset_name || "ไม่ระบุ",
            location: row.calibration_type || "Internal",
            calType: row.calibration_type || "Internal",
            lastCal: row.calibration_date || "-",
            dueDate: row.next_calibration_date || "-",
            certNo: row.certificate_number || "-",
            status: status,
          };
        });
        setData(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch calibration", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCalibration(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this calibration record?")) return;
    try {
      await fetch(`/api/v1/calibration.php?id=${id}`, { method: "DELETE" });
      fetchCalibration();
    } catch (e) {
      console.error("Failed to delete calibration", e);
    }
  };

  const stats = useMemo(() => {
    return {
      total: data.length,
      overdue: data.filter(d => d.status === "overdue").length,
      dueSoon: data.filter(d => d.status === "pending").length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.instrument.toLowerCase().includes(q) ||
        s.certNo.toLowerCase().includes(q)
    );
  }, [search, data]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(totalItems / pageSize);

  const columns: TableColumn<CalibrationRecord>[] = [
    { key: "id", header: "รหัสเครื่องมือ", width: proportional(1) },
    { key: "instrument", header: "ชื่อเครื่องมือวัด", width: proportional(2) },
    { key: "calType", header: "ประเภท", width: proportional(1) },
    { key: "lastCal", header: "สอบเทียบล่าสุด", width: proportional(1.2) },
    { key: "dueDate", header: "วันครบกำหนด", width: proportional(1.2) },
    { key: "certNo", header: "เลขใบเซอร์", width: proportional(1.5) },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1.5),
      renderCell: (item) => {
        return (
          <span className="cmms-andon-chip" style={statusChipStyle[item.status] || statusChipStyle.pending}>
            {statusLabel[item.status] || item.status}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(1.5),
      renderCell: (item) => (
        <HStack gap={2}>
          <button
            type="button"
            onClick={() => router.push(`/calibration/edit?id=${item.rawId}`)}
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
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ScaleIcon className="w-3.5 h-3.5" /> ควบคุมคุณภาพ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/calibration/create")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่มเครื่องมือ / แผนสอบเทียบ
        </button>
      </div>

      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile">
              <ScaleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เครื่องมือวัดทั้งหมด</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.total} /> <Text type="body" size="sm">เครื่อง</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile amber">
              <ClockIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">รอดำเนินการ</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.dueSoon} /> <Text type="body" size="sm">เครื่อง</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile red">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เลยกำหนด</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.overdue} /> <Text type="body" size="sm">เครื่อง</Text></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <Toolbar label="ค้นหาเครื่องมือวัด" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาชื่อเครื่องมือ, รหัส หรือใบเซอร์..."
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
