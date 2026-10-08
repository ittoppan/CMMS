"use client";

import { Suspense, useState } from "react";
import { Plus, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  RelEmpty,
  RelError,
  RelFilterBar,
  RelLamp,
  RelLoading,
  RelMetaPanel,
  RelSection,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters } from "@/lib/useRelFilters";
import {
  RL_BA_COMPARATORS,
  RL_BA_METRIC_LABELS,
  RL_BA_METRICS,
  RL_DASH,
  rlNum,
  rlPct,
  rlUrl,
  saveBadActorCriterion,
  useRelScopeOptions,
  type BadActorCriterion,
  type BadActorEvidence,
  type BadActorScoreRow,
  type RelBaCriteriaResponse,
  type RelBaScoresResponse,
  type RelConfigResponse,
} from "@/lib/reliability";

/**
 * /reliability/bad-actors — action=bad_actor_scores + bad_actor_criteria.
 *
 * Scores and evidence are produced entirely by rel_bad_actor_scores(); the
 * weighted score and the "did this criterion fire" decision are never redone in
 * the browser. The criteria editor is shown only when the config endpoint says
 * can_admin — the API re-checks with requirePerm(..., 'admin') regardless.
 */

const EMPTY_CRITERION: Partial<BadActorCriterion> = {
  criteria_code: "",
  name_th: "",
  metric: "failure_count",
  comparator: "gte",
  threshold: 0,
  unit: "",
  weight: 1,
  min_evidence: 1,
  min_sample_period_days: 90,
  enabled: 0,
  sort_order: 100,
  note: "",
};

