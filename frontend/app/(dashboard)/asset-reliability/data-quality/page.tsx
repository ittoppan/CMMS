"use client";

// asset-reliability/data-quality — Phase 28
// คุณภาพข้อมูล asset: fleet summary (reuse ana_data_quality) + ตรวจเช็ครายเครื่อง

import { useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { Grid, VStack } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { BadgeCheck, CheckCircle2, XCircle } from "lucide-react";

interface DqField { key: string; label: string; filled: number; total: number; pct: number; }
interface FleetDq {
  total_wos: number;
  fields: DqField[];
  reliability: { months_covered: number; assets_covered: number; usage_rows: number; pm_rows: number };
  warnings: string[];
}
interface AssetCheck { key: string; label: string; ok: boolean; detail?: string; }
interface AssetQuality {
  score: number;
  checks: AssetCheck[];
  has_data: boolean;
  notes?: string;
}

export default function DataQualityPage() {
  const hero = usePageHero("asset-reliability", { title: "คุณภาพข้อมูล Asset", desc: "ความครบถ้วนของข้อมูลที่จำเป็นต่อการวิเคราะห์ reliability" });
  const fleet = useApiQuery<FleetDq>(["asset-reliability", "dq"], "/api/v1/asset_data_quality.php");
  const [aid, setAid] = useState("");
  const [assetId, setAssetId] = useState(0);
  const asset = useApiQuery<{ quality: AssetQuality }>(
    ["asset-reliability", "dq-asset", assetId],
    `/api/v1/asset_data_quality.php?asset_id=${assetId}`,
    { enabled: assetId > 0 }
  );

  const runAssetCheck = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(aid);
    if (n > 0) { setAssetId(n); }
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: hero.title }]}
      title={hero.title}
      description="สำรวจความครบถ้วนของข้อมูลใบงาน MTBF/MTTR และ cost —ข้อมูลไม่ครบ = KPI แสดง INSUFFICIENT DATA ตามหลักการไม่เดาค่า"
    >
      <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              <span>คุณภาพข้อมูลใบงานซ่อม (fleet)</span>
              <Badge variant="primary">{fleet.data?.total_wos ?? 0} ใบ</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fleet.isLoading && <Spinner label="กำลังโหลด..." />}
            {fleet.error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={fleet.error.message} />}
            {!fleet.isLoading && !fleet.error && fleet.data && (
              <VStack gap={3}>
                {(fleet.data.fields ?? []).map((f) => (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="font-semibold tabular-nums">{f.pct}% ({f.filled}/{f.total})</span>
                    </div>
                    <Progress value={f.pct} className="h-1.5" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                  <div><p className="text-muted-foreground">เดือน MTBF/MTTR</p><p className="font-semibold">{fleet.data.reliability?.months_covered ?? 0}</p></div>
                  <div><p className="text-muted-foreground">เครื่องที่ครอบคลุม</p><p className="font-semibold">{fleet.data.reliability?.assets_covered ?? 0}</p></div>
                </div>
                {(fleet.data.warnings ?? []).map((w, i) => (
                  <Alert key={i} variant="warning" title="คำเตือน" description={w} />
                ))}
              </VStack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              <span>ตรวจเช็ครายเครื่อง</span>
            </CardTitle>
            <CardDescription>ตรวจสอบความครบถ้วนของข้อมูลที่จำเป็นต่อการประเมิน reliability</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={runAssetCheck} className="flex items-end gap-2">
              <Input label="ID เครื่องจักร" required placeholder="เช่น 89" value={aid} onChange={(e) => setAid(e.target.value)} className="max-w-[220px]" />
              <Button type="submit" variant="secondary">ตรวจเช็ค</Button>
            </form>
            {assetId > 0 && asset.isLoading && <Spinner label="กำลังตรวจ..." />}
            {assetId > 0 && asset.error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={asset.error.message} />}
            {assetId > 0 && !asset.isLoading && asset.data && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant={asset.data.quality.score >= 80 ? "success" : asset.data.quality.score >= 50 ? "warning" : "danger"}>
                    {asset.data.quality.score}%
                  </Badge>
                  <span className="text-sm text-muted-foreground">ความครบถ้วนโดยรวม</span>
                </div>
                {(asset.data.quality.checks ?? []).map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <span>{c.label}{c.detail ? <span className="block text-xs text-muted-foreground">{c.detail}</span> : null}</span>
                    {c.ok ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--cmms-success)]" aria-label="ผ่าน" />
                    ) : (
                      <XCircle size={16} className="mt-0.5 shrink-0 text-[var(--cmms-danger)]" aria-label="ไม่ผ่าน" />
                    )}
                  </div>
                ))}
                {asset.data.quality.notes && (
                  <p className="text-xs text-muted-foreground">{asset.data.quality.notes}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </Grid>
    </PageShell>
  );
}