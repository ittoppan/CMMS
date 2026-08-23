"use client";

// suppliers — migrate ui kit (PageShell, ui/Card, ui/Input, SimpleDataTable, ui/Badge)
// business logic ครบเดิม: fetch/delete suppliers.php, client search filter, KPI calculations

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";
import CountUp from "react-countup";
import { Plus, Search, SquarePen, Trash2, Truck, Star } from "lucide-react";

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

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");

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

  const columns: SimpleColumn<Supplier>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "contact", header: "Contact" },
    { key: "phone", header: "Phone" },
    {
      key: "email",
      header: "Email",
      renderCell: (item: Supplier) => (
        <a href={`mailto:${item.email}`} className="text-[var(--cmms-primary)] hover:underline">
          {item.email}
        </a>
      ),
    },
    {
      key: "status",
      header: "Status",
      renderCell: (item: Supplier) => (
        <Badge variant={item.status === "active" ? "success" : "neutral"}>
          {item.status.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "rating",
      header: "คะแนน",
      renderCell: (item: Supplier) => (
        <Badge
          variant={
            item.rating >= 70
              ? "success"
              : item.rating >= 40
                ? "warning"
                : "danger"
          }
        >
          {item.rating}/100
        </Badge>
      ),
    },
    {
      key: "partCount",
      header: "รายการสินค้า",
      renderCell: (item: Supplier) => (
        <span className="text-sm">
          {item.partCount} รายการ{item.lowStockRate > 0 ? ` (ขาด ${Math.round(item.lowStockRate)}%)` : ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      renderCell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/suppliers/edit?id=${item.rawId}`)}
            className="gap-1.5"
          >
            <SquarePen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            แก้ไข
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(item.rawId)}
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
      eyebrow={<p className="cmms-eyebrow">SUPPLIERS · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ผู้จำหน่าย", href: "/suppliers" },
        { label: "ข้อมูลผู้ผลิต (Suppliers)" },
      ]}
      title="ข้อมูลผู้ผลิต (Suppliers)"
      description="จัดการข้อมูลผู้ผลิต/ผู้จำหน่ายอะไหล่ คะแนน และมูลค่าสต็อก"
      actions={
        <Button onClick={() => router.push("/suppliers/create")}>
          <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          เพิ่ม Supplier ใหม่
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
            <Truck className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">จำนวนผู้ผลิตทั้งหมด</p>
            <div className="cmms-kpi-value tabular-nums">
              <CountUp end={filtered.length} /> <span className="text-sm font-normal">ราย</span>
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
            <Star className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">ผู้ขายคะแนนสูงสุด</p>
            <p className="truncate text-lg font-semibold text-foreground">
              {suppliers.length > 0
                ? suppliers.reduce((best, s) => (s.rating > best.rating ? s : best), suppliers[0]).name
                : "-"}
            </p>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
            <Star className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">คะแนนเฉลี่ย</p>
            <div className="cmms-kpi-value tabular-nums">
              {suppliers.length > 0
                ? Math.round(suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length)
                : 0}<span className="text-sm font-normal">/100</span>
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
            <Star className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">มูลค่าสต็อกรวม</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(suppliers.reduce((sum, s) => sum + (s.stockValue || 0), 0))}
            </p>
          </div>
        </div>
      </Card>
      </Grid>

      {/* Filter card */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[400px]">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาตามรหัส, ชื่อ หรืออีเมล..."
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
            <Truck className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>รายชื่อผู้ผลิต</span>
            {!loading && <Badge variant="primary">{filtered.length} ราย</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<Supplier>
            columns={columns}
            data={filtered}
            idKey="rawId"
            loading={loading}
            pageSize={10}
            caption="รายชื่อผู้ผลิต/ผู้จำหน่ายในระบบ"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ลองเปลี่ยนคำค้นหา หรือเพิ่ม Supplier ใหม่"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
