"use client";

// asset-reliability/lifecycle — Phase 28
// สถานะวงจรชีวิตของเครื่องจักร + แจกแจง + ประวัติการเปลี่ยนสถานะ

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { Grid, VStack } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { CircleDot, History } from "lucide-react";

const LIFE_LABELS: Record<string, string> = {
  planned: "วางแผน", procurement: "จัดซื้อ", installed: "ติดตั้ง", commissioned: "ทดลองเดิน",
  operating: "ใช้งานปกติ", under_maintenance: "กำลังซ่อมบำรุง", overhauled: "ยกเครื่อง",
  retired: "ปลดระวาง", disposed: "จำหน่าย", "": "ยังไม่ระบุ",
};

const lifeVariant = (s?: string): "success" | "warning" | "info" | "neutral" =>
  s === "operating" ? "success" : s === "retired" || s === "disposed" ? "neutral" : s === "under_maintenance" ? "warning" : "info";

interface AssetLc extends Record<string, unknown> {
  id: number;
  code: string;
  name: string;
  criticality: string;
  lifecycle_status: string;
}

export default function LifecyclePage() {
  const hero = usePageHero("asset-reliability", { title: "สถานะวงจรชีวิต", desc: "Lifecycle ของเครื่องจักรทั้งหมด" });
  const router = useRouter();
  const dash = useApiQuery<{ by_lifecycle: Record<string, number>; total_assets: number }>(
    ["asset-reliability", "dash"], "/api/v1/asset_reliability.php?action=dashboard"
  );
  const [life, setLife] = useState("ALL");
  const list = useApiQuery<{ assets: AssetLc[] }>(
    ["asset-reliability", "list", life],
    `/api/v1/asset_reliability.php?action=list&lifecycle_status=${life === "ALL" ? "" : life}`
  );

  const rows = useMemo(() => list.data?.assets ?? [], [list.data]);
  const dist = dash.data?.by_lifecycle ?? {};

  const columns: SimpleColumn<AssetLc>[] = [
    { key: "code", header: "รหัส", renderCell: (r) => <span className="font-medium">{r.code}</span> },
    { key: "name", header: "ชื่อเครื่อง", renderCell: (r) => <span>{r.name}</span> },
    { key: "lifecycle_status", header: "สถานะ", align: "center", renderCell: (r) => (
      <Badge variant={lifeVariant(r.lifecycle_status)}>{LIFE_LABELS[r.lifecycle_status] || r.lifecycle_status || "ยังไม่ระบุ"}</Badge>
    ) },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: hero.title }]}
      title={hero.title}
      description="สถานะวงจรชีวิตของเครื่องจักรทั้งหมดในระบบ — การเปลี่ยนสถานะมีประวัติและบันทึกผู้แก้ไขเสมอ"
    >
      {dash.isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner label="กำลังโหลด..." /></div>
      )}
      {dash.error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={dash.error.message} />}

      {!dash.isLoading && dash.data && (
        <Grid columns={{ minWidth: 260, max: 2 }} gap={4}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleDot className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                <span>การแจกแจงตาม Lifecycle</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(dist).length > 0 ? (
                <VStack gap={2}>
                  {Object.entries(dist).map(([st, n]) => (
                    <div key={st || "none"} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge variant={lifeVariant(st)}>{LIFE_LABELS[st] || st}</Badge>
                      </span>
                      <span className="font-semibold tabular-nums">{n} เครื่อง</span>
                    </div>
                  ))}
                </VStack>
              ) : (
                <EmptyState title="ไม่มีข้อมูล" description="ยังไม่มีการตั้งค่าสถานะวงจรชีวิต" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                <span>รายการเครื่องตามสถานะ</span>
                <Badge variant="primary">{rows.length} เครื่อง</Badge>
              </CardTitle>
              <CardDescription>
                <div className="w-[240px]">
                  <Select value={life} onValueChange={setLife}>
                    <SelectTrigger aria-label="กรองสถานะวงจรชีวิต">
                      <SelectValue placeholder="ทุกสถานะ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">ทุกสถานะ</SelectItem>
                      {Object.entries(LIFE_LABELS).map(([k, v]) => (
                        <SelectItem key={k || "__none__"} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {list.isLoading ? (
                <Spinner label="กำลังโหลด..." />
              ) : list.error ? (
                <Alert variant="danger" title="เกิดข้อผิดพลาด" description={list.error.message} />
              ) : rows.length > 0 ? (
                <SimpleDataTable
                  columns={columns}
                  data={rows}
                  idKey="id"
                  pageSize={10}
                  caption="รายการเครื่องตามสถานะวงจรชีวิต"
                  emptyTitle="ไม่พบข้อมูล"
                  emptyDescription="ลองเปลี่ยนตัวกรอง"
                  onRowClick={(r) => router.push(`/asset-reliability/${r.id}`)}
                />
              ) : (
                <EmptyState title="ไม่มีเครื่องในสถานะนี้" description="ลองเลือกสถานะอื่น" />
              )}
            </CardContent>
          </Card>
        </Grid>
      )}
    </PageShell>
  );
}