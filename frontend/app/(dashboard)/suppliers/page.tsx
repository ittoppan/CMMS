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
import { TextInput } from "@astryxdesign/core/TextInput";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import CountUp from "react-countup";
import { Link } from "@astryxdesign/core/Link";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon
} from "@heroicons/react/24/outline";

interface Supplier extends Record<string, unknown> {
  rawId: number;
  code: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  status: string;
}

const badgeVariant: Record<string, "success" | "neutral"> = {
  active: "success",
  inactive: "neutral",
};

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/suppliers.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          code: row.code || "-",
          name: row.name || "-",
          contact: row.contact_person || "-",
          phone: row.phone || "-",
          email: row.email || "-",
          status: row.is_active ? "active" : "inactive",
        }));
        setSuppliers(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch suppliers", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;
    try {
      await fetch(`/api/v1/suppliers.php?id=${id}`, { method: "DELETE" });
      fetchSuppliers();
    } catch (e) {
      console.error("Failed to delete supplier", e);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.contact.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
    );
  }, [search, suppliers]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<Supplier>[] = [
    { key: "code", header: "Code", width: proportional(1) },
    { key: "name", header: "Name", width: proportional(2) },
    { key: "contact", header: "Contact", width: proportional(1) },
    { key: "phone", header: "Phone", width: proportional(1) },
    {
      key: "email",
      header: "Email",
      width: proportional(1),
      renderCell: (item: Supplier) => <Link href={`mailto:${item.email}`}>{item.email}</Link>,
    },
    {
      key: "status",
      header: "Status",
      width: proportional(1),
      renderCell: (item: Supplier) => (
        <Badge label={item.status.toUpperCase()} variant={badgeVariant[item.status] || "neutral"} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: proportional(1),
      renderCell: (item) => (
        <HStack gap={2}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => router.push(`/suppliers/edit?id=${item.rawId}`)}
            label="แก้ไข"
          />
          <IconButton
            size="sm"
            variant="destructive"
            label="ลบ Supplier"
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
          <Heading level={2}>ข้อมูลผู้ผลิต (Suppliers)</Heading>
        </VStack>
        <Button
          label="เพิ่ม Supplier ใหม่"
          variant="primary"
          icon={<Icon icon={PlusIcon} size="sm" />}
          onClick={() => router.push("/suppliers/create")}
        />
      </Card>

      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">จำนวนผู้ผลิตทั้งหมด (Total Suppliers)</Text>
            <Heading level={2}><CountUp end={totalItems} /> <Text type="body" size="sm">ราย</Text></Heading>
          </VStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          <Toolbar
            label="ค้นหาข้อมูล"
            startContent={
              <HStack>
                <TextInput
                  label="ค้นหา"
                  isLabelHidden
                  placeholder="ค้นหาตามรหัส, ชื่อ หรืออีเมล..."
                  startIcon={<Icon icon={MagnifyingGlassIcon} />}
                  value={search}
                  onChange={setSearch}
                  style={{ width: "100%", maxWidth: 400 }}
                />
              </HStack>
            }
          />
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
