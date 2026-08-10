"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Grid } from "@astryxdesign/core/Grid";
import CountUp from "react-countup";
import { Icon } from "@astryxdesign/core/Icon";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { 
  MagnifyingGlassIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ShieldCheckIcon
} from "@heroicons/react/24/outline";

interface Role extends Record<string, unknown> {
  rawId: number;
  id: string;
  name: string;
  description: string;
}

const PAGE_SIZE = 10;

export default function RolesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/roles.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `ROLE-${String(row.id).padStart(3, '0')}`,
          name: row.name || "Unknown",
          description: row.description || "-",
        }));
        setRoles(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch roles", e);
      setError("Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRoles(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this Role?")) return;
    try {
      await fetch(`/api/v1/roles.php?id=${id}`, { method: "DELETE" });
      fetchRoles();
    } catch (e) {
      console.error("Failed to delete role", e);
    }
  };

  const filtered = useMemo(() => {
    return roles.filter((t) => {
      const q = search.toLowerCase();
      const matchSearch = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      return matchSearch;
    });
  }, [search, roles]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  const columns: TableColumn<Role>[] = [
    { key: "id", header: "รหัส", width: proportional(1) },
    { key: "name", header: "ชื่อบทบาท", width: proportional(2) },
    { key: "description", header: "รายละเอียด", width: proportional(4) },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(2),
      renderCell: (item) => (
        <HStack gap={2}>
          <Button
            size="sm"
            variant="secondary"
            label="แก้ไขสิทธิ์"
            onClick={() => router.push(`/roles/edit?id=${item.rawId}`)}
          />
          <IconButton
            size="sm"
            variant="destructive"
            label="ลบบทบาท"
            icon={<Icon icon={TrashIcon} size="sm" />}
            onClick={() => handleDelete(item.rawId)}
          />
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>จัดการสิทธิ์ (Roles & Permissions)</Heading>
            <Badge label="ความปลอดภัยของระบบ" variant="info" icon={<Icon icon={ShieldCheckIcon} size="sm" />} />
          </HStack>
          <Text type="body" color="secondary">กำหนดบทบาทและจัดการสิทธิ์การเข้าถึงข้อมูลของระบบ</Text>
        </VStack>
        <HStack gap={2}>
          <Button label="สร้าง Role ใหม่" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => router.push("/roles/create")} />
        </HStack>
      </Card>

      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">จำนวนบทบาททั้งหมด (Total Roles)</Text>
            <Heading level={2}><CountUp end={totalItems} /> <Text type="body" size="sm">บทบาท</Text></Heading>
          </VStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <Toolbar label="ค้นหาบทบาท" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาชื่อบทบาท..."
                startIcon={<Icon icon={MagnifyingGlassIcon} />}
                value={search}
                onChange={setSearch}
                style={{ width: 300 }}
              />
            </HStack>} />

          {error && <Text type="body" color="accent">{error}</Text>}

          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}>กำลังโหลดข้อมูล...</div>
          ) : (
            <Table columns={columns} data={paged} />
          )}

          {totalItems > PAGE_SIZE && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
            />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
