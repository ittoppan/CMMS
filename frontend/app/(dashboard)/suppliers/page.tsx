"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
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
  TrashIcon,
  TruckIcon,
  StarIcon,
} from "@heroicons/react/24/outline";

interface Supplier extends Record<string, unknown> {
  rawId: number;
  code: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  status: string;
  partCount: number;
  stockValue: number;
  lowStockRate: number;
  rating: number;
}

const statusChipStyle: Record<string, React.CSSProperties> = {
  active: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  inactive: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
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
          partCount: row.part_count || 0,
          stockValue: row.stock_value || 0,
          lowStockRate: row.low_stock_rate || 0,
          rating: row.rating || 0,
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
        <span className="cmms-andon-chip" style={statusChipStyle[item.status] || statusChipStyle.inactive}>
          {item.status.toUpperCase()}
        </span>
      ),
    },
    {
      key: "rating",
      header: "คะแนน",
      width: proportional(1),
      renderCell: (item: Supplier) => (
        <HStack gap={2} vAlign="center">
          <span
            className="cmms-andon-chip"
            style={item.rating >= 70
              ? { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
              : item.rating >= 40
                ? { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
                : { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }}
          >
            {item.rating}/100
          </span>
        </HStack>
      ),
    },
    {
      key: "partCount",
      header: "รายการสินค้า",
      width: proportional(1),
      renderCell: (item: Supplier) => (
        <Text type="body" size="sm">{item.partCount} รายการ{item.lowStockRate > 0 ? ` (ขาด ${Math.round(item.lowStockRate)}%)` : ""}</Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: proportional(1),
      renderCell: (item) => (
        <HStack gap={2}>
          <button
            type="button"
            onClick={() => router.push(`/suppliers/edit?id=${item.rawId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            <PencilSquareIcon className="w-3.5 h-3.5" />
            แก้ไข
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
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SUPPLIERS · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ข้อมูลผู้ผลิต (Suppliers)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <TruckIcon className="w-3.5 h-3.5" /> ผู้ผลิต {totalItems} ราย
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            จัดการข้อมูลผู้ผลิต/ผู้จำหน่ายอะไหล่ คะแนน และมูลค่าสต็อก
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/suppliers/create")}
          className="cmms-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่ม Supplier ใหม่
        </button>
      </div>

      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="cmms-icon-tile">
              <TruckIcon className="w-5 h-5" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">จำนวนผู้ผลิตทั้งหมด</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={totalItems} /> <Text type="body" size="sm">ราย</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="cmms-icon-tile cmms-icon-tile--green">
              <StarIcon className="w-5 h-5" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ผู้ขายคะแนนสูงสุด</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ fontSize: 18 }}>
                {suppliers.length > 0
                  ? suppliers.reduce((best, s) => (s.rating > best.rating ? s : best), suppliers[0]).name
                  : "-"}
              </Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="cmms-icon-tile cmms-icon-tile--amber">
              <StarIcon className="w-5 h-5" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">คะแนนเฉลี่ย</Text>
              <Heading level={2} className="cmms-kpi-value">
                {suppliers.length > 0
                  ? Math.round(suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length)
                  : 0}<Text type="body" size="sm">/100</Text>
              </Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="cmms-icon-tile cmms-icon-tile--red">
              <StarIcon className="w-5 h-5" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">มูลค่าสต็อกรวม</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ fontSize: 18 }}>
                {new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(suppliers.reduce((sum, s) => sum + (s.stockValue || 0), 0))}
              </Heading>
            </VStack>
          </HStack>
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
                  startIcon={<MagnifyingGlassIcon className="w-4 h-4" />}
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
