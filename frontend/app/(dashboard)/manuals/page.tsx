"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";
import {
  FileText,
  FileDown,
  SquarePen,
  Trash2,
  BookOpen,
  Plus,
  Search,
} from "lucide-react";

interface ManualRecord extends Record<string, unknown> {
  rawId: number;
  id: string;
  title: string;
  description: string;
  assetName: string;
  version: string;
  fileType: string;
  filePath: string;
}

export default function ManualsPage() {
  const router = useRouter();
  const [data, setData] = useState<ManualRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchManuals = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manuals.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => {
          return {
            rawId: row.id,
            id: `MAN-${String(row.id).padStart(3, '0')}`,
            title: row.title || "-",
            description: row.description || "-",
            assetName: row.asset_name || "ทั่วไป (General)",
            version: row.version || "1.0",
            fileType: row.file_type || "pdf",
            filePath: row.file_path || "",
          };
        });
        setData(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch manuals", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchManuals(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this manual?")) return;
    try {
      await fetch(`/api/v1/manuals.php?id=${id}`, { method: "DELETE" });
      fetchManuals();
    } catch (e) {
      console.error("Failed to delete manual", e);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.assetName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [search, data]);

  const columns: SimpleColumn<ManualRecord>[] = [
    { key: "id", header: "รหัสเอกสาร" },
    {
      key: "title",
      header: "ชื่อเอกสาร (Title)",
      renderCell: (item) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="truncate text-xs text-muted-foreground">{item.description}</p>
          </div>
        </div>
      ),
    },
    { key: "assetName", header: "เครื่องจักร/อุปกรณ์" },
    { key: "version", header: "เวอร์ชัน" },
    {
      key: "fileType",
      header: "ประเภท",
      renderCell: (item) => (
        <Badge variant="neutral">{item.fileType.toUpperCase()}</Badge>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      renderCell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          {item.filePath ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                window.open(item.filePath, '_blank');
              }}
              className="gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
              ดาวน์โหลด
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/manuals/edit?id=${item.rawId}`)}
              className="gap-1.5"
            >
              <SquarePen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
              แก้ไข
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item.rawId);
            }}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            ลบ
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">MANUALS · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "คู่มือ & SOP", href: "/manuals" },
        { label: "คลังคู่มือและมาตรฐานการทำงาน (Manuals & SOP)" },
      ]}
      title="คลังคู่มือและมาตรฐานการทำงาน (Manuals & SOP)"
      description="ระบบจัดการเอกสารคู่มือเครื่องจักร และขั้นตอนการปฏิบัติงานมาตรฐาน"
      actions={
        <Button variant="primary" onClick={() => router.push("/manuals/create")}>
          <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          อัปโหลดเอกสารใหม่
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <BookOpen className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">จำนวนเอกสารทั้งหมด</p>
              <div className="cmms-kpi-value tabular-nums">
                {data.length}
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
              placeholder="ค้นหาชื่อเอกสาร, รหัส หรือเครื่องจักร..."
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
            <BookOpen className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>รายการเอกสาร</span>
            {!loading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
          </CardTitle>
          <CardDescription>ฐานความรู้คู่มือเครื่องจักรและ SOP</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<ManualRecord>
            columns={columns}
            data={filtered}
            idKey="id"
            loading={loading}
            skeletonRows={6}
            pageSize={10}
            caption="รายการคู่มือและเอกสาร SOP"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ไม่มีเอกสารคู่มือ (ลองปรับตัวกรอง)"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
