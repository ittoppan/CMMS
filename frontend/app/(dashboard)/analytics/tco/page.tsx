"use client";

// analytics/tco — TCO & Repair-vs-Replace (port จาก analytics/tco.php)
// data: asset_stats.php?resource=tco (รวม cost_parts + cost_labor ต่อเครื่อง)

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

interface TcoRow {
  id: number;
  code: string;
  name: string;
  created_at: string;
  totalMaintCost: number;
  totalRepairs: number;
  years: number;
  annualCost: number;
  grade: { label: string; cls: string };
}

function gradeOf(annualCost: number, replaced?: boolean) {
  if (annualCost <= 0) return { label: "ไม่มีต้นทุน", cls: "bg-slate-100 text-slate-500" };
  if (annualCost > 60000) return { label: "B+", cls: "bg-orange-100 text-orange-700" };
  return { label: "A", cls: "bg-emerald-100 text-emerald-700" };
}

export default function TcoPage() {
  const hero = usePageHero("analytics");
  const [rows, setRows] = useState<TcoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/asset_stats.php?resource=tco");
      const json = await res.json();
      const list: TcoRow[] = (Array.isArray(json) ? json : []).map((r: any) => {
        const created = new Date(String(r.created_at || "").replace(" ", "T"));
        const years = Math.max(created.getTime() ? (Date.now() - created.getTime()) / (365.25 * 24 * 3600 * 1000) : 1, 0.5);
        const total = Number(r.total_maint_cost) || 0;
        const annual = Math.round(total / years);
        return {
          id: r.id,
          code: r.code || "-",
          name: r.name || "-",
          created_at: r.created_at || "-",
          totalMaintCost: total,
          totalRepairs: Number(r.total_repairs) || 0,
          years: Math.round(years * 10) / 10,
          annualCost: annual,
          grade: gradeOf(annual),
        };
      });
      setRows(list);
    } catch {
      setError("โหลดสถิติ TCO ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  const columns: SimpleColumn<TcoRow>[] = [
    { key: "code", header: "รหัสเครื่อง", renderCell: (r) => <span className="font-mono text-sm font-semibold">{r.code}</span> },
    { key: "name", header: "ชื่อเครื่องจักร" },
    { key: "years", header: "อายุการใช้งาน (ปี)", renderCell: (r) => <span className="font-mono">{r.years.toFixed(1)}</span> },
    { key: "totalRepairs", header: "จำนวนซ่อม", renderCell: (r) => <span className="font-mono">{r.totalRepairs}</span> },
    { key: "totalMaintCost", header: "ต้นทุนซ่อมรวม", renderCell: (r) => <span className="font-mono">฿{fmt(r.totalMaintCost)}</span> },
    { key: "annualCost", header: "TCO ต่อปี", renderCell: (r) => <span className="font-mono font-semibold">{r.totalMaintCost > 0 ? `฿${fmt(r.annualCost)}` : "—"}</span> },
    { key: "grade", header: "ประเมินคุ้มค่า", renderCell: (r) => <Badge className={r.grade.cls}>{r.grade.label}</Badge> },
  ];

  const totalCost = rows.reduce((s, r) => s + r.totalMaintCost, 0);
  const totalRepairs = rows.reduce((s, r) => s + r.totalRepairs, 0);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "วิเคราะห์", href: "/analytics" }, { label: "TCO" }]}
      title="ต้นทุนรวมตลอดอายุเครื่อง (TCO)"
      description="เปรียบเทียบต้นทุนซ่อมสะสมต่อปี เพื่อประกอบการตัดสินใจซ่อมต่อหรือเปลี่ยนเครื่อง"
      actions={
        <Button variant="secondary" onClick={fetchData}>
          <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.refresh")}
        </Button>
      }
    >
      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">ต้นทุนซ่อมรวมทุกเครื่อง</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4 text-center"><div className="text-3xl font-black text-primary">฿{fmt(totalCost)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">งานซ่อมทั้งหมด</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4 text-center"><div className="text-3xl font-black text-primary">{totalRepairs}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase text-muted-foreground">เครื่องที่มีต้นทุนต่อปีสูงกว่า ฿60,000</CardTitle></CardHeader>
          <CardContent className="pt-0 pb-4 text-center"><div className="text-3xl font-black text-orange-600">{rows.filter((r) => r.annualCost > 60000).length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ตาราง TCO รายเครื่อง</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">กำลังคำนวณ...</p>
            : rows.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีข้อมูล</p>
            : <SimpleDataTable columns={columns} data={rows} />}
        </CardContent>
      </Card>
    </PageShell>
  );
}
