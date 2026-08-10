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
  MagnifyingGlassIcon,
  TrashIcon,
  WrenchIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from "@heroicons/react/24/outline";

interface BorrowRecord extends Record<string, unknown> {
  rawId: number;
  id: string;
  assetName: string;
  borrowerName: string;
  borrowDate: string;
  expectedReturnDate: string;
  status: string;
}

const statusConfig: Record<string, { variant: "success" | "warning" | "error" | "neutral"; label: string }> = {
  borrowed: { variant: "warning", label: "กำลังยืมใช้งาน" },
  overdue: { variant: "error", label: "เกินกำหนดคืน" },
  returned: { variant: "success", label: "คืนเรียบร้อยแล้ว" },
  lost: { variant: "neutral", label: "สูญหาย" },
};

export default function EquipmentBorrowingPage() {
  const router = useRouter();
  const [data, setData] = useState<BorrowRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/equipment_borrowing.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => {
          let status = row.status || "borrowed";
          if (status === "borrowed" && row.expected_return_date && new Date(row.expected_return_date) < new Date()) {
            status = "overdue";
          }
          return {
            rawId: row.id,
            id: `BRW-${String(row.id).padStart(3, '0')}`,
            assetName: row.asset_name || "ไม่ระบุ",
            borrowerName: row.borrower_name || "ไม่ระบุ",
            borrowDate: row.borrow_date ? row.borrow_date.substring(0, 10) : "-",
            expectedReturnDate: row.expected_return_date || "-",
            status: status,
          };
        });
        setData(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch equipment borrowing", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this borrowing record?")) return;
    try {
      await fetch(`/api/v1/equipment_borrowing.php?id=${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      console.error("Failed to delete borrowing record", e);
    }
  };

  const stats = useMemo(() => {
    return {
      total: data.length,
      borrowed: data.filter(d => d.status === "borrowed").length,
      overdue: data.filter(d => d.status === "overdue").length,
      returned: data.filter(d => d.status === "returned").length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.assetName.toLowerCase().includes(q) ||
        s.borrowerName.toLowerCase().includes(q)
    );
  }, [search, data]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(totalItems / pageSize);

  const columns: TableColumn<BorrowRecord>[] = [
    { key: "id", header: "เลขที่การยืม", width: proportional(1) },
    { key: "assetName", header: "อุปกรณ์ / เครื่องมือ", width: proportional(2) },
    { key: "borrowerName", header: "ผู้ยืม", width: proportional(1.5) },
    { key: "borrowDate", header: "วันที่ยืม", width: proportional(1.2) },
    { key: "expectedReturnDate", header: "กำหนดคืน", width: proportional(1.2) },
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
            onClick={() => router.push(`/equipment_borrowing/edit?id=${item.rawId}`)}
            label="แก้ไข"
          />
          <IconButton
            size="sm"
            variant="destructive"
            label="ลบรายการยืม"
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
            <Heading level={2}>ระบบยืม-คืนเครื่องมือช่างและอุปกรณ์พิเศษ</Heading>
            <Badge label="เครื่องมือพิเศษ" variant="info" />
          </HStack>
          <Text type="body" color="secondary">ควบคุมการยืม-คืนเครื่องมือช่างราคาสูง อุปกรณ์วัดค่า และเครื่องตรวจวัดพิเศษ</Text>
        </VStack>
        <Button label="ขอยืมอุปกรณ์ใหม่" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => router.push("/equipment_borrowing/create")} />
      </Card>

      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-warning-600">กำลังถูกยืมใช้งาน</Text>
            <Heading level={2} className="text-warning-600"><CountUp end={stats.borrowed} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>

        <Card elevation="low" padding={4} className={stats.overdue > 0 ? "border-rose-500 bg-rose-50 dark:bg-rose-900/10" : ""}>
          <VStack gap={1}>
            <Text type="supporting" className={stats.overdue > 0 ? "text-rose-600" : "text-emerald-600"}>เกินกำหนดคืน</Text>
            <Heading level={2} className={stats.overdue > 0 ? "text-rose-600" : "text-emerald-600"}><CountUp end={stats.overdue} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>

        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-emerald-600">คืนเรียบร้อยแล้ว</Text>
            <Heading level={2} className="text-emerald-600"><CountUp end={stats.returned} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <Toolbar label="ค้นหารายการยืม" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาอุปกรณ์, ผู้ยืม หรือเลขที่การยืม..."
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
