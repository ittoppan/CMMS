"use client";

import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Activity } from "lucide-react";

interface OotEvent {
  id: number;
  oot_code: string;
  asset_id?: number;
  asset_code?: string;
  asset_name?: string;
  detected_date?: string | null;
  source: string;
  impact_level?: string | null;
  description?: string | null;
  status: string;
  rca_code?: string | null;
  calibration_id?: number | null;
}

const sourceLabel: Record<string, string> = {
  run_failure: "ผลสอบเทียบไม่ผ่าน",
  routine: "พบจากงานประจำ",
  customertq: "แจ้งจากลูกค้า",
  audit: "พบจากการตรวจ",
};

const impactVariant: Record<string, "warning" | "danger" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export default function CalibrationOotPage() {
  const hero = usePageHero("calibration");
  const router = useRouter();

  const { data, isLoading } = useApiQuery<OotEvent[]>(["calibration", "oot"], "/api/v1/calibration_management.php?resource=oot");

  const columns: SimpleColumn<OotEvent>[] = [
    {
      key: "oot_code",
      header: "เหตุการณ์",
      renderCell: (o) => (
        <button type="button" className="font-medium text-[var(--cmms-primary-hover)] hover:underline" onClick={() => router.push(`/oot/${o.id}`)}>
          {o.oot_code}
        </button>
      ),
    },
    { key: "asset_name", header: "เครื่องมือวัด", renderCell: (o) => (o.asset_name || o.asset_code) ? `${o.asset_name ?? ""}${o.asset_code ? ` (${o.asset_code})` : ""}` || "-" : "-" },
    { key: "detected_date", header: "วันที่พบ", renderCell: (o) => o.detected_date || "-" },
    { key: "source", header: "แหล่งพบ", renderCell: (o) => sourceLabel[o.source] || o.source || "-" },
    {
      key: "impact_level",
      header: "ผลกระทบ",
      renderCell: (o) => (o.impact_level ? <Badge variant={impactVariant[o.impact_level] ?? "neutral"}>{o.impact_level}</Badge> : "-"),
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (o) => (
        <Badge variant={o.status === "closed" ? "success" : o.status === "in_progress" ? "warning" : "neutral"}>
          {o.status === "closed" ? "ปิดแล้ว" : o.status === "in_progress" ? "อยู่ระหว่างแก้ไข" : o.status}
        </Badge>
      ),
    },
    {
      key: "rca_code",
      header: "RCA",
      renderCell: (o) => (o.rca_code ? <Badge variant="neutral">{o.rca_code}</Badge> : <span className="text-xs text-muted-foreground">ยังไม่มี</span>),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "เหตุการณ์ OOT" },
      ]}
      title="เหตุการณ์ Out-of-Tolerance (OOT)"
      description="ผลการวัดที่เกินเกณฑ์ — ประเมินผลกระทบโดยผู้เชี่ยวชาญและเชื่อมโยง RCA ได้จากที่นี่"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            รายการ OOT
            {!isLoading && <Badge variant="primary">{(data ?? []).length} เหตุการณ์</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<OotEvent>
            columns={columns}
            data={data ?? []}
            idKey="id"
            loading={isLoading}
            skeletonRows={6}
            pageSize={15}
            caption="เหตุการณ์ OOT"
            emptyTitle="ไม่มีเหตุการณ์ OOT"
            emptyDescription="OOT จะถูกสร้างอัตโนมัติเมื่อผลสอบเทียบไม่ผ่านตามนโยบาย"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}