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
import CountUp from "react-countup";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  PlusIcon,
  ScaleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon
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

const statusConfig: Record<string, { variant: "success" | "warning" | "error" | "neutral"; label: string }> = {
  completed: { variant: "success", label: "ปกติ" },
  pending: { variant: "warning", label: "รอดำเนินการ" },
  scheduled: { variant: "warning", label: "รอเข้าตาราง" },
  overdue: { variant: "error", label: "หมดอายุแล้ว" },
};

export default function CalibrationPage() {
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
        const conf = statusConfig[item.status] || { variant: "neutral", label: item.status };
        return <Badge label={conf.label} variant={conf.variant} />;
      },
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
            onClick={() => router.push(`/calibration/edit?id=${item.rawId}`)}
            label="แก้ไข"
          />
          <IconButton
            size="sm"
            variant="destructive"
            label="ลบเครื่องมือวัด"
            icon={<Icon icon={TrashIcon} size="sm" />}
            onClick={() => handleDelete(item.rawId)}
          />
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ทะเบียนสอบเทียบเครื่องมือวัด</Heading>
            <Badge label="ควบคุมคุณภาพ" variant="info" />
          </HStack>
          <Text type="body" color="secondary">ติดตามรอบการสอบเทียบของเครื่องมือวัดในโรงงานทั้งหมด</Text>
        </VStack>
        <Button label="เพิ่มเครื่องมือ / แผนสอบเทียบ" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => router.push("/calibration/create")} />
      </Card>

      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">เครื่องมือวัดทั้งหมด</Text>
            <Heading level={2}><CountUp end={stats.total} /> <Text type="body" size="sm">เครื่อง</Text></Heading>
          </VStack>
        </Card>
        
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-warning-600">รอดำเนินการ</Text>
            <Heading level={2} className="text-warning-600"><CountUp end={stats.dueSoon} /> <Text type="body" size="sm">เครื่อง</Text></Heading>
          </VStack>
        </Card>

        <Card elevation="low" padding={4} className={stats.overdue > 0 ? "border-rose-500 bg-rose-50 dark:bg-rose-900/10" : ""}>
          <VStack gap={1}>
            <Text type="supporting" className={stats.overdue > 0 ? "text-rose-600" : "text-emerald-600"}>เลยกำหนด</Text>
            <Heading level={2} className={stats.overdue > 0 ? "text-rose-600" : "text-emerald-600"}><CountUp end={stats.overdue} /> <Text type="body" size="sm">เครื่อง</Text></Heading>
          </VStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <Toolbar label="ค้นหาเครื่องมือวัด" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาชื่อเครื่องมือ, รหัส หรือใบเซอร์..."
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
