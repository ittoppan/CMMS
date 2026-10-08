"use client";

import { Suspense, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  RelEmpty,
  RelError,
  RelFilterBar,
  RelLamp,
  RelLoading,
  RelRestricted,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters } from "@/lib/useRelFilters";
import {
  RL_DASH,
  RL_GROWTH_ASSESSMENT_LABELS,
  rlNum,
  rlUrl,
  saveGrowthLink,
  useRelScopeOptions,
  type GrowthLinkRow,
  type RelConfigResponse,
  type RelGrowthResponse,
} from "@/lib/reliability";

/**
 * /reliability/growth — action=growth_analysis.
 *
 * Each row is a link between an engineering change and a declared
 * before/after window. The engine compares the two windows and reports what it
 * observed. "improved" means the numbers moved after the change date — the
 * page deliberately presents it as an observation, never as proof of cause.
 */

const ANDON_BY_ASSESSMENT: Record<string, string> = {
  improved: "COMPLETE",
  degraded: "INVALID",
  no_change: "PARTIAL",
  insufficient_data: "NOT_ENOUGH_DATA",
  unassessed: "NOT_ENOUGH_DATA",
};

function windowText(w?: { start: string; end: string }): string {
  if (!w?.start || !w?.end) return RL_DASH;
  return `${w.start} → ${w.end}`;
}

