"use client";

import { useState, useMemo, useEffect } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";
import {
  Plus,
  BarChart3,
  Zap,
  Clock,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";

interface MtbfRecord extends Record<string, unknown> {
  rawId: number;
  id: string;
  assetName: string;
  period: string;
  operatingHours: number;
  totalFailures: number;
  totalDowntime: number;
  mtbfHours: number;
  mttrMinutes: number;
}

const MONTHS_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default function MtbfMttrPage() {
  const hero = usePageHero("mtbf_mttr");
  const router = useRouter();
  const [data, setData] = useState<MtbfRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/mtbf_mttr.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `MTBF-${String(row.id).padStart(3, '0')}`,
          assetName: row.asset_name || "ไม่ระบุ",
          period: `${row.year} / ${MONTHS_TH[row.month] || row.month}`,
          operatingHours: Number(row.operating_hours || 0),
          totalFailures: Number(row.total_failures || 0),
          totalDowntime: Number(row.total_downtime_minutes || 0),
          mtbfHours: Number(row.mtbf_hours || 0),
          mttrMinutes: Number(row.mttr_minutes || 0),
        }));
        setData(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch MTBF/MTTR", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this MTBF/MTTR record?")) return;
    try {
      await fetch(`/api/v1/mtbf_mttr.php?id=${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      console.error("Failed to delete MTBF/MTTR", e);
    }
  };

  const stats = useMemo(() => {
    const avgMtbf = data.length
      ? data.reduce((sum, d) => sum + d.mtbfHours, 0) / data.length
      : 0;
    const avgMttr = data.length
      ? data.reduce((sum, d) => sum + d.mttrMinutes, 0) / data.length
      : 0;
    return {
      total: data.length,
      avgMtbf: avgMtbf.toFixed(1),
      avgMttr: avgMttr.toFixed(0),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.assetName.toLowerCase().includes(q) ||
        s.period.toLowerCase().includes(q)
    );
  }, [search, data]);

  const columns: SimpleColumn<MtbfRecord>[] = [
    { key: "id", header: t("tbl.code") },
    { key: "assetName", header: t("tbl.asset_full") },
    { key: "period", header: t("tbl.period") },
    {
      key: "mtbfHours",
      header: t("tbl.mtbf_h"),
      align: "right",
      renderCell: (item) => (
        <span className="tabular-nums font-semibold">{item.mtbfHours.toFixed(1)}</span>
      ),
    },
    {
      key: "mttrMinutes",
      header: t("tbl.mttr_min"),
      align: "right",
      renderCell: (item) => (
        <span className="tabular-nums">{item.mttrMinutes.toFixed(0)}</span>
      ),
    },
    {
      key: "totalFailures",
      header: t("tbl.failure_count"),
      renderCell: (item) => (
        <Badge variant="neutral">{item.totalFailures} ครั้ง</Badge>
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
            onClick={() => router.push(`/mtbf_mttr/edit?id=${item.rawId}`)}
            className="gap-1.5"
          >
            <SquarePen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            แก้ไข
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(item.rawId)}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
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
        { label: "MTBF/MTTR", href: "/mtbf_mttr" },
        { label: hero.title },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        <Button variant="primary" onClick={() => router.push("/mtbf_mttr/create")}>
          <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          บันทึกข้อมูล MTBF/MTTR
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <BarChart3 className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">จำนวนบันทึกทั้งหมด</p>
              <div className="cmms-kpi-value tabular-nums">
                {stats.total}
                <span className="cmms-kpi-unit">รายการ</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
              <Zap className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ค่าเฉลี่ย MTBF</p>
              <div className="cmms-kpi-value tabular-nums">
                {stats.avgMtbf}
                <span className="cmms-kpi-unit">ชั่วโมง</span>
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
              <p className="text-sm text-muted-foreground">ค่าเฉลี่ย MTTR</p>
              <div className="cmms-kpi-value tabular-nums">
                {stats.avgMttr}
                <span className="cmms-kpi-unit">นาที</span>
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
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาเครื่องจักร, รหัส หรือรอบเดือน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>ข้อมูล MTBF/MTTR</span>
            {!loading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<MtbfRecord>
            columns={columns}
            data={filtered}
            idKey="id"
            loading={loading}
            skeletonRows={6}
            pageSize={10}
            caption="ข้อมูลดัชนีชี้วัด MTBF/MTTR"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ไม่มีบันทึก MTBF/MTTR (ลองปรับตัวกรอง)"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
