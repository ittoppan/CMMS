"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  TrashIcon,
  DocumentTextIcon
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
          <Icon icon={DocumentTextIcon} size="sm" color="secondary" />
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
      renderCell: (item) => <Badge label={item.fileType.toUpperCase()} variant="neutral" />
    },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(1.5),
      renderCell: (item) => (
        <HStack gap={2}>
          {item.filePath ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon icon={DocumentArrowDownIcon} size="sm" />}
              onClick={(e) => {
                e.stopPropagation();
                window.open(item.filePath, '_blank');
              }}
              label="ดาวน์โหลด"
            />
          ) : (
            <Button size="sm" variant="secondary" label="แก้ไข" onClick={() => router.push(`/manuals/edit?id=${item.rawId}`)} />
          )}
          <IconButton
            size="sm"
            variant="destructive"
            label="ลบเอกสาร"
            icon={<Icon icon={TrashIcon} size="sm" />}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item.rawId);
            }}
          />
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>คลังคู่มือและมาตรฐานการทำงาน (Manuals & SOP)</Heading>
            <Badge label="ฐานความรู้" variant="info" />
          </HStack>
          <Text type="body" color="secondary">ระบบจัดการเอกสารคู่มือเครื่องจักร และขั้นตอนการปฏิบัติงานมาตรฐาน</Text>
        </VStack>
        <Button label="อัปโหลดเอกสารใหม่" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => router.push("/manuals/create")} />
      </HStack>

      <Grid columns={3} gap={4}>
        <Card padding={4} style={{ borderLeft: '4px solid var(--cmms-primary)' }}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">จำนวนเอกสารทั้งหมด</Text>
            <Heading level={3}>{data.length} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
          </VStack>
        </Card>
      </Grid>

      <Card padding={4}>
        <VStack gap={4}>
          <Toolbar label="ค้นหาเอกสาร" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาชื่อเอกสาร, รหัส หรือเครื่องจักร..."
                startIcon={<Icon icon={MagnifyingGlassIcon} />}
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
