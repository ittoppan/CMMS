"use client";

import { useState, useMemo, useEffect } from "react";
import { t, statusText } from "@/lib/i18n";
import AndonLamp from "@/components/AndonLamp";
import CountUp from "react-countup";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, RefreshCw, ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-native";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";

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
  outsourceBy: string;
}

const statusColors: Record<string, React.CSSProperties> = {
  completed: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  closed: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  resolved: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  rejected: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  in_progress: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  open: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
};

// สถานะที่ถือเป็น "จบงานแล้ว" (แสดงในประวัติ)
const CLOSED_STATUSES = ["completed", "closed", "resolved", "rejected", "cancelled"];

export default function RepairHistoryPage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<HistoryWO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [outsourceFilter, setOutsourceFilter] = useState<"all" | "in" | "out">("all");

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
            outsourceBy: row.outsource_by || "",
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
      const matchOutsource = outsourceFilter === "all" || (outsourceFilter === "out" ? !!wo.outsourceBy : !wo.outsourceBy);
      return matchSearch && matchStatus && matchOutsource;
    });
  }, [search, statusFilter, outsourceFilter, workOrders]);

  // สถิติรวมของประวัติ
  const stats = useMemo(() => {
    const total = workOrders.length;
    const costParts = workOrders.reduce((s, w) => s + w.costParts, 0);
    const costLabor = workOrders.reduce((s, w) => s + w.costLabor, 0);
    const costOutsource = workOrders.reduce((s, w) => s + w.costOutsource, 0);
    const downtime = workOrders.reduce((s, w) => s + w.downtimeMinutes, 0);
    return { total, costParts, costLabor, costOutsource, downtime };
  }, [workOrders]);

  const columns: ColumnDef<UiTableFeatures, HistoryWO>[] = [
    {
      accessorKey: "woNumber",
      header: t("tbl.wo_no_short"),
      cell: ({ row }: { row: { original: HistoryWO } }) => (
        <span className="font-bold text-[var(--cmms-primary)]">{row.original.woNumber}</span>
      ),
    },
    {
      accessorKey: "asset",
      header: t("tbl.asset_full"),
      cell: ({ row }: { row: { original: HistoryWO } }) => {
        const item = row.original;
        return (
          <div className="flex flex-col gap-0">
            <span className="font-semibold">{item.asset}</span>
            {(item.title || item.outsourceBy) && (
              <div className="flex flex-wrap items-center gap-2">
                {item.title && <span className="text-sm text-[var(--cmms-text-secondary)]">{item.title}</span>}
                {item.outsourceBy && (
                  <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
                    ภายนอก{item.outsourceBy ? ` · ${item.outsourceBy}` : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: t("tbl.status"),
      cell: ({ row }: { row: { original: HistoryWO } }) => (
        <span className="cmms-andon-chip" style={statusColors[row.original.status] || { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
          {statusText(row.original.status, row.original.status)}
        </span>
      ),
    },
    { accessorKey: "assignee", header: t("tbl.assignee") },
    { accessorKey: "requestDate", header: t("tbl.request_date") },
    { accessorKey: "completedDate", header: t("tbl.completed_date") },
    {
      accessorKey: "rootCause",
      header: t("tbl.root_cause"),
      cell: ({ row }: { row: { original: HistoryWO } }) => (
        <span className="line-clamp-2 block text-sm text-[var(--cmms-text-secondary)]">
          {row.original.rootCause || "-"}
        </span>
      ),
    },
    {
      id: "cost",
      header: t("tbl.cost"),
      cell: ({ row }: { row: { original: HistoryWO } }) => {
        const item = row.original;
        const total = item.costParts + item.costLabor + item.costOutsource;
        return total > 0 ? (
          <span className="font-semibold">{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
        ) : (
          <span className="text-[var(--cmms-text-secondary)]">-</span>
        );
      },
    },
    {
      id: "actions",
      header: t("tbl.actions"),
      enableSorting: false,
      cell: ({ row }: { row: { original: HistoryWO } }) => (
        <Button size="sm" variant="secondary" onClick={() => router.push(`/repair/edit?id=${row.original.rawId}`)}>
          ดูรายละเอียด
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
      )}

      {/* Header */}
      <div>
        <p className="cmms-eyebrow">Repair History · CMMS-TOPPAN</p>
        <PageHeader
          title="ประวัติงานซ่อม"
          description="รายการใบสั่งงานที่เสร็จสิ้นแล้วทั้งหมด"
          actions={
            <Button variant="outline" onClick={fetchHistory} className="gap-2">
              <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
              {t("action.refresh")}
            </Button>
          }
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="cmms-kpi-card green">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="ok" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">งานที่เสร็จสิ้น</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={stats.total} />
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card blue">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="idle" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ค่าอะไหล่</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={stats.costParts} formattingFn={(n) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 })} />
              <span className="cmms-kpi-unit">บาท</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card cyan">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="idle" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ค่าแรง</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={stats.costLabor} formattingFn={(n) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 })} />
              <span className="cmms-kpi-unit">บาท</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card amber">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="warn" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ค่าจ้างภายนอก</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={stats.costOutsource} formattingFn={(n) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 })} />
              <span className="cmms-kpi-unit">บาท</span>
            </div>
          </CardContent>
        </Card>
        {stats.downtime > 0 && (
          <Card className="cmms-kpi-card red">
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <AndonLamp status="down" size="sm" />
                <span className="text-sm text-[var(--cmms-text-secondary)]">เวลาหยุดเครื่องรวม</span>
              </div>
              <div className="cmms-kpi-value">
                <CountUp end={stats.downtime} />
                <span className="cmms-kpi-unit">นาที</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filter Toolbar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg cmms-icon-tile">
              <ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            ประวัติใบสั่งงาน
            <span className="cmms-count-pill">{filtered.length} รายการ</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]"
              />
              <Input
                aria-label="ค้นหา"
                placeholder="ค้นหาเลขงาน, เครื่องจักร, ผู้รับผิดชอบ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              aria-label="สถานะ"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="sm:w-44"
            >
              <option value="">{t("action.filter_all_status")}</option>
              <option value="completed">เสร็จสิ้น</option>
              <option value="closed">ปิดงาน</option>
              <option value="resolved">แก้ไขแล้ว</option>
              <option value="rejected">ปฏิเสธ</option>
            </Select>
            <div
              className="flex items-center gap-1 rounded-[10px] border border-[var(--cmms-border)] bg-[var(--cmms-bg-wash)] p-[3px]"
              role="group"
              aria-label="กรองงานใน/งานภายนอก"
            >
              {([
                { v: "all", label: "ทั้งหมด" },
                { v: "in", label: "งานใน" },
                { v: "out", label: "งานภายนอก" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setOutsourceFilter(opt.v)}
                  aria-pressed={outsourceFilter === opt.v}
                  style={{
                    padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                    background: outsourceFilter === opt.v ? "var(--cmms-bg-card)" : "transparent",
                    color: outsourceFilter === opt.v ? "var(--cmms-primary-hover)" : "var(--cmms-text-secondary)",
                    boxShadow: outsourceFilter === opt.v ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        pageSize={10}
        getRowId={(row) => row.id}
        emptyTitle="ไม่พบประวัติงานซ่อม"
        emptyDescription="ลองเปลี่ยนตัวกรองหรือค้นหาด้วยคำอื่น"
      />
    </div>
  );
}
