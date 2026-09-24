"use client";

import { useMemo, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { apiJson, useApiQuery } from "@/lib/api";
import { Plus, Ruler, Search, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AndonLamp from "@/components/AndonLamp";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";

interface Instrument {
  id: number;
  code: string;
  name: string;
  display_name: string;
  serial_number?: string;
  category?: string;
  department_id?: number | null;
  dept_name?: string | null;
  location_name_join?: string | null;
  measurement_type?: string;
  measurement_parameter?: string;
  condition?: string;
  status?: string;
  cal_status?: string;
  next_calibration_date?: string | null;
  plan?: any;
}

const condLabel: Record<string, string> = {
  good: "ดี",
  fair: "พอใช้",
  poor: "ทรุดโทรม",
  unserviceable: "ใช้ไม่ได้",
};

export default function CalibrationInstrumentsPage() {
  const hero = usePageHero("calibration");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useApiQuery<Instrument[]>(
    ["calibration", "instruments", statusFilter, search ? "s" : "a"],
    `/api/v1/calibration_management.php?resource=instruments&status=${statusFilter === "all" ? "" : statusFilter}&search=${encodeURIComponent(search)}`
  );

  const filtered = useMemo(() => {
    if (!search) return data ?? [];
    const q = search.toLowerCase();
    return (data ?? []).filter((r) =>
      [r.code, r.name, r.serial_number, r.measurement_type]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, search]);

  const columns: SimpleColumn<Instrument>[] = [
    {
      key: "code",
      header: "รหัสเครื่อง",
      renderCell: (r) => (
        <button type="button" className="font-medium text-[var(--cmms-primary-hover)] hover:underline" onClick={() => router.push(`/calibration/instruments/${r.id}`)}>
          {r.code}
        </button>
      ),
    },
    { key: "name", header: "ชื่อเครื่องมือ", renderCell: (r) => <span>{r.name || "-"}</span> },
    {
      key: "measurement",
      header: "ประเภท/พารามิเตอร์",
      renderCell: (r) => (
        <span className="text-sm text-muted-foreground">
          {[r.measurement_type, r.measurement_parameter].filter(Boolean).join(" · ") || "-"}
        </span>
      ),
    },
    {
      key: "condition",
      header: "สภาพ",
      renderCell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <AndonLamp status={r.condition === "good" ? "ok" : r.condition === "fair" ? "warn" : "down"} size="sm" />
          <span className="text-sm">{condLabel[r.condition || "good"] || "ดี"}</span>
        </span>
      ),
    },
    {
      key: "next",
      header: "กำหนดถัดไป",
      renderCell: (r) => <span className="text-sm">{r.next_calibration_date || "-"}</span>,
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (r) => {
        const s = r.cal_status || "RED";
        return (
          <span className="inline-flex items-center gap-1.5">
            <AndonLamp status={s === "GREEN" ? "ok" : s === "AMBER" ? "warn" : "down"} size="sm" />
            <span className="text-sm">{s}</span>
          </span>
        );
      },
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "เครื่องมือวัด" },
      ]}
      title="เครื่องมือวัด (Instrument Master)"
      description="ทะเบียนเครื่องมือวัดและสถานะสอบเทียบ — ข้อมูลมาจาก asset master (asset_registry) เดิมบนระบบ"
      actions={
        <Button variant="primary" onClick={() => router.push("/calibration/plans")}>
          <Plus className="w-4 h-4" />
          เพิ่มแผนสอบเทียบ
        </Button>
      }
    >
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="relative min-w-[240px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input label="ค้นหา" isLabelHidden placeholder="รหัส, ชื่อ, serial..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger className="w-[200px]" aria-label="กรองสถานะ">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              <SelectItem value="RED">RED (เกินกำหนด)</SelectItem>
              <SelectItem value="AMBER">AMBER (ใกล้กำหนด)</SelectItem>
              <SelectItem value="GREEN">GREEN (พร้อมใช้)</SelectItem>
              <SelectItem value="unregistered">ยังไม่ลงทะเบียนสอบเทียบ</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={() => router.push("/calibration/mobile")}>
            <QrCode className="w-4 h-4" />
            สแกน QR
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>รายการเครื่องมือวัด</span>
            {!isLoading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<Instrument>
            columns={columns}
            data={filtered}
            idKey="id"
            loading={isLoading}
            skeletonRows={8}
            pageSize={15}
            caption="รายการเครื่องมือวัด"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ยังไม่มีเครื่องมือวัดในหน้าต่างนี้ (ลองล้างตัวกรอง)"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}