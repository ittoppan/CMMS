"use client";

import { useState, useMemo, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional, useTablePagination } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import CountUp from "react-countup";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  ClockIcon,
  ClipboardDocumentListIcon,
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
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
            Repair History · CMMS-TOPPAN
          </Text>
          <Heading level={2} style={{ color: "#fff" }}>ประวัติงานซ่อม</Heading>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            รายการใบสั่งงานที่เสร็จสิ้นแล้วทั้งหมด
          </Text>
        </VStack>
        <button
          type="button"
          onClick={fetchHistory}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300"
        >
          <ArrowPathIcon className="w-4 h-4" />
          รีเฟรช
        </button>
      </div>

      {/* Stat cards */}
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card green">
          <VStack gap={2}>
            <HStack vAlign="center" gap={2}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md shrink-0">
                <CheckCircleIcon className="w-5 h-5" />
              </div>
              <Text type="supporting" color="secondary">งานที่เสร็จสิ้น</Text>
            </HStack>
            <div className="cmms-kpi-value">
              <CountUp end={stats.total} />
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </VStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card blue">
          <VStack gap={2}>
            <HStack vAlign="center" gap={2}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
                <WrenchScrewdriverIcon className="w-5 h-5" />
              </div>
              <Text type="supporting" color="secondary">ค่าอะไหล่</Text>
            </HStack>
            <div className="cmms-kpi-value">
              <CountUp end={stats.costParts} format={(n) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 })} />
              <span className="cmms-kpi-unit">บาท</span>
            </div>
          </VStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card cyan">
          <VStack gap={2}>
            <HStack vAlign="center" gap={2}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white flex items-center justify-center shadow-md shrink-0">
                <UserGroupIcon className="w-5 h-5" />
              </div>
              <Text type="supporting" color="secondary">ค่าแรง</Text>
            </HStack>
            <div className="cmms-kpi-value">
              <CountUp end={stats.costLabor} format={(n) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 })} />
              <span className="cmms-kpi-unit">บาท</span>
            </div>
          </VStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card amber">
          <VStack gap={2}>
            <HStack vAlign="center" gap={2}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
                <BuildingOffice2Icon className="w-5 h-5" />
              </div>
              <Text type="supporting" color="secondary">ค่าจ้างภายนอก</Text>
            </HStack>
            <div className="cmms-kpi-value">
              <CountUp end={stats.costOutsource} format={(n) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 })} />
              <span className="cmms-kpi-unit">บาท</span>
            </div>
          </VStack>
        </Card>
        {stats.downtime > 0 && (
          <Card elevation="low" padding={4} className="cmms-kpi-card red">
            <VStack gap={2}>
              <HStack vAlign="center" gap={2}>
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <ClockIcon className="w-5 h-5" />
                </div>
                <Text type="supporting" color="secondary">เวลาหยุดเครื่องรวม</Text>
              </HStack>
              <div className="cmms-kpi-value">
                <CountUp end={stats.downtime} />
                <span className="cmms-kpi-unit">นาที</span>
              </div>
            </VStack>
          </Card>
        )}
      </Grid>

      {/* Filter Toolbar */}
      <Card elevation="low" padding={5}>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
              <ClipboardDocumentListIcon className="w-4 h-4" />
            </div>
            <Heading level={3} style={{ margin: 0 }}>ประวัติใบสั่งงาน</Heading>
            <span className="cmms-count-pill">{totalItems} รายการ</span>
          </HStack>
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
        </VStack>
      </Card>

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
        <Card padding={0} style={{ overflow: "hidden" }}>
          <Table<HistoryWO>
            data={paged}
            columns={columns}
            idKey="id"
            density="balanced"
            dividers="rows"
            hasHover
            plugins={{ pagination }}
          />
        </Card>
      )}
    </VStack>
  );
}
