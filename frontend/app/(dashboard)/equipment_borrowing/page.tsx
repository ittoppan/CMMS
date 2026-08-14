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
import CountUp from "react-countup";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  WrenchIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  PencilSquareIcon,
  ArrowUturnLeftIcon,
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

const statusChipStyle: Record<string, React.CSSProperties> = {
  borrowed: { background: "rgba(245,158,11,0.12)", color: "var(--cmms-warning)" },
  overdue: { background: "rgba(244,63,94,0.12)", color: "var(--cmms-danger)" },
  returned: { background: "rgba(16,185,129,0.12)", color: "var(--cmms-success)" },
  lost: { background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)" },
};

const statusLabel: Record<string, string> = {
  borrowed: "กำลังยืมใช้งาน",
  overdue: "เกินกำหนดคืน",
  returned: "คืนเรียบร้อยแล้ว",
  lost: "สูญหาย",
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
        return (
          <span className="cmms-andon-chip" style={statusChipStyle[item.status] || statusChipStyle.borrowed}>
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
            onClick={() => router.push(`/equipment_borrowing/edit?id=${item.rawId}`)}
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
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>EQUIPMENT BORROWING · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ระบบยืม-คืนเครื่องมือช่างและอุปกรณ์พิเศษ</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <WrenchIcon className="w-3.5 h-3.5" /> เครื่องมือพิเศษ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ควบคุมการยืม-คืนเครื่องมือช่างราคาสูง อุปกรณ์วัดค่า และเครื่องตรวจวัดพิเศษ
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/equipment_borrowing/create")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          ขอยืมอุปกรณ์ใหม่
        </button>
      </div>

      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile amber">
              <ClockIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">กำลังถูกยืมใช้งาน</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.borrowed} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile red">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เกินกำหนดคืน</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.overdue} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile green">
              <CheckCircleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">คืนเรียบร้อยแล้ว</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.returned} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <Toolbar label="ค้นหารายการยืม" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาอุปกรณ์, ผู้ยืม หรือเลขที่การยืม..."
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
