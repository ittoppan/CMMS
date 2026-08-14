"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Grid } from "@astryxdesign/core/Grid";
import CountUp from "react-countup";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { 
  MagnifyingGlassIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ShieldCheckIcon,
  UserGroupIcon,
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
          <button
            type="button"
            onClick={() => router.push(`/roles/edit?id=${item.rawId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            <PencilSquareIcon className="w-3.5 h-3.5" />
            แก้ไขสิทธิ์
          </button>
          <button
            type="button"
            onClick={() => handleDelete(item.rawId)}
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
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>ROLES · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>จัดการสิทธิ์ (Roles & Permissions)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ShieldCheckIcon className="w-3.5 h-3.5" /> ความปลอดภัยของระบบ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            กำหนดบทบาทและจัดการสิทธิ์การเข้าถึงข้อมูลของระบบ
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/roles/create")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          สร้าง Role ใหม่
        </button>
      </div>

      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 cmms-icon-tile">
              <UserGroupIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">จำนวนบทบาททั้งหมด</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={totalItems} /> <Text type="body" size="sm">บทบาท</Text></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <Toolbar label="ค้นหาบทบาท" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาชื่อบทบาท..."
                startIcon={<MagnifyingGlassIcon className="w-4 h-4" />}
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