function BadActorsInner() {
  const hero = usePageHero("reliability/bad-actors");
  const { filters, setFilters, query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();

  const [evidenceRow, setEvidenceRow] = useState<BadActorScoreRow | null>(null);
  const [editing, setEditing] = useState<Partial<BadActorCriterion> | null>(null);
  const [saving, setSaving] = useState(false);

  const scoresQ = useApiQuery<RelBaScoresResponse>(
    ["reliability", "bad_actor_scores", filters],
    rlUrl("bad_actor_scores", filters, { page_size: 50 }),
  );
  const criteriaQ = useApiQuery<RelBaCriteriaResponse>(
    ["reliability", "bad_actor_criteria"],
    rlUrl("bad_actor_criteria"),
  );
  const configQ = useApiQuery<RelConfigResponse>(
    ["reliability", "config"],
    rlUrl("config"),
  );

  const scores = scoresQ.data?.scores;
  const rows = scores?.rows ?? [];
  const criteria = criteriaQ.data?.criteria ?? [];
  const canAdmin = configQ.data?.can_admin === true;

  const scoreColumns: SimpleColumn<BadActorScoreRow>[] = [
    {
      key: "asset_code",
      header: "เครื่องจักร",
      renderCell: (r) => (
        <span className="font-medium">
          {r.asset_code} · {r.asset_name}
        </span>
      ),
    },
    { key: "criticality", header: "วิกฤต", align: "center" },
    {
      key: "score",
      header: "คะแนนรวม",
      align: "right",
      renderCell: (r) => rlNum(r.score),
    },
    {
      key: "criteria_hit",
      header: "เกณฑ์ที่ผ่าน",
      align: "center",
      renderCell: (r) => `${r.criteria_hit} / ${r.criteria_total}`,
    },
    { key: "failure_count", header: "เหตุเสีย", align: "right" },
    {
      key: "downtime_hours",
      header: "หยุดเครื่อง (ชม.)",
      align: "right",
      renderCell: (r) => rlNum(r.downtime_hours),
    },
    {
      key: "data_completeness_pct",
      header: "ความครบถ้วนข้อมูล",
      align: "right",
      renderCell: (r) => rlPct(r.data_completeness_pct, 0),
    },
    { key: "status", header: "สถานะ", align: "center", renderCell: (r) => <RelLamp status={r.status} showStatusCode /> },
    {
      key: "evidence",
      header: "หลักฐาน",
      align: "center",
      renderCell: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setEvidenceRow(r)}>
          ดู {r.evidence?.length ?? 0} เกณฑ์
        </Button>
      ),
    },
  ];

  const criterionColumns: SimpleColumn<BadActorCriterion>[] = [
    {
      key: "criteria_code",
      header: "รหัสเกณฑ์",
      renderCell: (r) => <span className="font-mono text-xs">{r.criteria_code}</span>,
    },
    { key: "name_th", header: "ชื่อเกณฑ์" },
    {
      key: "metric",
      header: "ตัวชี้วัด",
      renderCell: (r) => RL_BA_METRIC_LABELS[r.metric]?.th ?? r.metric,
    },
    {
      key: "condition",
      header: "เงื่อนไข",
      renderCell: (r) => (
        <span className="text-xs">
          {r.comparator} {rlNum(r.threshold)} {r.unit}
        </span>
      ),
    },
    { key: "weight", header: "น้ำหนัก", align: "right", renderCell: (r) => rlNum(r.weight) },
    { key: "min_evidence", header: "หลักฐานขั้นต่ำ", align: "right" },
    {
      key: "min_sample_period_days",
      header: "ข้อมูลขั้นต่ำ (วัน)",
      align: "right",
    },
    {
      key: "enabled",
      header: "สถานะ",
      align: "center",
      renderCell: (r) => <RelLamp status={r.enabled ? "COMPLETE" : "NOT_ENOUGH_DATA"} showStatusCode />,
    },
    ...(canAdmin
      ? [
          {
            key: "edit",
            header: "",
            align: "center" as const,
            renderCell: (r: BadActorCriterion) => (
              <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                <Settings2 size={14} strokeWidth={1.75} aria-hidden="true" />
                แก้ไข
              </Button>
            ),
          },
        ]
      : []),
  ];

  const submitCriterion = async () => {
    if (!editing) return;
    if (!editing.criteria_code?.trim()) {
      toast.error("กรุณากรอกรหัสเกณฑ์");
      return;
    }
    setSaving(true);
    try {
      const res = await saveBadActorCriterion({
        criteria_code: editing.criteria_code,
        name_th: editing.name_th ?? "",
        metric: editing.metric,
        comparator: editing.comparator,
        threshold: editing.threshold,
        unit: editing.unit ?? "",
        weight: editing.weight ?? 1,
        min_evidence: editing.min_evidence ?? 1,
        min_sample_period_days: editing.min_sample_period_days ?? 90,
        // send 1/0 rather than a boolean: PHP casts the truthiness of this value
        enabled: editing.enabled ? 1 : 0,
        sort_order: editing.sort_order ?? 100,
        note: editing.note ?? "",
      });
      if (res?.ok) {
        toast.success(res.created ? "เพิ่มเกณฑ์แล้ว" : "บันทึกเกณฑ์แล้ว");
        setEditing(null);
        criteriaQ.refetch();
        scoresQ.refetch();
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
        { label: "เครื่องที่มีปัญหาเป็นระบบ" },
      ]}
      actions={
        <>
          {canAdmin && (
            <Button size="sm" onClick={() => setEditing({ ...EMPTY_CRITERION })}>
              <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
              เพิ่มเกณฑ์
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { scoresQ.refetch(); criteriaQ.refetch(); }}
          >
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      }
    >
      <RelFilterBar value={filters} onChange={setFilters} options={scopeOptions ?? null} showBasis={false} />

      {scoresQ.error && <RelError message={scoresQ.error.message} />}
      {scoresQ.isLoading && <RelLoading />}

      {scores && (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-4">
              <Stat label="เครื่องที่ประเมินแล้ว" value={String(scores.summary?.assets_scored ?? 0)} />
              <Stat label="เครื่องที่ถูกทำเครื่องหมาย" value={String(scores.summary?.assets_flagged ?? 0)} />
              <Stat label="เกณฑ์ที่เปิดใช้" value={String(scores.summary?.criteria_enabled ?? 0)} />
              <Stat label="จำนวนเกณฑ์ทั้งหมด" value={String(criteria.length)} />
            </CardContent>
          </Card>

          {scores.summary?.criteria_enabled === 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ยังไม่มีเกณฑ์ที่เปิดใช้งาน</CardTitle>
                <CardDescription className="text-xs">
                  {scores.note}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <RelSection title="คะแนนเครื่องจักร" description="เรียงตามคะแนนที่ Reliability Engine คำนวณจากเกณฑ์ที่เปิดใช้">
            {rows.length === 0 ? (
              <RelEmpty
                title="ยังไม่มีเครื่องที่ผ่านเกณฑ์การประเมิน"
                description={scores.note}
              />
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <SimpleDataTable columns={scoreColumns} data={rows} idKey="asset_id" pageSize={15} />
                </CardContent>
              </Card>
            )}
          </RelSection>

          <RelSection
            title="เกณฑ์การประเมิน"
            description={
              canAdmin
                ? "คุณเป็นผู้ดูแลระบบ จึงแก้ไขเกณฑ์ได้"
                : "อ่านอย่างเดียว — การแก้ไขเกณฑ์ต้องเป็นผู้ดูแลระบบ"
            }
          >
            {criteria.length === 0 ? (
              <RelEmpty
                title="ยังไม่มีเกณฑ์ที่กำหนดไว้"
                description={
                  canAdmin
                    ? "กด “เพิ่มเกณฑ์” เพื่อกำหนดเกณฑ์แรก เช่น จำนวนเหตุเสียมากกว่า X ครั้งต่อช่วงเวลา"
                    : "ผู้ดูแลระบบยังไม่ได้กำหนดเกณฑ์การประเมิน"
                }
              />
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <SimpleDataTable
                    columns={criterionColumns}
                    data={criteria}
                    idKey="criteria_code"
                    pageSize={10}
                  />
                </CardContent>
              </Card>
            )}
          </RelSection>

          <RelMetaPanel meta={scores.meta} />
        </>
      )}

      {/* Evidence dialog — read-only rendering of the engine's own evidence rows */}
      <Dialog
        open={evidenceRow !== null}
        onClose={() => setEvidenceRow(null)}
        title={evidenceRow ? `หลักฐาน · ${evidenceRow.asset_code} ${evidenceRow.asset_name}` : ""}
        description="ค่าที่วัดได้เทียบกับเกณฑ์ พร้อมจำนวนหลักฐานที่ใช้ตัดสิน"
      >
        {evidenceRow?.evidence && evidenceRow.evidence.length > 0 ? (
          <ul className="space-y-3">
            {evidenceRow.evidence.map((e: BadActorEvidence) => (
              <li key={e.criteria_code} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {RL_BA_METRIC_LABELS[e.metric]?.th ?? e.metric}
                  </span>
                  <RelLamp status={e.fired ? "INVALID" : "COMPLETE"} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  เงื่อนไข: {e.comparator} {rlNum(e.threshold)} {e.unit} · ค่าที่วัดได้: {rlNum(e.value)} · หลักฐาน{" "}
                  {e.evidence_rows}/{e.min_evidence} รายการ
                </p>
                {!e.fired && e.evidence_rows < e.min_evidence && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    ยังไม่ผ่านเพราะหลักฐานไม่ถึงขั้นต่ำ ไม่ใช่เพราะค่าต่ำกว่าเกณฑ์
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <RelEmpty
            title="ไม่มีหลักฐาน"
            description="เกณฑ์ที่เปิดใช้อาจยังไม่มีข้อมูลเพียงพอสำหรับเครื่องนี้"
          />
        )}
      </Dialog>

      {/* Criterion editor — Admin only (backend enforces requirePerm 'admin') */}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "แก้ไขเกณฑ์การประเมิน" : "เพิ่มเกณฑ์การประเมิน"}
        description="เกณฑ์ที่บันทึกจะถูกใช้คำนวณคะแนนทั้งหมดของหน้านี้ทันที"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={submitCriterion} loading={saving} loadingText="กำลังบันทึก">
              บันทึก
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <Input
              label="รหัสเกณฑ์"
              required
              hint="ตัวอักษรใหญ่ ตัวเลข และ _ เท่านั้น เช่น FAIL_COUNT_90D"
              value={editing.criteria_code ?? ""}
              onChange={(e) => setEditing({ ...editing, criteria_code: e.target.value })}
            />
            <Input
              label="ชื่อเกณฑ์"
              value={editing.name_th ?? ""}
              onChange={(e) => setEditing({ ...editing, name_th: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={editing.metric ?? "failure_count"}
                onValueChange={(v) => setEditing({ ...editing, metric: v })}
              >
                <SelectTrigger aria-label="ตัวชี้วัด" className="w-full">
                  <SelectValue placeholder="ตัวชี้วัด" />
                </SelectTrigger>
                <SelectContent>
                  {RL_BA_METRICS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {RL_BA_METRIC_LABELS[m]?.th ?? m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={editing.comparator ?? "gte"}
                onValueChange={(v) => setEditing({ ...editing, comparator: v })}
              >
                <SelectTrigger aria-label="ตัวเปรียบเทียบ" className="w-full">
                  <SelectValue placeholder="ตัวเปรียบเทียบ" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RL_BA_COMPARATORS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="ค่าเกณฑ์"
                type="number"
                step="any"
                value={String(editing.threshold ?? 0)}
                onChange={(e) => setEditing({ ...editing, threshold: Number(e.target.value) })}
              />
              <Input
                label="หน่วย"
                placeholder="เช่น ครั้ง, ชม., บาท"
                value={editing.unit ?? ""}
                onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="น้ำหนัก"
                type="number"
                step="any"
                hint="ค่าน้ำหนักที่ใช้รวมคะแนน"
                value={String(editing.weight ?? 1)}
                onChange={(e) => setEditing({ ...editing, weight: Number(e.target.value) })}
              />
              <Input
                label="จำนวนหลักฐานขั้นต่ำ"
                type="number"
                value={String(editing.min_evidence ?? 1)}
                onChange={(e) => setEditing({ ...editing, min_evidence: Number(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="ข้อมูลขั้นต่ำ (วัน)"
                type="number"
                hint="ช่วงข้อมูลต้องยาวอย่างน้อยเท่านี้"
                value={String(editing.min_sample_period_days ?? 90)}
                onChange={(e) =>
                  setEditing({ ...editing, min_sample_period_days: Number(e.target.value) })
                }
              />
              <Input
                label="ลำดับการแสดงผล"
                type="number"
                value={String(editing.sort_order ?? 100)}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
              />
            </div>
            <Switch
              label="เปิดใช้งานเกณฑ์นี้"
              checked={Boolean(editing.enabled)}
              onChange={(next: boolean) => setEditing({ ...editing, enabled: next ? 1 : 0 })}
            />
            <Textarea
              label="หมายเหตุ"
              rows={2}
              value={editing.note ?? ""}
              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
            />
          </div>
        )}
      </Dialog>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function ReliabilityBadActorsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <BadActorsInner />
    </Suspense>
  );
}
