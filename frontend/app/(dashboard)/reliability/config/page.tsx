"use client";

import { Suspense } from "react";
import { RefreshCw } from "lucide-react";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { RelError, RelLoading, RelSection } from "@/components/reliability/shared";
import { relNavHref, useRelFilters } from "@/lib/useRelFilters";
import {
  rlUrl,
  type RelConfigResponse,
  type RelDefinitionsResponse,
} from "@/lib/reliability";

/**
 * /reliability/config — action=config + action=definitions.
 *
 * This page explains *why* the numbers elsewhere in the workspace look the way
 * they do: the thresholds, the permitted bases, and each KPI's definition with
 * its version and data sources. Every entry here is read from the backend, so
 * this page can never drift from the engine's actual behaviour.
 */

function boolText(v: boolean | number | string | null | undefined): string {
  if (v === true || v === 1 || v === "1") return "เปิดใช้";
  if (v === false || v === 0 || v === "0") return "ปิด";
  return v === undefined || v === null || v === "" ? "—" : String(v);
}

function ConfigInner() {
  const hero = usePageHero("reliability/config");
  const { query } = useRelFilters();

  const configQ = useApiQuery<RelConfigResponse>(["reliability", "config"], rlUrl("config"));
  const defsQ = useApiQuery<RelDefinitionsResponse>(
    ["reliability", "definitions"],
    rlUrl("definitions"),
  );

  const cfg = configQ.data?.config;
  const defs = defsQ.data?.definitions ?? [];

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={hero.title}
      description={hero.desc}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "วิศวกรรมความเสียหาย", href: relNavHref("/reliability", query) },
        { label: "การตั้งค่าและนิยาม" },
      ]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => { configQ.refetch(); defsQ.refetch(); }}
        >
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </Button>
      }
    >
      {configQ.error && <RelError message={configQ.error.message} />}
      {configQ.isLoading && <RelLoading label="กำลังโหลดการตั้งค่าระบบ…" />}

      {cfg && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">สิทธิ์ของคุณในพื้นที่นี้</CardTitle>
              <CardDescription className="text-xs">
                ปุ่มที่แสดงถูกซ่อนตามสิทธิ์ และเซิร์ฟเวอร์ตรวจซ้ำทุกครั้งที่บันทึก
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2">
              <Permission label="บันทึก/แก้ไข" allowed={configQ.data?.can_write === true} />
              <Permission label="จัดการเกณฑ์และการตั้งค่าระบบ" allowed={configQ.data?.can_admin === true} />
            </CardContent>
          </Card>

          <RelSection
            title="เกณฑ์การคำนวณ"
            description="ค่าขั้นต่ำเหล่านี้คือเหตุผลที่ตัวเลขบางตัวเป็น NULL แทนที่จะเป็น 0"
          >
            <Card>
              <CardContent className="pt-4">
                <SettingRow label="ฐานการคำนวณที่ใช้" value={`${cfg.operating_basis}${cfg.allow_calendar_basis ? " (อนุญาตปฏิทิน)" : ""}`} />
                <SettingRow label="ฐานเวลาซ่อมที่ใช้" value={cfg.repair_time_basis} />
                <SettingRow label="จำนวนเหตุขั้นต่ำสำหรับ MTBF" value={cfg.min_failures_for_mtbf} />
                <SettingRow label="ข้อมูลขั้นต่ำ (วัน)" value={cfg.min_sample_period_days} />
                <SettingRow label="ช่วงเวลาสูงสุด (วัน)" value={cfg.max_range_days} />
                <SettingRow label="จำนวนเหตุขั้นต่ำสำหรับความพร้อมขัดข้อง" value={cfg.availability_min_events} />
                <SettingRow label="ต้องการการจำแนกสาเหตุ" value={boolText(cfg.need_classification)} />
                <SettingRow label="แจ้งเตือนเมื่อฐานการคำนวณผสมกัน" value={boolText(cfg.warn_mixed_bases)} />
                <SettingRow label="หน้าต่างแนวโน้มสูงสุด" value={cfg.trend_max_buckets} />
                <SettingRow label="ช่วงเลื่อนเริ่มต้น (เดือน)" value={cfg.rolling_default_months} />
                <SettingRow label="หน้าต่างแจ้งเหตุระดับสูง (วัน)" value={cfg.alarm_window_days} />
                <SettingRow label="นับแจ้งเหตุเป็นเหตุเสีย" value={boolText(cfg.alarm_as_failure)} />
              </CardContent>
            </Card>
          </RelSection>

          <RelSection title="Weibull" description="เกณฑ์ที่ทำให้ผลวิเคราะห์ไม่สามารถคำนวณและแสดงเป็น NOT_ENOUGH_DATA">
            <Card>
              <CardContent className="pt-4">
                <SettingRow label="จำนวนเหตุขั้นต่ำ" value={cfg.weibull_min_failures} />
                <SettingRow label="จำนวนเหตุสูงสุด" value={cfg.weibull_max_failures} />
                <SettingRow label="รวมข้อมูลแบบเซิร์สเวิร์ส" value={boolText(cfg.weibull_use_censored)} />
                <SettingRow label="จุดเริ่มนับเวลา" value={cfg.weibull_time_origin} />
                <SettingRow label="ระยะเวลาแคช (นาที)" value={cfg.weibull_cache_minutes} />
                <SettingRow label="ระดับความเสี่ยง" value={cfg.weibull_risk_levels} />
              </CardContent>
            </Card>
          </RelSection>

          <RelSection title="ต้นทุน คำเตือน และการจัดเก็บ">
            <Card>
              <CardContent className="pt-4">
                <SettingRow label="การแสดงรายการต้นทุนที่ไม่มีราคา" value={cfg.cost_missing_display} />
                <SettingRow label="เปิดเกณฑ์เครื่องที่มีปัญหาอัตโนมัติ" value={boolText(cfg.bad_actor_auto_enable)} />
                <SettingRow label="ประเมินผลหลังการเปลี่ยนแปลงอัตโนมัติ" value={boolText(cfg.growth_auto_claim)} />
                <SettingRow label="บันทึกผลตรวจคุณภาพข้อมูล" value={boolText(cfg.dq_store_findings)} />
                <SettingRow label="จำนวนผลตรวจสูงสุด" value={cfg.dq_max_findings} />
                <SettingRow label="เก็บผลการคำนวณไว้อ้างอิง" value={boolText(cfg.snapshot_persist)} />
                <SettingRow label="อายุผลคำนวณ (ชั่วโมง)" value={cfg.snapshot_ttl_hours} />
                <SettingRow label="จำนวนแถวต่อหน้าเริ่มต้น" value={cfg.page_default_size} />
              </CardContent>
            </Card>
          </RelSection>

          <p className="text-xs text-muted-foreground">
            หน้านี้เป็นแบบอ่านอย่างเดียว การเปลี่ยนค่าตั้งต้องแก้ที่ระดับฐานข้อมูลของผู้ดูแลระบบ ซึ่งจะมีผลต่อทุกหน้าที่คำนวณ
          </p>
        </>
      )}

      <RelSection
        title="นิยาม KPI"
        description="สูตร แหล่งข้อมูล และข้อจำกัดของแต่ละตัวชี้วัดตามที่ระบบใช้จริง"
      >
        {defsQ.isLoading ? (
          <RelLoading label="กำลังโหลดนิยาม…" />
        ) : defsQ.error ? (
          <RelError message={defsQ.error.message} />
        ) : defs.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              ยังไม่มีนิยาม KPI ในฐานข้อมูล — ต้องรันการติดตั้ง Phase 37 ก่อน
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {defs.map((d) => (
              <Card key={d.kpi_code}>
                <CardHeader className="pb-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">
                      {d.name_th ?? d.kpi_code}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {d.kpi_code} · v{d.version}
                      </span>
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-xs">
                  <p>{d.definition_th}</p>
                  <p className="text-muted-foreground">สูตร: {d.formula_display}</p>
                  <p className="text-muted-foreground">แหล่งข้อมูล: {d.data_sources}</p>
                  {d.limitations ? (
                    <p className="text-muted-foreground">ข้อจำกัด: {d.limitations}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </RelSection>
    </PageShell>
  );
}

function Permission({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="text-xs font-medium">{allowed ? "อนุญาต" : "ไม่อนุญาต"}</span>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value === "" || value === null || value === undefined ? "—" : String(value)}</span>
    </div>
  );
}

export default function ReliabilityConfigPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <ConfigInner />
    </Suspense>
  );
}
