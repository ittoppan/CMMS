"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  TrashIcon,
  DocumentTextIcon,
  BookOpenIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

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
  const [page, setPage] = useState(1);
  const pageSize = 10;

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

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(totalItems / pageSize);

  const columns: TableColumn<ManualRecord>[] = [
    { key: "id", header: "รหัสเอกสาร", width: proportional(1) },
    {
      key: "title",
      header: "ชื่อเอกสาร (Title)",
      width: proportional(2.5),
      renderCell: (item) => (
        <HStack gap={2} vAlign="center">
          <DocumentTextIcon className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
          <VStack gap={0}>
            <Text type="body" weight="medium">{item.title}</Text>
            <Text type="supporting" color="secondary" maxLines={1}>{item.description}</Text>
          </VStack>
        </HStack>
      )
    },
    { key: "assetName", header: "เครื่องจักร/อุปกรณ์", width: proportional(1.5) },
    { key: "version", header: "เวอร์ชัน", width: proportional(0.8) },
    {
      key: "fileType",
      header: "ประเภท",
      width: proportional(0.8),
      renderCell: (item) => (
        <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "#64748B" }}>
          {item.fileType.toUpperCase()}
        </span>
      )
    },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(1.5),
      renderCell: (item) => (
        <HStack gap={2}>
          {item.filePath ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(item.filePath, '_blank');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              <DocumentArrowDownIcon className="w-3.5 h-3.5" />
              ดาวน์โหลด
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push(`/manuals/edit?id=${item.rawId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              <PencilSquareIcon className="w-3.5 h-3.5" />
              แก้ไข
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item.rawId);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            ลบ
          </button>
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>MANUALS · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>คลังคู่มือและมาตรฐานการทำงาน (Manuals & SOP)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <BookOpenIcon className="w-3.5 h-3.5" /> ฐานความรู้
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ระบบจัดการเอกสารคู่มือเครื่องจักร และขั้นตอนการปฏิบัติงานมาตรฐาน
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/manuals/create")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300"
        >
          <PlusIcon className="w-4 h-4" />
          อัปโหลดเอกสารใหม่
        </button>
      </div>

      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
              <DocumentTextIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">จำนวนเอกสารทั้งหมด</Text>
              <Heading level={2}>{data.length} <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card padding={4}>
        <VStack gap={4}>
          <Toolbar label="ค้นหาเอกสาร" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาชื่อเอกสาร, รหัส หรือเครื่องจักร..."
                startIcon={<MagnifyingGlassIcon className="w-4 h-4" />}
                value={search}
                onChange={setSearch}
                style={{ width: 350 }}
              />
            </HStack>} />

          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}>กำลังโหลดข้อมูล...</div>
          ) : (
            <Table columns={columns} data={paged} />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
