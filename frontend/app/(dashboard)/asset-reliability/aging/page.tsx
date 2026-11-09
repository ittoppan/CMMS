"use client";

// asset-reliability/aging — Phase 28
// เครื่องที่มีอายุถึงเกณฑ์พิจารณา (ข้อมูลจริง ไม่ใช่คำแนะนำอัตโนมัติให้ปลด)

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Hourglass } from "lucide-react";

const critBadgeVariant: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  A: "danger", B: "warning", C: "info", D: "neutral",
};

interface AgingRow extends Record<string, unknown> {
  id: number;
  code: string;
  name: string;
  criticality: string;
  age_years: number;
  age_vs_min: number;
  installation_date?: string | null;
  commission_date?: string | null;
  purchase_date?: string | null;
  expected_life_months?: number | null;
}

export default function AgingPage() {
  const hero = usePageHero("asset-reliability", { title: "เครื่องถึงกำหนดศึกษา", desc: "เครื่องจักรที่อายุถึงเกณฑ์พิจารณา (ข้อมูลจริง)" });
  const router = useRouter();
  const { data, isLoading, error } = useApiQuery<{ assets: AgingRow[]; config: Record<string, any> }>(
    ["asset-reliability", "aging"],
    "/api/v1/asset_reliability.php?action=aging&limit=100"
  );

  const rows = useMemo(() => data?.assets ?? [], [data]);
  const minYears = data?.config?.ar_retirement_min_age_years ?? 10;

  const shownDate = (r: AgingRow) => r.commission_date || r.installation_date || r.purchase_date || "—";

  const columns: SimpleColumn<AgingRow>[] = [
    { key: "code", header: "รหัส", renderCell: (r) => <span className="font-medium">{r.code}</span> },
    { key: "name", header: "ชื่อเครื่อง", renderCell: (r) => <span>{r.name}</span> },
    {
      key: "criticality", header: "คลาส", align: "center",
      renderCell: (r) => <Badge variant={critBadgeVariant[r.criticality] || "neutral"}>{r.criticality || "?"}</Badge>,
    },
    { key: "age_years", header: "อายุ (ปี)", align: "right", renderCell: (r) => <span className="font-semibold tabular-nums">{r.age_years}</span> },
    { key: "age_vs_min", header: `เกินเกณฑ์ (${minYears} ปี)`, align: "right", renderCell: (r) => (
      <span className={`tabular-nums ${r.age_vs_min > 0 ? "text-[var(--cmms-warning)]" : "text-muted-foreground"}`}>
        +{r.age_vs_min} ปี
      </span>
    ) },
    { key: "date", header: "วันที่ติดตั้ง", renderCell: (r) => <span className="text-sm">{shownDate(r)}</span> },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: hero.title }]}
      title={hero.title}
      description="เครื่องจักรที่อายุ ≥ เกณฑ์พิจารณา — ใช้ร่วมกับข้อมูล reliability/cost/profit เพื่อตัดสินใจเชิงมนุษย์ ไม่ใช่ระบบแนะนำให้ปลดระวางอัตโนมัติ"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner label="กำลังโหลด..." /></div>
      )}
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error.message} />}

      {!isLoading && data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hourglass className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              <span>เครื่องที่ถึงเกณฑ์ทบทวนอายุ</span>
              <Badge variant="primary">{rows.length} เครื่อง</Badge>
            </CardTitle>
            <CardDescription>เกณฑ์พิจารณา: อายุไม่น้อยกว่า {minYears} ปี (ตั้งค่าได้ที่ Reliability Settings)</CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length > 0 ? (
              <SimpleDataTable
                columns={columns}
                data={rows}
                idKey="id"
                pageSize={10}
                caption="รายการเครื่องที่ถึงเกณฑ์อายุ"
                emptyTitle="ไม่พบข้อมูล"
                emptyDescription="ลองปรับเกณฑ์ในหน้าการตั้งค่า"
                onRowClick={(r) => router.push(`/asset-reliability/${r.id}`)}
              />
            ) : (
              <EmptyState title="ไม่มีเครื่องเข้าข่าย" description="ยังไม่มีเครื่องจักรที่มีอายุถึงเกณฑ์พิจารณาในระบบ" />
            )}
            <Alert variant="info" className="mt-4" title="ใช้ข้อมูลจริงในการพิจารณา" description="ระบบแสดงเฉพาะข้อเท็จจริง (อายุ รายจ่าย reliability) — ควรตรวจสอบกับวิศวกรก่อนตัดสินใจเรื่องอายุการใช้งานเหลือหรือการต่ออายุ" />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}