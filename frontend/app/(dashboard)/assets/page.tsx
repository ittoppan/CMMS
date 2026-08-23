"use client";

// assets — migrate ui kit (PageShell, ui/Card, ui/Select, SimpleDataTable, Lucide)
// business logic ครบเดิม: fetch index.php?resource=assets, filter search/dept/status

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import CountUp from "react-countup";
import {
  Plus,
  Search,
  Building2,
  CheckCircle2,
  Wrench,
  Clock,
} from "lucide-react";

interface Asset extends Record<string, unknown> {
  code: string;
  name: string;
  department: string;
  status: "operational" | "under-repair" | "decommissioned" | "standby";
  location: string;
  lastPM: string;
}

// แปลงสถานะจริงจาก DB (asset_registry.status) เป็นค่าที่ UI ใช้
const dbStatusToUi: Record<string, Asset["status"]> = {
  active: "operational",
  under_repair: "under-repair",
  inactive: "standby",
  disposed: "decommissioned",
};

const statusLabelMap: Record<string, string> = {
  operational: "พร้อมใช้งาน",
  standby: "สแตนด์บาย",
  "under-repair": "กำลังซ่อม",
  decommissioned: "เลิกใช้งาน",
};

// สถานะ → Badge variant (docs/DESIGN_SYSTEM.md §2.3)
const statusBadgeVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  operational: "success",
  standby: "warning",
  "under-repair": "danger",
  decommissioned: "neutral",
};

const departmentLabelMap: Record<string, string> = {
  Production: "ฝ่ายผลิต",
  Utilities: "สาธารณูปโภค",
  Fabrication: "งานผลิตชิ้นส่วน",
  Facility: "อาคารสถานที่",
  Logistics: "ลอจิสติกส์",
};

const departments = [
  { value: "All", label: "ทั้งหมด" },
  { value: "Production", label: "ฝ่ายผลิต" },
  { value: "Utilities", label: "สาธารณูปโภค" },
  { value: "Fabrication", label: "งานผลิตชิ้นส่วน" },
  { value: "Facility", label: "อาคารสถานที่" },
  { value: "Logistics", label: "ลอจิสติกส์" },
];
const statuses = ["All", "operational", "standby", "under-repair", "decommissioned"];

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/index.php?resource=assets");
      const json = await res.json();
      if (json.status === "success" && json.data) {
        const fetched = json.data.map((row: any) => ({
          code: row.code || `AST-${row.id}`,
          name: row.name || "ไม่ระบุ",
          department: row.department || row.category || "-",
          status: dbStatusToUi[row.status] || (row.status as Asset["status"]) || "operational",
          location: row.location || "-",
          lastPM: row.last_pm || "-"
        }));
        setAssets(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch assets", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const kpiData = useMemo(() => {
    return {
      total: assets.length,
      operational: assets.filter(a => a.status === 'operational').length,
      underRepair: assets.filter(a => a.status === 'under-repair').length,
      standby: assets.filter(a => a.status === 'standby').length,
    };
  }, [assets]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
      const matchDept = deptFilter === "All" || a.department === deptFilter;
      const matchStatus = statusFilter === "All" || a.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [search, deptFilter, statusFilter, assets]);

  // ตัวกรองเปลี่ยน → remount table (reset sorting/pagination)
  const tableKey = `${search}|${deptFilter}|${statusFilter}`;

  const columns: SimpleColumn<Asset>[] = [
    {
      key: "code",
      header: "รหัสเครื่องจักร",
      renderCell: (item: Asset) => (
        <Link href={`/assets/${item.code}`} className="font-medium text-primary hover:underline">{item.code}</Link>
      ),
    },
    { key: "name", header: "ชื่อเครื่องจักร" },
    {
      key: "department",
      header: "แผนก",
      renderCell: (item: Asset) => departmentLabelMap[item.department] || item.department,
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (item: Asset) => (
        <Badge variant={statusBadgeVariant[item.status] || "neutral"}>
          {statusLabelMap[item.status] || item.status}
        </Badge>
      ),
    },
    { key: "location", header: "สถานที่ติดตั้ง" },
    { key: "lastPM", header: "วัน PM ล่าสุด" },
  ];

  const kpiIconChip = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg";

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">ASSETS · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: "ทะเบียนเครื่องจักรและทรัพย์สิน" }]}
      title="ทะเบียนเครื่องจักรและทรัพย์สิน"
      description="ระบบทะเบียนประวัติเครื่องจักรและอุปกรณ์ — ดูสถานะและวัน PM ล่าสุดได้ในที่เดียว"
      actions={
        <Button onClick={() => (window.location.href = "/assets/create")}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          เพิ่มเครื่องจักร
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary)" }}>
              <Building2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เครื่องจักรทั้งหมด</p>
              <h2 className="text-xl font-semibold tabular-nums"><CountUp end={kpiData.total} /> <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success)" }}>
              <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">พร้อมใช้งาน</p>
              <h2 className="text-xl font-semibold tabular-nums"><CountUp end={kpiData.operational} /> <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger)" }}>
              <Wrench size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">กำลังซ่อม</p>
              <h2 className="text-xl font-semibold tabular-nums"><CountUp end={kpiData.underRepair} /> <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning)" }}>
              <Clock size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">สแตนด์บาย</p>
              <h2 className="text-xl font-semibold tabular-nums"><CountUp end={kpiData.standby} /> <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
      </Grid>

      {/* Filter + table */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[280px] flex-1">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาด้วยรหัส ชื่อ หรือสถานที่..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger aria-label="แผนก" className="w-full sm:w-[180px]">
                <SelectValue placeholder="แผนกทั้งหมด" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="สถานะ" className="w-full sm:w-[180px]">
                <SelectValue placeholder="สถานะทั้งหมด" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{s === "All" ? "ทั้งหมด" : statusLabelMap[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!loading && filtered.length === 0 ? (
            <EmptyState
              title="ไม่พบเครื่องจักร"
              description="ลองเปลี่ยนตัวกรอง หรือเพิ่มเครื่องจักรใหม่ในระบบ"
            />
          ) : (
            <SimpleDataTable<Asset>
              key={tableKey}
              columns={columns}
              data={filtered}
              loading={loading}
              getRowId={(r) => r.code}
              pageSize={10}
              emptyTitle="ไม่พบเครื่องจักร"
              emptyDescription="ลองเปลี่ยนตัวกรอง หรือเพิ่มเครื่องจักรใหม่ในระบบ"
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
