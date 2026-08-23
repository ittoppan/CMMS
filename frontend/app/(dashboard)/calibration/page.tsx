"use client";

import { useState, useMemo, useEffect } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import CountUp from "react-countup";
import {
  Plus,
  Scale,
  Search,
  SquarePen,
  Trash2,
  Clock,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";

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

const statusBadgeVariant: Record<string, "success" | "warning" | "danger"> = {
  completed: "success",
  pending: "warning",
  scheduled: "warning",
  overdue: "danger",
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

  const columns: SimpleColumn<CalibrationRecord>[] = [
    { key: "id", header: t("tbl.instrument_code") },
    { key: "instrument", header: t("tbl.instrument") },
    { key: "calType", header: t("tbl.type") },
    { key: "lastCal", header: t("tbl.last_cal") },
    { key: "dueDate", header: t("tbl.due_date") },
    { key: "certNo", header: t("tbl.cert_no") },
    {
      key: "status",
      header: t("tbl.status"),
      renderCell: (item) => (
        <Badge variant={statusBadgeVariant[item.status] || "warning"}>
          {statusLabel[item.status] || item.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("tbl.actions"),
      align: "right",
      renderCell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/calibration/edit?id=${item.rawId}`)}
            className="gap-1.5"
          >
            <SquarePen className="w-3.5 h-3.5" />
            แก้ไข
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(item.rawId)}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("action.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: hero.title },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        <Button variant="primary" onClick={() => router.push("/calibration/create")}>
          <Plus className="w-4 h-4" />
          เพิ่มเครื่องมือ / แผนสอบเทียบ
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <Scale className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เครื่องมือวัดทั้งหมด</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.total} />
                <span className="cmms-kpi-unit">เครื่อง</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
              <Clock className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">รอดำเนินการ</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.dueSoon} />
                <span className="cmms-kpi-unit">เครื่อง</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
              <TriangleAlert className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เลยกำหนด</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.overdue} />
                <span className="cmms-kpi-unit">เครื่อง</span>
              </div>
            </div>
          </div>
        </Card>
      </Grid>

      {/* Filter card */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[350px]">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              label="ค้นหาเครื่องมือวัด"
              isLabelHidden
              placeholder="ค้นหาชื่อเครื่องมือ, รหัส หรือใบเซอร์..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {loading && (
            <Skeleton className="h-6 w-24 rounded-full" />
          )}
        </CardContent>
      </Card>

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>รายการเครื่องมือวัด</span>
            {!loading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<CalibrationRecord>
            columns={columns}
            data={filtered}
            idKey="id"
            loading={loading}
            skeletonRows={6}
            pageSize={10}
            caption="รายการเครื่องมือวัด"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ไม่มีรายการสอบเทียบ (ลองปรับตัวกรอง)"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
