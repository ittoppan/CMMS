"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import CountUp from "react-countup";
import {
  Plus,
  Search,
  SquarePen,
  Trash2,
  Wrench,
  TriangleAlert,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";

interface BorrowRecord extends Record<string, unknown> {
  rawId: number;
  id: string;
  assetName: string;
  borrowerName: string;
  borrowDate: string;
  expectedReturnDate: string;
  status: string;
}

const statusBadgeVariant: Record<string, "warning" | "danger" | "success" | "neutral"> = {
  borrowed: "warning",
  overdue: "danger",
  returned: "success",
  lost: "neutral",
};

const statusLabel: Record<string, string> = {
  borrowed: "กำลังยืมใช้งาน",
  overdue: "เกินกำหนดคืน",
  returned: "คืนเรียบร้อยแล้ว",
  lost: "สูญหาย",
};

export default function EquipmentBorrowingPage() {
  const router = useRouter();
  const [data, setData] = useState<BorrowRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/equipment_borrowing.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => {
          let status = row.status || "borrowed";
          if (status === "borrowed" && row.expected_return_date && new Date(row.expected_return_date) < new Date()) {
            status = "overdue";
          }
          return {
            rawId: row.id,
            id: `BRW-${String(row.id).padStart(3, '0')}`,
            assetName: row.asset_name || "ไม่ระบุ",
            borrowerName: row.borrower_name || "ไม่ระบุ",
            borrowDate: row.borrow_date ? row.borrow_date.substring(0, 10) : "-",
            expectedReturnDate: row.expected_return_date || "-",
            status: status,
          };
        });
        setData(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch equipment borrowing", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this borrowing record?")) return;
    try {
      await fetch(`/api/v1/equipment_borrowing.php?id=${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      console.error("Failed to delete borrowing record", e);
    }
  };

  const stats = useMemo(() => {
    return {
      total: data.length,
      borrowed: data.filter(d => d.status === "borrowed").length,
      overdue: data.filter(d => d.status === "overdue").length,
      returned: data.filter(d => d.status === "returned").length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.assetName.toLowerCase().includes(q) ||
        s.borrowerName.toLowerCase().includes(q)
    );
  }, [search, data]);

  const columns: SimpleColumn<BorrowRecord>[] = [
    { key: "id", header: "เลขที่การยืม" },
    { key: "assetName", header: "อุปกรณ์ / เครื่องมือ" },
    { key: "borrowerName", header: "ผู้ยืม" },
    { key: "borrowDate", header: "วันที่ยืม" },
    { key: "expectedReturnDate", header: "กำหนดคืน" },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (item) => (
        <Badge variant={statusBadgeVariant[item.status] || "warning"}>
          {statusLabel[item.status] || item.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      renderCell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/equipment_borrowing/edit?id=${item.rawId}`)}
            className="gap-1.5"
          >
            <SquarePen className="w-3.5 h-3.5" />
            แก้ไข
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(item.rawId)}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            ลบ
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">EQUIPMENT BORROWING · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ยืม-คืนอุปกรณ์", href: "/equipment_borrowing" },
        { label: "ระบบยืม-คืนเครื่องมือช่างและอุปกรณ์พิเศษ" },
      ]}
      title="ระบบยืม-คืนเครื่องมือช่างและอุปกรณ์พิเศษ"
      description="ควบคุมการยืม-คืนเครื่องมือช่างราคาสูง อุปกรณ์วัดค่า และเครื่องตรวจวัดพิเศษ"
      actions={
        <Button variant="primary" onClick={() => router.push("/equipment_borrowing/create")}>
          <Plus className="w-4 h-4" />
          ขอยืมอุปกรณ์ใหม่
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
              <Clock className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">กำลังถูกยืมใช้งาน</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.borrowed} />
                <span className="cmms-kpi-unit">รายการ</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
              <TriangleAlert className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เกินกำหนดคืน</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.overdue} />
                <span className="cmms-kpi-unit">รายการ</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
              <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">คืนเรียบร้อยแล้ว</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.returned} />
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
              label="ค้นหารายการยืม"
              isLabelHidden
              placeholder="ค้นหาอุปกรณ์, ผู้ยืม หรือเลขที่การยืม..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {loading && (
            <Skeleton className="h-6 w-24 rounded-full" />
          )}
        </CardContent>
      </Card>

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>รายการยืม-คืนอุปกรณ์</span>
            {!loading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<BorrowRecord>
            columns={columns}
            data={filtered}
            idKey="id"
            loading={loading}
            skeletonRows={6}
            pageSize={10}
            caption="รายการยืม-คืนอุปกรณ์"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ไม่มีรายการยืม-คืนอุปกรณ์ (ลองปรับตัวกรอง)"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
