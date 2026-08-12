"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
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
  QrCodeIcon,
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

const statusMap: Record<string, { label: string; variant: "success" | "error" | "warning" | "accent" }> = {
  running: { label: "กำลังทำงานปกติ", variant: "success" },
  breakdown: { label: "เครื่องเสีย", variant: "error" },
  maintenance: { label: "กำลังทำซ่อมบำรุง", variant: "warning" },
  standby: { label: "พร้อมใช้งาน", variant: "accent" },
};

const PAGE_SIZE = 10;

export default function AssetRegistryPage() {
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
              🏭
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
        <Badge 
          label={`เกรด ${item.criticality}`} 
          variant={item.criticality === 'A' ? 'error' : item.criticality === 'B' ? 'warning' : 'neutral'} 
        />
      ),
    },
    {
      key: "status",
      header: "สถานะเครื่องจักร",
      width: proportional(1.8),
      renderCell: (item) => {
        const info = statusMap[item.status] || { label: item.status, variant: "accent" };
        return <Badge label={info.label} variant={info.variant} />;
      },
    },
    {
      key: "actions",
      header: "การจัดการ",
      width: proportional(2.5),
      renderCell: (item) => (
        <HStack gap={1}>
          <Button 
            label="ผัง BOM" 
            variant="secondary" 
            size="sm" 
            icon={<Icon icon={RectangleGroupIcon} size="sm" />}
            onClick={() => router.push(`/asset_registry/bom_tree?code=${item.code}`)} 
          />
          <Button 
            label="แก้ไข" 
            variant="secondary" 
            size="sm" 
            icon={<Icon icon={PencilSquareIcon} size="sm" />}
            onClick={() => router.push(`/asset_registry/edit?id=${item.rawId || item.id}`)} 
          />
          <Button 
            label="ลบ" 
            variant="secondary" 
            size="sm" 
            icon={<Icon icon={TrashIcon} size="sm" />}
            onClick={() => setDeleteTarget(item)} 
          />
        </HStack>
      )
    }
  ];

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ทะเบียนเครื่องจักรและทรัพย์สิน (Asset Registry F-EN-01)</Heading>
            <Badge label="แบบฟอร์มมาตรฐาน ISO" variant="info" />
          </HStack>
          <Text type="body" color="secondary">ฐานข้อมูลเครื่องจักร อุปกรณ์ และสายการผลิตทั้งหมดของโรงงาน TOPPAN</Text>
        </VStack>
        <HStack gap={3}>
          <Button label="วิเคราะห์ความสำคัญเครื่องจักร" variant="secondary" onClick={() => router.push('/asset_registry/criticality')} />
          <Button label="เพิ่มเครื่องจักรใหม่" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => router.push('/asset_registry/create')} />
        </HStack>
      </HStack>

      {error && (
        <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />
      )}

      <Grid columns={4} gap={4}>
        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-primary)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">เครื่องจักรทั้งหมด</Text>
            <Heading level={3}>{assets.length} <span style={{ fontSize: 14 }}>เครื่อง</span></Heading>
          </VStack>
        </Card>

        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-success)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">เดินเครื่องปกติ</Text>
            <Heading level={3}>{assets.filter(a => a.status === 'running').length} <span style={{ fontSize: 14 }}>เครื่อง</span></Heading>
          </VStack>
        </Card>

        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-danger)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">เครื่องเสีย</Text>
            <Heading level={3}>{assets.filter(a => a.status === 'breakdown').length} <span style={{ fontSize: 14 }}>เครื่อง</span></Heading>
          </VStack>
        </Card>

        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-warning)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">เครื่องจักรคลาส A (วิกฤต)</Text>
            <Heading level={3}>{assets.filter(a => a.criticality === 'A').length} <span style={{ fontSize: 14 }}>เครื่อง</span></Heading>
          </VStack>
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
          <EmptyState title="ไม่มีข้อมูล" description="ไม่พบเครื่องจักรในระบบ" icon={<Icon icon={WrenchScrewdriverIcon} size="lg" />} />
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
                <Icon icon={CheckCircleIcon} size="md" />
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
                  <Button
                    label="ยกเลิก"
                    variant="secondary"
                    onClick={() => setDeleteTarget(null)}
                  />
                  <Button
                    label="ลบเครื่องจักร"
                    variant="destructive"
                    isLoading={deleting}
                    onClick={handleDelete}
                  />
                </HStack>
              </>
            )}
          </VStack>
        </Dialog>
      )}
    </VStack>
  );
}
