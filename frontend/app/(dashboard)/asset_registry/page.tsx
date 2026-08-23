"use client";

// asset_registry — migrate ui kit (PageShell, ui/Card, ui/Select, SimpleDataTable, ui/Dialog, Badge, Lucide)
// business logic ครบเดิม: fetch asset_registry.php, delete, filter search/criticality/status

import { useState, useEffect, useMemo } from "react";
import { usePageHero, t, statusText, priorityText } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import {
  Building2,
  Plus,
  Network,
  TriangleAlert,
  CheckCircle2,
  Boxes,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";

interface AssetRecord extends Record<string, unknown> {
  rawId?: number;
  id: string;
  code: string;
  name: string;
  category: string;
  location: string;
  criticality: "A" | "B" | "C";
  status: "running" | "breakdown" | "maintenance" | "standby";
  installationDate: string;
  serialNo: string;
  imageUrl?: string | null;
}

// แปลงสถานะจริงจาก DB (asset_registry.status enum) เป็นค่าที่ UI ใช้
const dbStatusToUi: Record<string, string> = {
  active: "running",
  under_repair: "maintenance",
  inactive: "standby",
  disposed: "standby",
};

const statusMap: Record<string, { label: string }> = {
  running: { label: "กำลังทำงานปกติ" },
  breakdown: { label: "เครื่องเสีย" },
  maintenance: { label: "กำลังทำซ่อมบำรุง" },
  standby: { label: "พร้อมใช้งาน" },
};

// สถานะ → Badge variant (docs/DESIGN_SYSTEM.md §2.3)
const statusBadgeVariant: Record<string, "success" | "danger" | "warning" | "info"> = {
  running: "success",
  breakdown: "danger",
  maintenance: "warning",
  standby: "info",
};

const criticalityBadgeVariant: Record<string, "danger" | "warning" | "neutral"> = {
  A: "danger",
  B: "warning",
  C: "neutral",
};

const PAGE_SIZE = 10;

export default function AssetRegistryPage() {
  const hero = usePageHero("asset_registry");
  const router = useRouter();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [search, setSearch] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [deleteTarget, setDeleteTarget] = useState<AssetRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [error, setError] = useState("");

  const fetchAssets = () => {
    setError("");
    fetch("/api/v1/asset_registry.php")
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json)) {
          const fetched: AssetRecord[] = json.map((row: any) => ({
            rawId: row.id,
            id: String(row.id),
            code: row.code || `MC-${row.id}`,
            name: row.name || "เครื่องจักรทั่วไป",
            category: row.category || "-",
            location: row.location || "-",
            criticality: (row.criticality || "B") as "A" | "B" | "C",
            status: (dbStatusToUi[row.status] || row.status || "running") as any,
            installationDate: row.purchase_date || row.created_at?.slice(0, 10) || "-",
            serialNo: row.serial_number || "-",
            imageUrl: row.image_path || null,
          }));
          setAssets(fetched);
        }
      })
      .catch(e => {
        console.error("Fetch MySQL assets error:", e);
        setError("Failed to fetch assets. Please try again.");
      });
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const targetId = deleteTarget.rawId || deleteTarget.id;
      const res = await fetch(`/api/v1/asset_registry.php?id=${targetId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success || json.message === "Deleted") {
        setAssets(prev => prev.filter(a => a.id !== deleteTarget.id));
        setDeleteSuccess(true);
        setTimeout(() => {
          setDeleteSuccess(false);
          setDeleteTarget(null);
        }, 1500);
      }
    } catch (e) {
      console.error("Delete asset error", e);
      setError("Failed to delete asset.");
    } finally {
      setDeleting(false);
    }
  };

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.serialNo.toLowerCase().includes(q);
      const matchCrit = criticalityFilter === "all" || a.criticality === criticalityFilter;
      const matchStatus = statusFilter === "all" || a.status === statusFilter;
      return matchSearch && matchCrit && matchStatus;
    });
  }, [search, criticalityFilter, statusFilter, assets]);

  // ตัวกรองเปลี่ยน → remount table (reset sorting/pagination)
  const tableKey = `${search}|${criticalityFilter}|${statusFilter}`;

  const columns: SimpleColumn<AssetRecord>[] = [
    {
      key: "image",
      header: t("tbl.image"),
      renderCell: (item) => {
        const raw = item.imageUrl;
        if (!raw) {
          return (
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--cmms-bg-muted)] text-base text-[var(--cmms-text-muted)]">
              —
            </div>
          );
        }
        const cleaned = String(raw).replace(/\\/g, "/");
        const src = cleaned.startsWith("data:") || cleaned.startsWith("/") || cleaned.startsWith("http") ? cleaned : "/" + cleaned;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={item.name}
            className="h-10 w-10 rounded-md border border-border object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        );
      },
    },
    {
      key: "code",
      header: t("tbl.asset_code_serial"),
      renderCell: (item) => (
        <div className="flex flex-col">
          <span className="font-semibold">{item.code}</span>
          <span className="text-xs text-muted-foreground">S/N: {item.serialNo}</span>
        </div>
      ),
    },
    {
      key: "name",
      header: t("tbl.asset_location"),
      renderCell: (item) => (
        <div className="flex flex-col">
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-muted-foreground">หมวดหมู่: {item.category} · {item.location}</span>
        </div>
      ),
    },
    {
      key: "criticality",
      header: t("tbl.criticality"),
      renderCell: (item) => (
        <Badge variant={criticalityBadgeVariant[item.criticality] || "neutral"}>
          เกรด {item.criticality}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("tbl.asset_status"),
      renderCell: (item) => {
        const label = statusMap[item.status]?.label || item.status;
        return (
          <Badge variant={statusBadgeVariant[item.status] || "info"}>
            {label}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: t("tbl.actions"),
      align: "right",
      renderCell: (item) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="ผัง BOM"
            title="ผัง BOM"
            onClick={() => router.push(`/asset_registry/bom_tree?code=${item.code}`)}
          >
            <Network size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="แก้ไข"
            title="แก้ไข"
            onClick={() => router.push(`/asset_registry/edit?id=${item.rawId || item.id}`)}
          >
            <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-[var(--cmms-danger-light)] hover:text-[var(--cmms-danger-dark)]"
            aria-label={t("action.delete")}
            title={t("action.delete")}
            onClick={() => setDeleteTarget(item)}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  const kpiIconChip = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg";

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: hero.title }]}
      title={hero.title}
      description={hero.desc}
      actions={
        <>
          <Button variant="secondary" onClick={() => router.push("/asset_registry/criticality")}>
            <Network size={16} strokeWidth={1.75} aria-hidden="true" />
            วิเคราะห์ความสำคัญ
          </Button>
          <Button onClick={() => router.push("/asset_registry/create")}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            เพิ่มเครื่องจักรใหม่
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
      )}

      {/* KPI */}
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary)" }}>
              <Building2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เครื่องจักรทั้งหมด</p>
              <h2 className="text-xl font-semibold tabular-nums">{assets.length} <span className="text-sm font-normal">เครื่อง</span></h2>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success)" }} className={kpiIconChip}>
              <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เดินเครื่องปกติ</p>
              <h2 className="text-xl font-semibold tabular-nums">{assets.filter(a => a.status === "running").length} <span className="text-sm font-normal">เครื่อง</span></h2>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger)" }} className={kpiIconChip}>
              <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เครื่องเสีย</p>
              <h2 className="text-xl font-semibold tabular-nums">{assets.filter(a => a.status === "breakdown").length} <span className="text-sm font-normal">เครื่อง</span></h2>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning)" }} className={kpiIconChip}>
              <Boxes size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เครื่องจักรคลาส A (วิกฤต)</p>
              <h2 className="text-xl font-semibold tabular-nums">{assets.filter(a => a.criticality === "A").length} <span className="text-sm font-normal">เครื่อง</span></h2>
            </div>
          </CardContent>
        </Card>
      </Grid>

      {/* Filter toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
            <Input
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหารหัส, ชื่อเครื่องจักร, Serial No..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={criticalityFilter} onValueChange={setCriticalityFilter}>
            <SelectTrigger aria-label="ระดับความสำคัญ" className="w-full sm:w-[200px]">
              <SelectValue placeholder="ทุกระดับความสำคัญ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกระดับความสำคัญ</SelectItem>
              <SelectItem value="A">ระดับ A</SelectItem>
              <SelectItem value="B">ระดับ B</SelectItem>
              <SelectItem value="C">ระดับ C</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="สถานะ" className="w-full sm:w-[210px]">
              <SelectValue placeholder="ทุกสถานะการทำงาน" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะการทำงาน</SelectItem>
              <SelectItem value="running">กำลังทำงานปกติ</SelectItem>
              <SelectItem value="breakdown">เครื่องเสีย</SelectItem>
              <SelectItem value="maintenance">กำลังทำซ่อมบำรุง</SelectItem>
              <SelectItem value="standby">พร้อมใช้งาน</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <SimpleDataTable<AssetRecord>
          key={tableKey}
          columns={columns}
          data={filteredAssets}
          getRowId={(r) => r.id}
          pageSize={PAGE_SIZE}
          emptyTitle="ไม่มีข้อมูล"
          emptyDescription="ไม่พบเครื่องจักรในระบบ (ลองปรับตัวกรอง)"
        />
      </Card>

      {/* Delete Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="ยืนยันการลบข้อมูลเครื่องจักร"
      >
        {deleteTarget && (
          <div className="space-y-4">
            {deleteSuccess ? (
              <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--cmms-success)" }}>
                <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
                ลบข้อมูลเครื่องจักรสำเร็จแล้ว
              </p>
            ) : (
              <>
                <p className="text-sm">
                  คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลเครื่องจักร <strong>&quot;{deleteTarget.code} - {deleteTarget.name}&quot;</strong> ออกจากระบบ?
                </p>
                <p className="text-sm text-muted-foreground">
                  การลบนี้จะทำการลบข้อมูลจาก MySQL Database และไม่สามารถย้อนคืนได้
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                    ยกเลิก
                  </Button>
                  <Button variant="danger" disabled={deleting} onClick={handleDelete}>
                    {deleting ? "กำลังลบ..." : "ลบเครื่องจักร"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </PageShell>
  );
}
