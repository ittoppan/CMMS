"use client";

import { Suspense } from "react";
import { RefreshCw } from "lucide-react";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Skeleton } from "@/components/ui/skeleton";

import {
  RelEmpty,
  RelError,
  RelFilterBar,
  RelLamp,
  RelLoading,
  RelSection,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters } from "@/lib/useRelFilters";
import {
  RL_DASH,
  rlNum,
  rlUrl,
  useRelScopeOptions,
  type RelWeibullFitResponse,
  type RelWeibullHistoryResponse,
  type WeibullFit,
  type WeibullFitPayload,
} from "@/lib/reliability";

/**
 * /reliability/weibull — action=weibull_fit + action=weibull_history.
 *
 * When the engine refuses to fit (NOT_ENOUGH_DATA) the fit object is null and
 * this page says so. It never back-fits a line through the browser, and it does
 * not fall back to a normal approximation to fill the gap.
 */

function WeibullInner() {
  const hero = usePageHero("reliability/weibull");
  const { filters, setFilters, query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();

  const fitQ = useApiQuery<RelWeibullFitResponse>(
    ["reliability", "weibull", filters],
    rlUrl("weibull_fit", filters),
  );
  const historyQ = useApiQuery<RelWeibullHistoryResponse>(
    ["reliability", "weibull-history", filters],
    rlUrl("weibull_history", filters, { limit: 10 }),
  );

  const fit = fitQ.data?.fit as WeibullFitPayload | undefined;
  const model = fit?.fit ?? null;
  const history = historyQ.data?.history ?? [];

  const historyColumns: SimpleColumn<WeibullFit>[] = [
    { key: "period", header: "ช่วงเวลา", renderCell: (r) => `${r.period?.start ?? RL_DASH} → ${r.period?.end ?? RL_DASH}` },
    { key: "beta", header: "β (รูปร่าง)", align: "right", renderCell: (r) => rlNum(r.beta) },
    { key: "eta", header: "η (สเกล)", align: "right", renderCell: (r) => rlNum(r.eta) },
    { key: "failures", header: "เหตุเสีย", align: "right" },
    { key: "observations", header: "ตัวอย่าง", align: "right" },
    { key: "method", header: "วิธี", renderCell: (r) => r.method },
    { key: "status", header: "สถานะ", align: "center", renderCell: (r) => <RelLamp status={r.status} showStatusCode /> },
    { key: "computed_at", header: "คำนวณเมื่อ", renderCell: (r) => r.computed_at ?? RL_DASH },
  ];

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={hero.title}
      description={hero.desc}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "วิศวกรรมความเสียหาย", href: relNavHref("/reliability", query) },
        { label: "Weibull" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => { fitQ.refetch(); historyQ.refetch(); }}>
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </Button>
      }
    >
      <RelFilterBar value={filters} onChange={setFilters} options={scopeOptions ?? null} />

      {fitQ.error && <RelError message={fitQ.error.message} />}
      {fitQ.isLoading && <RelLoading label="กำลังประเมินแบบจำลอง Weibull…" />}

      {fit && (
        <>
          {!model ? (
            <RelEmpty
              title={`ยังประเมิน Weibull ไม่ได้ (${fit.status})`}
              description={
                fit.note ||
                `ต้องมีเหตุเสียอย่างน้อยตามเกณฑ์ของเอนจินก่อน (ปัจจุบันมี ${fit.observations?.failures ?? 0} เหตุ / ${fit.observations?.count ?? 0} ตัวอย่าง)`
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">พารามิเตอร์</CardTitle>
                    <CardDescription className="text-xs">
                      แบบจำลองคำนวณโดย Reliability Engine ·{" "}
                      {model.time_origin === "start" ? "เวลาสะสมจากจุดเริ่ม" : "เวลาสะสมจากจุดศูนย์"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <Row label="β (รูปร่าง / shape)" value={rlNum(model.beta, 3)} />
                    <Row label="η (สเกล / scale)" value={rlNum(model.eta)} />
                    <Row label="วิธีประมาณ" value={model.method} />
                    <Row label="เหตุเสีย / ตัวอย่าง" value={`${model.failures} / ${model.observations}`} />
                    <Row label="ตัวอย่างตัดข้อมูล (censored)" value={String(model.censored)} />
                    <Row label="ความคลาดเคลื่อน β" value={rlNum(model.beta_stderr, 3)} />
                    <Row label="สถานะข้อมูล" value={<RelLamp status={model.data_quality} showStatusCode />} />
                    <Row label="บันทึกแคชไว้" value={model.persisted ? "ใช่" : "ไม่"} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">การตีความ β</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-xs text-muted-foreground">
                      β บอกรูปร่างของการกระจายอายุความเสีย ไม่ใช่คะแนนคุณภาพของเครื่อง
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li>β &lt; 1 — อัตราการเสียลดลงตามเวลา (เสียถี่ช่วงต้น)</li>
                      <li>β ≈ 1 — อัตราการเสียคงที่ (สมมติฐานแบบชีวภาพแข็งแรง)</li>
                      <li>β &gt; 1 — อัตราการเสียเพิ่มขึ้นตามอายุ ( wear-out )</li>
                    </ul>
                    {model.rankit_beta !== null && (
                      <p className="text-xs text-muted-foreground">
                        ค่าประมาณแบบ Rankit: β = {rlNum(model.rankit_beta, 3)} · η = {rlNum(model.rankit_eta)}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">ข้อจำกัดของแบบจำลอง</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    {(model.limitations ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">ไม่มีข้อจำกัดเพิ่มเติมจากเอนจิน</p>
                    ) : (
                      <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        {model.limitations.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    )}
                    {model.note && <p className="text-xs text-muted-foreground">{model.note}</p>}
                  </CardContent>
                </Card>
              </div>

              <RelSection
                title="เส้นโค้ง"
                description="ค่าที่เอนจินส่งมาเท่านั้น — ไม่มีการประมาณเส้นโค้งเพิ่มในเบราว์เซอร์"
              >
                {model.curve && model.curve.length > 0 ? (
                  <Card>
                    <CardContent className="pt-4">
                      <SimpleDataTable
                        columns={curveColumns}
                        data={model.curve as unknown as Record<string, number | null>[]}
                        idKey="t"
                        pageSize={10}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <RelEmpty
                    title="ไม่มีข้อมูลเส้นโค้ง"
                    description="เอนจินยังไม่ส่งชุดข้อมูลเส้นโค้งสำหรับคำขอนี้"
                  />
                )}
              </RelSection>
            </>
          )}

          {fit.observations && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ขอบเขตของชุดข้อมูลที่ใช้</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Row label="จำนวนตัวอย่าง" value={String(fit.observations.count)} />
                <Row label="เหตุเสีย" value={String(fit.observations.failures)} />
                <Row label="ตัวอย่างตัดข้อมูล" value={String(fit.observations.censored)} />
                <Row label="จุดอ้างอิงเวลา" value={fit.observations.origin} />
                <Row label="แคช" value={fit.cached ? "ใช้ค่าจากแคช" : "คำนวณใหม่"} />
                {fit.observations_notes &&
                  Object.entries(fit.observations_notes).map(([k, v]) => (
                    <p key={k} className="text-xs text-muted-foreground">
                      {k}: {v}
                    </p>
                  ))}
              </CardContent>
            </Card>
          )}

          <RelSection
            title="ประวัติการประเมิน"
            description="ผลที่เคยคำนวณไว้ในขอบเขตนี้ (จาก calculation snapshot)"
          >
            {history.length === 0 ? (
              <RelEmpty
                title="ยังไม่มีประวัติการประเมิน"
                description="เมื่อมีการประเมิน Weibull สำเร็จ ผลจะถูกเก็บไว้เพื่อเปรียบเทียบในอนาคต"
              />
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <SimpleDataTable columns={historyColumns} data={history} idKey="fit_uid" pageSize={10} />
                </CardContent>
              </Card>
            )}
          </RelSection>
        </>
      )}
    </PageShell>
  );
}

const curveColumns: SimpleColumn<Record<string, number | null>>[] = [
  { key: "t", header: "เวลา", align: "right", renderCell: (r) => rlNum(r.t) },
  { key: "R", header: "ความน่าเชื่อถือ R(t)", align: "right", renderCell: (r) => rlNum(r.R, 4) },
  { key: "F", header: "ฟังก์ชันการกระจาย F(t)", align: "right", renderCell: (r) => rlNum(r.F, 4) },
  { key: "H", header: "อัตราความเสี่ยง h(t)", align: "right", renderCell: (r) => rlNum(r.H, 5) },
];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  );
}

export default function ReliabilityWeibullPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <WeibullInner />
    </Suspense>
  );
}
