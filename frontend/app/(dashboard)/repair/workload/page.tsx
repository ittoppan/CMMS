"use client";

import { useEffect, useState, useCallback } from "react";
import { usePageHero, t } from "@/lib/i18n";
import AndonLamp from "@/components/AndonLamp";
import CountUp from "react-countup";
import { type ColumnDef } from "@tanstack/react-table";
import { Users, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";

interface TechRow extends Record<string, unknown> {
  id: string;
  name: string;
  openCount: number;
  overdueCount: number;
  activeCount: number;
  due7dCount: number;
  done7dCount: number;
  urgentCount: number;
}

export default function WorkloadPage() {
  const hero = usePageHero("repair/workload");
  const [rows, setRows] = useState<TechRow[]>([]);
  const [summary, setSummary] = useState({
    total_open: 0,
    total_overdue: 0,
    total_urgent: 0,
    technicians: 0,
    done_7d: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/workload.php");
      const json = await res.json();
      if (json.status === "success") {
        setRows(
          (json.data || []).map((r: any) => ({
            id: `tech-${r.user_id}`,
            name: r.full_name || `ผู้ใช้ #${r.user_id}`,
            openCount: r.open_count,
            overdueCount: r.overdue_count,
            activeCount: r.active_count,
            due7dCount: r.due_7d_count,
            done7dCount: r.done_7d_count,
            urgentCount: r.urgent_count,
          }))
        );
        setSummary(json.summary || {});
      } else {
        setError(json.message || "ไม่สามารถโหลดภาระงานได้");
      }
    } catch (e) {
      console.error("Fetch workload error", e);
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkload();
  }, [fetchWorkload]);

  const columns: ColumnDef<UiTableFeatures, TechRow>[] = [
    {
      accessorKey: "name",
      header: t("tbl.tech_assignee_full"),
      cell: ({ row }: { row: { original: TechRow } }) => (
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{ background: "var(--cmms-primary)" }}
          >
            {row.original.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="font-bold">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "openCount",
      header: t("tbl.open_jobs"),
      cell: ({ row }: { row: { original: TechRow } }) => (
        <span
          className="cmms-andon-chip"
          style={
            row.original.openCount > 0
              ? { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
              : { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
          }
        >
          {row.original.openCount}
        </span>
      ),
    },
    { accessorKey: "activeCount", header: t("tbl.in_progress_h") },
    {
      accessorKey: "overdueCount",
      header: t("tbl.overdue"),
      cell: ({ row }: { row: { original: TechRow } }) =>
        row.original.overdueCount > 0 ? (
          <span className="cmms-andon-chip" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}>
            {row.original.overdueCount}
          </span>
        ) : (
          <span className="text-[var(--cmms-text-muted)]">-</span>
        ),
    },
    {
      accessorKey: "urgentCount",
      header: t("tbl.urgent"),
      cell: ({ row }: { row: { original: TechRow } }) =>
        row.original.urgentCount > 0 ? (
          <span className="cmms-andon-chip" style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}>
            {row.original.urgentCount}
          </span>
        ) : (
          <span className="text-[var(--cmms-text-muted)]">-</span>
        ),
    },
    {
      accessorKey: "due7dCount",
      header: t("tbl.due_in_7d"),
      cell: ({ row }: { row: { original: TechRow } }) => (
        <span>{row.original.due7dCount} งาน</span>
      ),
    },
    {
      accessorKey: "done7dCount",
      header: t("tbl.closed_7d"),
      cell: ({ row }: { row: { original: TechRow } }) => (
        <span style={{ color: "var(--cmms-success)" }}>{row.original.done7dCount} งาน</span>
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
        <p className="cmms-eyebrow">{hero.eyebrow}</p>
        <PageHeader
          title={hero.title}
          description={hero.desc}
          actions={
            <div className="flex items-center gap-3">
              <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                คำนวณจากงานซ่อมจริง
              </span>
              <Button variant="outline" onClick={fetchWorkload} className="gap-2">
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
                {t("action.refresh")}
              </Button>
            </div>
          }
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="cmms-kpi-card blue">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="idle" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ช่างที่มีงาน</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={summary.technicians} />
              <span className="cmms-kpi-unit">คน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card amber">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="warn" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">งานค้างทั้งหมด</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={summary.total_open} />
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card red">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="down" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">เกินกำหนด</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={summary.total_overdue} />
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card red">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="warn" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ด่วน / วิกฤต</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={summary.total_urgent} />
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card green">
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <AndonLamp status="ok" size="sm" />
              <span className="text-sm text-[var(--cmms-text-secondary)]">ปิดงาน 7 วันล่าสุด</span>
            </div>
            <div className="cmms-kpi-value">
              <CountUp end={summary.done_7d} />
              <span className="cmms-kpi-unit">งาน</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg cmms-icon-tile">
              <Users size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            ภาระงานรายช่าง
            <span className="cmms-count-pill">{rows.length} ช่าง</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            pageSize={10}
            getRowId={(row) => row.id}
            emptyTitle="ยังไม่มีข้อมูลภาระงาน"
            emptyDescription="เมื่อมีงานซ่อมที่มอบหมายให้ช่าง จะแสดงภาพรวมที่นี่"
          />
        </CardContent>
      </Card>

      <p className="text-sm text-[var(--cmms-text-muted)]">
        หมายเหตุ: งานเกินกำหนด = ยังไม่ปิดงานและเกินวันกำหนดเสร็จ (estimated_completion_date) — ข้อมูลจากตาราง repair จริง
      </p>
    </div>
  );
}
