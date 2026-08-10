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
import { Link } from "@astryxdesign/core/Link";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import CountUp from "react-countup";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface WorkOrder extends Record<string, unknown> {
  id: string;
  woNumber: string;
  asset: string;
  status: string;
  priority: string;
  assignee: string;
  date: string;
}

const statusColors: Record<string, "success" | "warning" | "error" | "accent" | "neutral"> = {
  Completed: "success", completed: "success",
  "In Progress": "accent", in_progress: "accent",
  Open: "warning", open: "warning", pending: "warning",
  "Waiting Parts": "neutral",
  Overdue: "error", overdue: "error",
};

const priorityColors: Record<string, "error" | "warning" | "info" | "neutral"> = {
  Critical: "error", critical: "error",
  High: "warning", high: "warning",
  Medium: "info", medium: "info",
  Low: "neutral", low: "neutral",
};

const statusLabels: Record<string, string> = {
  completed: "เสร็จสิ้น", Completed: "เสร็จสิ้น", closed: "ปิดงาน", resolved: "แก้ไขแล้ว",
  in_progress: "กำลังซ่อม", "In Progress": "กำลังซ่อม", waiting_parts: "รออะไหล่", pending_parts: "รออะไหล่",
  open: "รอดำเนินการ", Open: "รอดำเนินการ", pending: "รอดำเนินการ",
  overdue: "เกินกำหนด", Overdue: "เกินกำหนด",
};

const priorityLabels: Record<string, string> = {
  critical: "วิกฤต", Critical: "วิกฤต",
  high: "สูง", High: "สูง",
  medium: "ปานกลาง", Medium: "ปานกลาง",
  low: "ต่ำ", Low: "ต่ำ",
};

const PAGE_SIZE = 10;

