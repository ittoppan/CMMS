"use client";

import { useState, useMemo, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Table, proportional, useTablePagination } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface HistoryWO extends Record<string, unknown> {
  id: string;
  rawId: number;
  woNumber: string;
  asset: string;
  title: string;
  status: string;
  assignee: string;
  requestDate: string;
  completedDate: string;
  rootCause: string;
  costParts: number;
  costLabor: number;
  costOutsource: number;
  downtimeMinutes: number;
}

const statusColors: Record<string, "success" | "warning" | "error" | "accent" | "neutral"> = {
  completed: "success", closed: "success", resolved: "success",
  rejected: "error",
  in_progress: "accent", open: "warning",
};

const statusLabels: Record<string, string> = {
  completed: "เสร็จสิ้น", closed: "ปิดงาน", resolved: "แก้ไขแล้ว",
  rejected: "ปฏิเสธ", cancelled: "ยกเลิก",
  in_progress: "กำลังซ่อม", open: "รอดำเนินการ",
};

// สถานะที่ถือเป็น "จบงานแล้ว" (แสดงในประวัติ)
const CLOSED_STATUSES = ["completed", "closed", "resolved", "rejected", "cancelled"];

const PAGE_SIZE = 10;

export default function RepairHistoryPage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<HistoryWO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/repair.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json
          .filter((row: any) => !row.status || CLOSED_STATUSES.includes(row.status))
          .map((row: any) => ({
            rawId: row.id,
            id: `wo-${row.id}`,
            woNumber: row.work_order_no || `WO-${row.id}`,
            asset: row.asset_name || "ไม่ระบุ",
            title: row.title || "",
            status: row.status || "closed",
            assignee: row.assigned_name || "ไม่ระบุ",
            requestDate: row.created_at ? row.created_at.split(" ")[0] : "-",
            completedDate: row.completed_at ? row.completed_at.split(" ")[0] : "-",
            rootCause: row.root_cause || row.resolution || row.solution || row.diagnosis || "",
            costParts: parseFloat(row.cost_parts) || 0,
            costLabor: parseFloat(row.cost_labor) || 0,
            costOutsource: parseFloat(row.cost_outsource) || 0,
            downtimeMinutes: parseInt(row.downtime_minutes) || 0,
          }));
        setWorkOrders(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch repair history", e);
      setError("ไม่สามารถโหลดประวัติงานซ่อมได้ กรุณาลองใหม่อีกครั้ง");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
    setError(null);
  }, []);

  const filtered = useMemo(() => {
    return workOrders.filter((wo) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        wo.woNumber.toLowerCase().includes(q) ||
        wo.asset.toLowerCase().includes(q) ||
        wo.assignee.toLowerCase().includes(q);
      const matchStatus = !statusFilter || wo.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, workOrders]);

  // สถิติรวมของประวัติ
  const stats = useMemo(() => {
    const total = workOrders.length;
    const costParts = workOrders.reduce((s, w) => s + w.costParts, 0);
    const costLabor = workOrders.reduce((s, w) => s + w.costLabor, 0);
    const costOutsource = workOrders.reduce((s, w) => s + w.costOutsource, 0);
    const downtime = workOrders.reduce((s, w) => s + w.downtimeMinutes, 0);
    return { total, costParts, costLabor, costOutsource, downtime };
  }, [workOrders]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pagination = useTablePagination<HistoryWO>({
    page,
    onPageChange: setPage,
    totalItems,
    pageSize: PAGE_SIZE,
  });

  const columns: TableColumn<HistoryWO>[] = [
    {
      key: "woNumber",
      header: "เลขที่งาน",
      width: proportional(1.2),
      renderCell: (item: HistoryWO) => (
        <Text type="body" weight="bold" style={{ color: 'var(--cmms-primary)' }}>{item.woNumber}</Text>
      ),
    },
    {
      key: "asset",
      header: "เครื่องจักร / อุปกรณ์",
      width: proportional(2),
      renderCell: (item: HistoryWO) => (
        <VStack gap={0}>
          <Text type="body" weight="semibold">{item.asset}</Text>
          {item.title && <Text type="body" size="sm" color="secondary">{item.title}</Text>}
        </VStack>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1),
      renderCell: (item: HistoryWO) => (
        <Badge label={statusLabels[item.status] || item.status} variant={statusColors[item.status] || "neutral"} />
      ),
    },
    { key: "assignee", header: "ผู้รับผิดชอบ", width: proportional(1) },
    { key: "requestDate", header: "วันที่แจ้ง", width: proportional(1) },
    { key: "completedDate", header: "วันที่เสร็จ", width: proportional(1) },
    {
      key: "rootCause",
      header: "สาเหตุ / แนวทางแก้ไข",
      width: proportional(2.2),
      renderCell: (item: HistoryWO) => (
        <Text type="body" size="sm" color="secondary" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.rootCause || "-"}
        </Text>
      ),
    },
    {
      key: "cost",
      header: "ค่าใช้จ่าย",
      width: proportional(1),
      renderCell: (item: HistoryWO) => {
        const total = item.costParts + item.costLabor + item.costOutsource;
        return total > 0 ? (
          <Text type="body" weight="semibold">{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</Text>
        ) : (
          <Text type="body" color="secondary">-</Text>
        );
      },
    },
    {
      key: "actions",
      header: "การจัดการ",
      width: proportional(1),
      renderCell: (item: HistoryWO) => (
        <Button
          size="sm"
          variant="secondary"
          label="ดูรายละเอียด"
          onClick={() => router.push(`/repair/edit?id=${item.rawId}`)}
        />
      ),
    },
  ];

  return (
    <VStack gap={6}>
      {error && (
        <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />
      )}

      {/* Header */}
      <HStack hAlign="between" vAlign="start">
        <VStack gap={1}>
          <Heading level={2}>ประวัติงานซ่อม</Heading>
          <Text type="body" color="secondary">รายการใบสั่งงานที่เสร็จสิ้นแล้วทั้งหมด</Text>
        </VStack>
        <Button
          label="รีเฟรช"
          variant="secondary"
          size="md"
          onClick={fetchHistory}
          icon={<Icon icon={ArrowPathIcon} size="sm" />}
        />
      </HStack>

      {/* Stat badges */}
      <HStack gap={2} wrap="wrap">
        <Badge label={`📋 งานที่เสร็จสิ้น: ${stats.total} งาน`} variant="success" />
        <Badge label={`💰 ค่าอะไหล่: ${stats.costParts.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} variant="neutral" />
        <Badge label={`👷 ค่าแรง: ${stats.costLabor.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} variant="info" />
        <Badge label={`🏭 ค่าจ้างภายนอก: ${stats.costOutsource.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} variant="warning" />
        {stats.downtime > 0 && (
          <Badge label={`⏱️ เวลาหยุดเครื่องรวม: ${stats.downtime.toLocaleString("th-TH")} นาที`} variant="info" />
        )}
      </HStack>

      {/* Filter Toolbar */}
      <Toolbar
        label="ตัวกรองประวัติงานซ่อม"
        startContent={
          <>
            <TextInput
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาเลขงาน, เครื่องจักร, ผู้รับผิดชอบ..."
              startIcon={MagnifyingGlassIcon}
              value={search}
              onChange={setSearch}
            />
            <Selector
              label="สถานะ"
              isLabelHidden
              placeholder="ทุกสถานะ"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "", label: "ทุกสถานะ" },
                { value: "completed", label: "เสร็จสิ้น" },
                { value: "closed", label: "ปิดงาน" },
                { value: "resolved", label: "แก้ไขแล้ว" },
                { value: "rejected", label: "ปฏิเสธ" },
              ]}
            />
          </>
        }
      />

      {/* Table */}
      {loading ? (
        <HStack hAlign="center" style={{ padding: 40 }}>
          <Spinner size="md" />
          <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
        </HStack>
      ) : paged.length === 0 ? (
        <EmptyState
          title="ไม่พบประวัติงานซ่อม"
          description="ลองเปลี่ยนตัวกรองหรือค้นหาด้วยคำอื่น"
          icon={<Icon icon={MagnifyingGlassIcon} size="lg" />}
        />
      ) : (
        <Table<HistoryWO>
          data={paged}
          columns={columns}
          idKey="id"
          density="balanced"
          dividers="rows"
          hasHover
          plugins={{ pagination }}
        />
      )}
    </VStack>
  );
}
