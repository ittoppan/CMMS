"use client";

// asset-reliability/critical — Phase 28
// อันดับเครื่องสำคัญ (A-D) จากข้อมูลจริง — เป็นข้อมูล ไม่ใช่คำแนะนำอัตโนมัติ

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { Grid, VStack } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Gauge } from "lucide-react";

const critBadgeVariant: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  A: "danger", B: "warning", C: "info", D: "neutral",
};

const CRIT_LABEL: Record<string, string> = {
  A: "วิกฤต", B: "สำคัญมาก", C: "สำคัญ", D: "ทั่วไป",
};

interface AssetRow extends Record<string, unknown> {
  id: number;
  code: string;
  name: string;
  category: string | null;
  criticality: string;
  criticality_score: number;
  lifecycle_status: string;
  age_years: number | null;
  health?: string;
  rel?: { status?: string; mtbf_hours?: number; mttr_minutes?: number; failures?: number };
}

export default function CriticalAssetsPage() {
  const hero = usePageHero("asset-reliability", { title: "เครื่องสำคัญ (A/B/C/D)" });
  const router = useRouter();
  const { data, isLoading, error } = useApiQuery<{ assets: AssetRow[] }>(
    ["asset-reliability", "critical"],
    "/api/v1/asset_reliability.php?action=critical&limit=100"
  );
  const [q, setQ] = useState("");
  const [crit, setCrit] = useState("ALL");

  const rows = useMemo(() => {
    const list = data?.assets ?? [];
    const query = q.trim().toLowerCase();
    return list.filter(
      (r) =>
        (crit === "ALL" || r.criticality === crit) &&
        (!query || r.code.toLowerCase().includes(query) || (r.name || "").toLowerCase().includes(query))
    );
  }, [data, q, crit]);

  const counts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0, D: 0 };
    for (const r of data?.assets ?? []) if (c[r.criticality as keyof typeof c] != null) c[r.criticality as keyof typeof c]++;
    return c;
  }, [data]);

  const columns: SimpleColumn<AssetRow>[] = [
    { key: "code", header: "รหัส", renderCell: (r) => <span className="font-medium">{r.code}</span> },
    { key: "name", header: "ชื่อเครื่อง", renderCell: (r) => <span>{r.name}</span> },
    {
      key: "criticality", header: "คลาส", align: "center",
      renderCell: (r) => (
        <Badge variant={critBadgeVariant[r.criticality] || "neutral"}>
          {r.criticality || "?"} · {CRIT_LABEL[r.criticality] || ""}
        </Badge>
      ),
    },
    { key: "criticality_score", header: "คะแนน", align: "right", renderCell: (r) => <span className="tabular-nums">{r.criticality_score}%</span> },
    { key: "health", header: "Health", align: "center", renderCell: (r) => <span className="text-sm">{r.health || "—"}</span> },
    { key: "rel", header: "MTBF / MTTR", align: "right", renderCell: (r) => (
      <span className="tabular-nums text-sm">
        {r.rel?.mtbf_hours != null ? `${r.rel.mtbf_hours}ชม.` : "—"} / {r.rel?.mttr_minutes != null ? `${r.rel.mttr_minutes}น.` : "—"}
      </span>
    ) },
    { key: "age_years", header: "อายุ (ปี)", align: "right", renderCell: (r) => <span className="tabular-nums">{r.age_years != null ? r.age_years : "—"}</span> },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: hero.title }]}
      title={hero.title}
      description="อันดับความสำคัญจากคะแนน criticality (ข้อมูลจริงในระบบ) — เป็นสถิติประกอบการตัดสินใจ ไม่ใช่คำแนะนำอัตโนมัติ"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner label="กำลังโหลด..." /></div>
      )}
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error.message} />}

      {!isLoading && data && (
        <>
          <Grid columns={{ minWidth: 160, max: 4 }} gap={4}>
            {(["A", "B", "C", "D"] as const).map((l) => (
              <Card key={l}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    l === "A" ? "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]"
                    : l === "B" ? "bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)]"
                    : l === "C" ? "bg-[var(--cmms-info-light)] text-[var(--cmms-info)]"
                    : "bg-[var(--cmms-bg-muted)] text-muted-foreground"
                  }`}>
                    <Gauge size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm text-muted-foreground">คลาส {l} · {CRIT_LABEL[l]}</p>
                    <h2 className="text-xl font-semibold tabular-nums">{counts[l]} เครื่อง</h2>
                  </div>
                </CardContent>
              </Card>
            ))}
          </Grid>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                <span>รายการเครื่องตามความสำคัญ</span>
                <Badge variant="primary">{rows.length} เครื่อง</Badge>
              </CardTitle>
              <CardDescription>
                คลิกแถวเพื่อเปิดโปรไฟล์ Reliability & Lifecycle ของเครื่องนั้น
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  label="ค้นหา"
                  isLabelHidden
                  placeholder="ค้นหารหัส/ชื่อเครื่อง..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="max-w-[280px]"
                />
                <div className="w-[220px]">
                  <Select value={crit} onValueChange={setCrit}>
                    <SelectTrigger aria-label="คลาสความสำคัญ">
                      <SelectValue placeholder="ทุกคลาส" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">ทุกคลาส</SelectItem>
                      <SelectItem value="A">คลาส A (วิกฤต)</SelectItem>
                      <SelectItem value="B">คลาส B (สำคัญมาก)</SelectItem>
                      <SelectItem value="C">คลาส C (สำคัญ)</SelectItem>
                      <SelectItem value="D">คลาส D (ทั่วไป)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {rows.length > 0 ? (
                <SimpleDataTable
                  columns={columns}
                  data={rows}
                  idKey="id"
                  pageSize={10}
                  caption="อันดับความสำคัญของเครื่องจักร"
                  emptyTitle="ไม่พบเครื่องที่ตรงเงื่อนไข"
                  emptyDescription="ลองปรับตัวกรองหรือค้นหา"
                  onRowClick={(r) => router.push(`/asset-reliability/${r.id}`)}
                />
              ) : (
                <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีเครื่องจักรที่ตรงเงื่อนไข" />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}