export default function WorkOrdersPage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchWO = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/repair.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `wo-${row.id}`,
          woNumber: row.work_order_no || `WO-${row.id}`,
          asset: row.asset_name || row.asset_code || row.title || "ไม่ระบุ",
          status: row.status || "pending",
          priority: row.priority || "Medium",
          assignee: row.assigned_name || row.assigned_to || "ยังไม่มอบหมาย",
          date: row.created_at ? row.created_at.split(" ")[0] : "-"
        }));
        setWorkOrders(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch WO", e);
      setError("Failed to fetch work orders. Please try again.");
    }
    setLoading(false);
  };

  useEffect(() => { 
    fetchWO(); 
    setError(null);
  }, []);

  const filtered = useMemo(() => {
    const statusGroup = (s: string) => {
      const v = String(s || "").toLowerCase();
      if (v === "completed" || v === "closed" || v === "resolved") return "completed";
      if (v === "in_progress" || v === "waiting_parts" || v === "pending_parts") return "in_progress";
      if (v === "open" || v === "pending" || v === "overdue") return "open";
      return v;
    };
    return workOrders.filter((wo) => {
      const q = search.toLowerCase();
      const matchSearch = !q || wo.woNumber.toLowerCase().includes(q) || wo.asset.toLowerCase().includes(q) || wo.assignee.toLowerCase().includes(q);
      const matchStatus = !statusFilter || statusGroup(wo.status) === statusFilter;
      const matchPriority = !priorityFilter || wo.priority === priorityFilter;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [search, statusFilter, priorityFilter, workOrders]);

  // Compute stats
  const stats = useMemo(() => {
    const total = workOrders.length;
    const open = workOrders.filter(w => ["open", "Open", "pending", "Overdue", "overdue"].includes(w.status)).length;
    const inprog = workOrders.filter(w => ["in_progress", "In Progress", "waiting_parts", "pending_parts"].includes(w.status)).length;
    const done = workOrders.filter(w => ["completed", "Completed", "closed", "resolved"].includes(w.status)).length;
    const overdue = workOrders.filter(w => w.status === "Overdue" || w.status === "overdue").length;
    return { total, open, inprog, done, overdue };
  }, [workOrders]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pagination = useTablePagination<WorkOrder>({
    page,
    onPageChange: setPage,
    totalItems,
    pageSize: PAGE_SIZE,
  });

  const columns: TableColumn<WorkOrder>[] = [
    { key: "woNumber", header: "เลขที่งาน", width: proportional(1) },
    { key: "asset", header: "เครื่องจักร/อุปกรณ์", width: proportional(2) },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1),
      renderCell: (item: WorkOrder) => (
        <Badge label={statusLabels[item.status] || item.status} variant={statusColors[item.status] || "neutral"} />
      ),
    },
    {
      key: "priority",
      header: "ความเร่งด่วน",
      width: proportional(1),
      renderCell: (item: WorkOrder) => (
        <Badge label={priorityLabels[item.priority] || item.priority} variant={priorityColors[item.priority] || "neutral"} />
      ),
    },
    { key: "assignee", header: "ผู้รับผิดชอบ", width: proportional(1) },
    { key: "date", header: "วันที่แจ้ง", width: proportional(1) },
    {
      key: "actions",
      header: "การจัดการ",
      width: proportional(1.2),
      renderCell: (item: WorkOrder) => (
        <Button
          size="sm"
          variant="secondary"
          label="อัปเดตสถานะ"
          onClick={() => router.push(`/repair/edit?id=${item.rawId || item.id}`)}
        />
      ),
    },
  ];

  return (
    <VStack gap={6}>
      {error && (
        <Banner status="error" title="Error" description={error} isDismissable={false} />
      )}

      {/* Header */}
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Heading level={2}>ใบสั่งงานซ่อม</Heading>
          <Text type="body" color="secondary">ระบบจัดการใบสั่งงานซ่อมบำรุง</Text>
        </VStack>
        <HStack gap={2}>
          <Button
            label="รีเฟรช"
            variant="secondary"
            size="md"
            onClick={fetchWO}
            icon={<Icon icon={ArrowPathIcon} size="sm" />}
          />
          <Link href="/repair/create">
            <Button label="สร้างใบสั่งงาน" variant="primary" size="md" icon={<Icon icon={PlusIcon} size="sm" />} />
          </Link>
        </HStack>
      </Card>

      {/* KPI Cards */}
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">งานซ่อมทั้งหมด</Text>
            <Heading level={2}><CountUp end={stats.total} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-warning-600">รอดำเนินการ (Open)</Text>
            <Heading level={2} className="text-warning-600"><CountUp end={stats.open} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-blue-600">กำลังซ่อม (In Progress)</Text>
            <Heading level={2} className="text-blue-600"><CountUp end={stats.inprog} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-emerald-600">เสร็จสิ้น (Completed)</Text>
            <Heading level={2} className="text-emerald-600"><CountUp end={stats.done} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>
        {stats.overdue > 0 && (
          <Card elevation="low" padding={4} className="border-rose-500 bg-rose-50 dark:bg-rose-900/10">
            <VStack gap={1}>
              <Text type="supporting" className="text-rose-600">เกินกำหนด</Text>
              <Heading level={2} className="text-rose-600"><CountUp end={stats.overdue} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </Card>
        )}
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          {/* Filter Toolbar */}
          <Toolbar
            label="ตัวกรองงานซ่อม"
            startContent={
              <>
                <TextInput
                  label="ค้นหา"
                  isLabelHidden
                  placeholder="ค้นหาเลขงาน, เครื่องจักร..."
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
                    { value: "open", label: "งานใหม่ (Open)" },
                    { value: "in_progress", label: "กำลังซ่อม" },
                    { value: "completed", label: "เสร็จสิ้น" },
                  ]}
                />
                <Selector
                  label="ความสำคัญ"
                  isLabelHidden
                  placeholder="ทุกความเร่งด่วน"
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  options={[
                    { value: "", label: "ทุกความเร่งด่วน" },
                    { value: "critical", label: "🔴 วิกฤต (Critical)" },
                    { value: "high", label: "🟠 ด่วน (High)" },
                    { value: "medium", label: "🟡 ปกติ (Medium)" },
                    { value: "low", label: "🟢 ต่ำ (Low)" },
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
              title="ไม่พบงานซ่อม"
              description="ลองเปลี่ยนตัวกรองหรือสร้างใบสั่งงานใหม่"
              icon={<Icon icon={MagnifyingGlassIcon} size="lg" />}
            />
          ) : (
            <Table<WorkOrder>
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
      </Card>
    </VStack>
  );
}
