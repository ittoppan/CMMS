"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Table, proportional, useTablePagination } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { 
  BuildingOffice2Icon,
  PlusIcon,
  RectangleGroupIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  PencilSquareIcon,
  TrashIcon
} from "@heroicons/react/24/outline";

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

const statusChipStyle: Record<string, React.CSSProperties> = {
  running: { background: "rgba(16,185,129,0.12)", color: "var(--cmms-success)" },
  breakdown: { background: "rgba(244,63,94,0.12)", color: "var(--cmms-danger)" },
  maintenance: { background: "rgba(245,158,11,0.12)", color: "var(--cmms-warning)" },
  standby: { background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)" },
};

const criticalityChipStyle: Record<string, React.CSSProperties> = {
  A: { background: "rgba(244,63,94,0.12)", color: "var(--cmms-danger)" },
  B: { background: "rgba(245,158,11,0.12)", color: "var(--cmms-warning)" },
  C: { background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)" },
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

  const [page, setPage] = useState(1);

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.serialNo.toLowerCase().includes(q);
      const matchCrit = criticalityFilter === "all" || a.criticality === criticalityFilter;
      const matchStatus = statusFilter === "all" || a.status === statusFilter;
      return matchSearch && matchCrit && matchStatus;
    });
  }, [search, criticalityFilter, statusFilter, assets]);

  const totalItems = filteredAssets.length;
  const paged = filteredAssets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pagination = useTablePagination<AssetRecord>({ page, onPageChange: setPage, totalItems, pageSize: PAGE_SIZE });

  const columns: TableColumn<AssetRecord>[] = [
    {
      key: "image",
      header: "รูป",
      width: proportional(0.7),
      renderCell: (item) => {
        const raw = item.imageUrl;
        if (!raw) {
          return (
            <div style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: "var(--cmms-bg-muted)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cmms-text-muted)", fontSize: 16 }}>
              —
            </div>
          );
        }
        const cleaned = String(raw).replace(/\\/g, "/");
        const src = cleaned.startsWith("data:") || cleaned.startsWith("/") || cleaned.startsWith("http") ? cleaned : "/" + cleaned;
        return (
          <img
            src={src}
            alt={item.name}
            style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", border: "1px solid var(--cmms-border)" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        );
      },
    },
    { 
      key: "code", 
      header: "รหัสเครื่องจักร / Serial No.", 
      width: proportional(2),
      renderCell: (item) => (
        <VStack gap={0}>
          <Text type="body" weight="bold">{item.code}</Text>
          <Text type="body" size="sm" color="secondary">S/N: {item.serialNo}</Text>
        </VStack>
      )
    },
    {
      key: "name",
      header: "ชื่อเครื่องจักร / ตำแหน่งติดตั้ง",
      width: proportional(3),
      renderCell: (item) => (
        <VStack gap={0}>
          <Text type="body" weight="semibold">{item.name}</Text>
          <Text type="body" size="sm" color="secondary">หมวดหมู่: {item.category} · {item.location}</Text>
        </VStack>
      ),
    },
    {
      key: "criticality",
      header: "ระดับความสำคัญ",
      width: proportional(1.2),
      renderCell: (item) => (
        <span className="cmms-andon-chip" style={criticalityChipStyle[item.criticality] || criticalityChipStyle.C}>
          เกรด {item.criticality}
        </span>
      ),
    },
    {
      key: "status",
      header: "สถานะเครื่องจักร",
      width: proportional(1.8),
      renderCell: (item) => {
        const label = statusMap[item.status]?.label || item.status;
        return (
          <span className="cmms-andon-chip" style={statusChipStyle[item.status] || statusChipStyle.standby}>
            {label}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "การจัดการ",
      width: proportional(2.5),
      renderCell: (item) => (
        <HStack gap={1} wrap="wrap">
          <button
            type="button"
            onClick={() => router.push(`/asset_registry/bom_tree?code=${item.code}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            <RectangleGroupIcon className="w-3.5 h-3.5" />
            ผัง BOM
          </button>
          <button
            type="button"
            onClick={() => router.push(`/asset_registry/edit?id=${item.rawId || item.id}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            <PencilSquareIcon className="w-3.5 h-3.5" />
            แก้ไข
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(item)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            ลบ
          </button>
        </HStack>
      )
    }
  ];

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <BuildingOffice2Icon className="w-3.5 h-3.5" /> ทะเบียน {assets.length} เครื่อง
            </span>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              แบบฟอร์มมาตรฐาน ISO
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <button
            type="button"
            onClick={() => router.push("/asset_registry/criticality")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            <RectangleGroupIcon className="w-4 h-4" />
            วิเคราะห์ความสำคัญ
          </button>
          <button
            type="button"
            onClick={() => router.push("/asset_registry/create")}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
          >
            <PlusIcon className="w-4 h-4" />
            เพิ่มเครื่องจักรใหม่
          </button>
        </HStack>
      </div>

      {error && (
        <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />
      )}

      <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile">
              <BuildingOffice2Icon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เครื่องจักรทั้งหมด</Text>
              <Heading level={2} className="cmms-kpi-value">{assets.length} <Text type="body" size="sm">เครื่อง</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile green">
              <CheckCircleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เดินเครื่องปกติ</Text>
              <Heading level={2} className="cmms-kpi-value">{assets.filter(a => a.status === "running").length} <Text type="body" size="sm">เครื่อง</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile red">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เครื่องเสีย</Text>
              <Heading level={2} className="cmms-kpi-value">{assets.filter(a => a.status === "breakdown").length} <Text type="body" size="sm">เครื่อง</Text></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile amber">
              <RectangleGroupIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">เครื่องจักรคลาส A (วิกฤต)</Text>
              <Heading level={2} className="cmms-kpi-value">{assets.filter(a => a.criticality === "A").length} <Text type="body" size="sm">เครื่อง</Text></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Toolbar
        label="ตัวกรองเครื่องจักร"
        startContent={
          <>
            <TextInput
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหารหัส, ชื่อเครื่องจักร, Serial No..."
              startIcon={WrenchScrewdriverIcon}
              value={search}
              onChange={setSearch}
            />
            <Selector
              label="ระดับความสำคัญ"
              isLabelHidden
              placeholder="ทุกระดับความสำคัญ"
              value={criticalityFilter}
              onChange={setCriticalityFilter}
              options={[
                { value: "all", label: "ทุกระดับความสำคัญ" },
                { value: "A", label: "ระดับ A" },
                { value: "B", label: "ระดับ B" },
                { value: "C", label: "ระดับ C" },
              ]}
            />
            <Selector
              label="สถานะ"
              isLabelHidden
              placeholder="ทุกสถานะการทำงาน"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "ทุกสถานะการทำงาน" },
                { value: "running", label: "กำลังทำงานปกติ" },
                { value: "breakdown", label: "เครื่องเสีย" },
                { value: "maintenance", label: "กำลังทำซ่อมบำรุง" },
                { value: "standby", label: "พร้อมใช้งาน" },
              ]}
            />
          </>
        }
      />

      <Card padding={0} style={{ overflowX: 'auto' }}>
        {paged.length === 0 ? (
          <EmptyState title="ไม่มีข้อมูล" description="ไม่พบเครื่องจักรในระบบ" icon={<WrenchScrewdriverIcon className="w-6 h-6" />} />
        ) : (
          <Table<AssetRecord>
            data={paged}
            columns={columns}
            idKey="id"
            density="balanced"
            dividers="rows"
            hasHover
            plugins={{ pagination }}
          />
        )}
      </Card>

      {/* Delete Dialog */}
      {deleteTarget && (
        <Dialog isOpen={true} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>
          <DialogHeader title="ยืนยันการลบข้อมูลเครื่องจักร" onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)} />
          <VStack gap={4} style={{ padding: 24 }}>
            {deleteSuccess ? (
              <HStack gap={2} vAlign="center" style={{ color: "var(--cmms-success)" }}>
                <CheckCircleIcon className="w-5 h-5" />
                <Text type="body" weight="bold">ลบข้อมูลเครื่องจักรสำเร็จแล้ว</Text>
              </HStack>
            ) : (
              <>
                <Text type="body">
                  คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลเครื่องจักร <strong>"{deleteTarget.code} - {deleteTarget.name}"</strong> ออกจากระบบ?
                </Text>
                <Text type="body" size="sm" color="secondary">
                  การลบนี้จะทำการลบข้อมูลจาก MySQL Database และไม่สามารถย้อนคืนได้
                </Text>
                <HStack hAlign="end" gap={2} style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-danger"
                  >
                    {deleting ? "กำลังลบ..." : "ลบเครื่องจักร"}
                  </button>
                </HStack>
              </>
            )}
          </VStack>
        </Dialog>
      )}
    </VStack>
  );
}
