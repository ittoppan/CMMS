"use client";

// spare_parts/reservations — ภาพรวมการจองอะไหล่ล่วงหน้า (port จาก spare_parts/reservations.php)
// data: GET /api/v1/spare_parts.php (list; s.* รวม stock_qty, reserved_qty)

import { useCallback, useEffect, useState } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";

interface Row {
  id: number;
  code: string;
  name: string;
  unitPrice: string;
  stockQty: number;
  reservedQty: number;
  availableQty: number;
}

export default function ReservationsPage() {
  const hero = usePageHero("spare_parts");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/spare_parts.php");
      const json = await res.json();
      const parts: Row[] = (Array.isArray(json) ? json : [])
        .map((p: any) => {
          const stockQty = Number(p.stock_qty) || 0;
          const reservedQty = Number(p.reserved_qty) || 0;
          return {
            id: p.id,
            code: p.code || "-",
            name: p.name || "-",
            unitPrice: p.unit || "PCS",
            stockQty,
            reservedQty,
            availableQty: Math.max(0, stockQty - reservedQty),
          };
        })
        .sort((a, b) => b.reservedQty - a.reservedQty || a.name.localeCompare(b.name));
      setRows(parts);
    } catch {
      setError("โหลดข้อมูลอะไหล่ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const withReserved = rows.filter((r) => r.reservedQty > 0);
  const totalReserved = rows.reduce((s, r) => s + r.reservedQty, 0);
  const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const columns: SimpleColumn<Row>[] = [
    { key: "code", header: "รหัส", renderCell: (r) => <span className="font-mono text-sm font-semibold">{r.code}</span> },
    { key: "name", header: "ชื่ออะไหล่" },
    { key: "stockQty", header: "สต็อก", renderCell: (r) => <span className="font-mono">{fmtQty(r.stockQty)} {r.unitPrice}</span> },
    {
      key: "reservedQty",
      header: "จองแล้ว",
      renderCell: (r) =>
        r.reservedQty > 0 ? (
          <Badge className="bg-amber-100 text-amber-700 font-mono">{fmtQty(r.reservedQty)}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "availableQty",
      header: "คงเหลือใช้ได้จริง",
      renderCell: (r) => (
        <span className={`font-mono font-semibold ${r.availableQty <= 0 ? "text-rose-600" : "text-emerald-700"}`}>
          {fmtQty(r.availableQty)}
        </span>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "อะไหล่", href: "/spare_parts" }, { label: "ระบบจองอะไหล่" }]}
      title="Reservation Center"
      description="ดูอะไหล่ที่ถูกจองไว้ล่วงหน้าและปริมาณที่ใช้ได้จริง (สต็อก − จอง)"
      actions={
        <Button variant="secondary" onClick={fetchData}>
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          {t("action.refresh")}
        </Button>
      }
    >
      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">รายการอะไหล่ทั้งหมด</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4 text-center"><div className="text-3xl font-black text-primary">{rows.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">สินค้าที่มีการจอง</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4 text-center"><div className="text-3xl font-black text-amber-600">{withReserved.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">ปริมาณจองรวม</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4 text-center"><div className="text-3xl font-black text-amber-600">{fmtQty(totalReserved)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">ตารางการจองอะไหล่ (เรียงตามจำนวนจอง)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">กำลังโหลด...</p> : (
            <SimpleDataTable columns={columns} data={rows} />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
