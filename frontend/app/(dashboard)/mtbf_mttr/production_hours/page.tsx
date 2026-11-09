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
  Search,
  SquarePen,
  Trash2,
  Hourglass,
  Boxes,
  Clock,
} from "lucide-react";

interface ProductionHourRecord extends Record<string, unknown> {
  rawId: number;
  id: string;
  assetName: string;
  recordDate: string;
  hours: number;
  shift: string;
  notes: string;
}

export default function ProductionHoursPage() {
  const hero = usePageHero("production_hours");
  const router = useRouter();
  const [data, setData] = useState<ProductionHourRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/production_hours.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `PH-${String(row.id).padStart(3, "0")}`,
          assetName: `${row.asset_code ? row.asset_code + " - " : ""}${row.asset_name || "ไม่ระบุ"}`,
          recordDate: row.record_date || "",
          hours: Number(row.hours || 0),
          shift: row.shift || "-",
          notes: row.notes || "-",
        }));
        setData(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch production hours", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("ยืนยันการลบบันทึกชั่วโมงการผลิตนี้?")) return;
    try {
      await fetch(`/api/v1/production_hours.php?id=${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      console.error("Failed to delete production hours", e);
    }
  };

  const stats = useMemo(() => {
    const totalHours = data.reduce((sum, d) => sum + d.hours, 0);
    const assets = new Set(data.map((d) => d.assetName));
    return {
      total: data.length,
      totalHours: totalHours.toFixed(1),
      assetCount: assets.size,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.assetName.toLowerCase().includes(q) ||
        s.recordDate.toLowerCase().includes(q)
    );
  }, [search, data]);

  const columns: SimpleColumn<ProductionHourRecord>[] = [
    { key: "id", header: t("tbl.code") },
    { key: "assetName", header: t("tbl.asset_full") },
    { key: "recordDate", header: "วันที่" },
    {
      key: "hours",
      header: "ชั่วโมง",
      align: "right",
      renderCell: (item) => (
        <span className="tabular-nums font-semibold">{item.hours.toFixed(1)}</span>
      ),
    },
    {
      key: "shift",
      header: "กะ",
      renderCell: (item) => <Badge variant="neutral">{item.shift}</Badge>,
    },
    {
      key: "notes",
      header: "หมายเหตุ",
      renderCell: (item) => (
        <span className="text-muted-foreground">{item.notes}</span>
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
            onClick={() => router.push(`/mtbf_mttr/production_hours/edit?id=${item.rawId}`)}
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
        <Button variant="primary" onClick={() => router.push("/mtbf_mttr/production_hours/create")}>
          <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          บันทึกชั่วโมงการผลิต
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <Hourglass className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ชั่วโมงรวม</p>
              <div className="cmms-kpi-value tabular-nums">
                {stats.totalHours}
                <span className="cmms-kpi-unit">ชั่วโมง</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
              <Boxes className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เครื่องจักรที่มีบันทึก</p>
              <div className="cmms-kpi-value tabular-nums">
                {stats.assetCount}
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
              <p className="text-sm text-muted-foreground">จำนวนรายการ</p>
              <div className="cmms-kpi-value tabular-nums">
                {stats.total}
                <span className="cmms-kpi-unit">รายการ</span>
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
              placeholder="ค้นหาเครื่องจักร, รหัส หรือวันที่..."
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
            <Hourglass className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>บันทึกชั่วโมงการผลิต</span>
            {!loading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<ProductionHourRecord>
            columns={columns}
            data={filtered}
            idKey="id"
            loading={loading}
            skeletonRows={6}
            pageSize={10}
            caption="บันทึกชั่วโมงการผลิตของเครื่องจักร"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ยังไม่มีบันทึกชั่วโมงการผลิต (ลองปรับตัวกรอง)"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