function GrowthInner() {
  const hero = usePageHero("reliability/growth");
  const { filters, setFilters, query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();

  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    engineering_change_id: "",
    asset_id: "",
    effective_from: "",
    observation_end: "",
    baseline_start: "",
    baseline_end: "",
    claim: "",
    evidence_note: "",
  });

  const { data, isLoading, error, refetch, isFetching } = useApiQuery<RelGrowthResponse>(
    ["reliability", "growth_analysis", filters],
    rlUrl("growth_analysis", filters),
  );
  const configQ = useApiQuery<RelConfigResponse>(
    ["reliability", "config"],
    rlUrl("config"),
  );
  const canWrite = configQ.data?.can_write === true;

  const growth = data?.growth;
  const rows = growth?.links ?? [];

  const columns: SimpleColumn<GrowthLinkRow>[] = [
    {
      key: "change_label",
      header: "การเปลี่ยนแปลง",
      renderCell: (r) => (
        <span className="font-medium">
          {r.change_label}
          {r.claim ? <span className="block text-xs font-normal text-muted-foreground">{r.claim}</span> : null}
        </span>
      ),
    },
    {
      key: "windows",
      header: "หน้าต่างก่อน",
      renderCell: (r) => <span className="text-xs">{windowText(r.windows?.baseline)}</span>,
    },
    {
      key: "post_window",
      header: "หน้าต่างหลัง",
      renderCell: (r) => <span className="text-xs">{windowText(r.windows?.post)}</span>,
    },
    {
      key: "failures",
      header: "เหตุก่อน → หลัง",
      align: "right",
      renderCell: (r) =>
        r.observed ? `${r.observed.failures_before} → ${r.observed.failures_after}` : RL_DASH,
    },
    {
      key: "rate",
      header: "อัตราก่อน → หลัง (ต่อ 1,000 ชม.)",
      align: "right",
      renderCell: (r) =>
        r.observed
          ? `${rlNum(r.observed.failure_rate_before, 4)} → ${rlNum(r.observed.failure_rate_after, 4)}`
          : RL_DASH,
    },
    {
      key: "failure_rate_delta_pct",
      header: "การเปลี่ยนแปลง (%)",
      align: "right",
      renderCell: (r) => rlNum(r.observed?.failure_rate_delta_pct),
    },
    {
      key: "assessment",
      header: "ผลที่สังเกตได้",
      align: "center",
      renderCell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          {RL_GROWTH_ASSESSMENT_LABELS[r.assessment ?? ""]?.th ?? r.assessment ?? RL_DASH}
          <RelLamp status={ANDON_BY_ASSESSMENT[r.assessment ?? ""] ?? growth?.status} />
        </span>
      ),
    },
    {
      key: "assessment_stored",
      header: "คำกล่าวอ้างที่บันทึกไว้",
      align: "center",
      renderCell: (r) => (
        <span className="text-xs">
          {RL_GROWTH_ASSESSMENT_LABELS[r.assessment_stored]?.th ?? r.assessment_stored}
        </span>
      ),
    },
    {
      key: "note",
      header: "หมายเหตุจากระบบ",
      renderCell: (r) => <span className="text-xs text-muted-foreground">{r.note ?? RL_DASH}</span>,
    },
  ];

  const submitLink = async () => {
    setSaving(true);
    try {
      const res = await saveGrowthLink({
        engineering_change_id: Number(form.engineering_change_id) || 0,
        asset_id: Number(form.asset_id) || 0,
        effective_from: form.effective_from,
        observation_end: form.observation_end,
        baseline_start: form.baseline_start,
        baseline_end: form.baseline_end,
        claim: form.claim,
        evidence_note: form.evidence_note,
      });
      if (res?.ok) {
        toast.success("บันทึกการเชื่อมโยงแล้ว");
        setAdding(false);
        setForm({
          engineering_change_id: "",
          asset_id: "",
          effective_from: "",
          observation_end: "",
          baseline_start: "",
          baseline_end: "",
          claim: "",
          evidence_note: "",
        });
        refetch();
      } else {
        toast.error(res?.error ?? "บันทึกไม่สำเร็จ");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={hero.title}
      description={hero.desc}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "วิศวกรรมความเสียหาย", href: relNavHref("/reliability", query) },
        { label: "ผลหลังการเปลี่ยนแปลง" },
      ]}
      actions={
        <>
          {canWrite && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
              เชื่อมการเปลี่ยนแปลง
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      }
    >
      <RelFilterBar value={filters} onChange={setFilters} options={scopeOptions ?? null} showBasis={false} />

      {configQ.data && !canWrite && (
        <RelRestricted message="บทบาทของคุณอ่านได้อย่างเดียว — การเชื่อมโยงการเปลี่ยนแปลงต้องมีสิทธิ์เขียน" />
      )}

      {error && <RelError message={error.message} />}
      {isLoading && <RelLoading />}

      {growth && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">{growth.count} รายการเชื่อมโยง</CardTitle>
                <RelLamp status={growth.status} showStatusCode />
              </div>
              <CardDescription className="text-xs">{growth.note}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {rows.length === 0 ? (
                <RelEmpty
                  title="ยังไม่มีการเปลี่ยนแปลงที่ถูกเชื่อมโยงกับการวัดความเสียหาย"
                  description={
                    canWrite
                      ? "กด “เชื่อมการเปลี่ยนแปลง” เพื่อระบุ ECR ช่วงก่อน–หลัง และสิ่งที่คาดว่าจะเห็น"
                      : "ผู้ดูแลระบบยังไม่ได้เชื่อมโยงการเปลี่ยนแปลงใดกับการวัดความเสียหาย"
                  }
                />
              ) : (
                <SimpleDataTable columns={columns} data={rows} idKey="link_id" pageSize={15} />
              )}
            </CardContent>
          </Card>

          {growth.auto_claim && (
            <p className="text-xs text-muted-foreground">
              ระบบเปิดการประเมินอัตโนมัติไว้ — แต่ผลที่แสดงยังคงเป็นการสังเกตเชิงสถิติเท่านั้น
            </p>
          )}
        </>
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="เชื่อมโยงการเปลี่ยนแปลงกับการวัดความเสียหาย"
        description="ต้องระบุหน้าต่างก่อน–หลังเอง ระบบจะไม่เดาหน้าต่างเวลาให้"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={submitLink} loading={saving} loadingText="กำลังบันทึก">
              บันทึก
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="เลขที่ใบเปลี่ยนแปลง (engineering_changes.id)"
            required
            type="number"
            hint="ใช้ id ของ engineering_changes ไม่ใช่เลข ECR"
            value={form.engineering_change_id}
            onChange={(e) => setForm({ ...form, engineering_change_id: e.target.value })}
          />
          <Input
            label="รหัสเครื่องจักร (assets.id)"
            type="number"
            hint="ไม่กรอกไว้เพื่อประเมินทั้งหน่วย — ระบบจะปฏิเสธการเปรียบเทียบแบบทั้งหน่วย"
            value={form.asset_id}
            onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
          />
          <Input
            label="วันที่มีผลบังคับใช้"
            required
            type="date"
            value={form.effective_from}
            onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="หน้าต่างก่อน · เริ่ม"
              type="date"
              value={form.baseline_start}
              onChange={(e) => setForm({ ...form, baseline_start: e.target.value })}
            />
            <Input
              label="หน้าต่างก่อน · สิ้นสุด"
              type="date"
              value={form.baseline_end}
              onChange={(e) => setForm({ ...form, baseline_end: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="หน้าต่างหลัง · เริ่ม"
              hint="เริ่มที่วันที่มีผลบังคับใช้โดยอัตโนมัติ"
              type="date"
              disabled
              value={form.effective_from}
              onChange={() => undefined}
            />
            <Input
              label="หน้าต่างหลัง · สิ้นสุด"
              type="date"
              value={form.observation_end}
              onChange={(e) => setForm({ ...form, observation_end: e.target.value })}
            />
          </div>
          <Textarea
            label="สิ่งที่คาดว่าจะเห็น"
            required
            rows={2}
            hint="เขียนด้วยถ้อยคำของคุณเอง เพื่อให้ผลที่วัดได้ตรวจสอบได้"
            value={form.claim}
            onChange={(e) => setForm({ ...form, claim: e.target.value })}
          />
          <Textarea
            label="หมายเหตุหลักฐาน"
            rows={2}
            value={form.evidence_note}
            onChange={(e) => setForm({ ...form, evidence_note: e.target.value })}
          />
        </div>
      </Dialog>
    </PageShell>
  );
}

export default function ReliabilityGrowthPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <GrowthInner />
    </Suspense>
  );
}
