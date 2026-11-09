"use client";

import { Suspense, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  RelEmpty,
  RelError,
  RelLamp,
  RelLoading,
  RelRestricted,
} from "@/components/reliability/shared";
import { useRelParam } from "@/lib/useRelFilters";
import {
  RL_PRIORITY_LABELS,
  RL_STUDY_STATUS_LABELS,
  RL_STUDY_STATUSES,
  RL_DASH,
  rlUrl,
  saveStudy,
  type RelConfigResponse,
  type RelStudiesResponse,
  type StudyRow,
} from "@/lib/reliability";

/**
 * /reliability/studies — action=studies.
 *
 * A study is an engineering record, not a computed number: this page only lists
 * what the backend stores and lets an authorised user open a draft. Every
 * metric on a study comes from the engine elsewhere on the site.
 */

const STATUS_ANDON: Record<string, string> = {
  draft: "NOT_ENOUGH_DATA",
  in_review: "PARTIAL",
  approved: "COMPLETE",
  closed: "COMPLETE",
  cancelled: "DEGRADED",
};

function emptyStudy() {
  const today = new Date();
  return {
    title: "",
    scope_description: "",
    asset_scope_note: "",
    period_start: today.toISOString().slice(0, 10),
    period_end: today.toISOString().slice(0, 10),
    method: "",
    method_note: "",
    data_sources: "",
    data_quality_note: "",
    assumptions: "",
    findings: "",
    evidence_summary: "",
    conclusion: "",
    status: "draft",
    priority: "medium",
  };
}

function StudiesInner() {
  const hero = usePageHero("reliability/studies");
  const [status, setStatus] = useRelParam("status", "");
  const [q, setQ] = useRelParam("q", "");

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyStudy);

  const studiesQ = useApiQuery<RelStudiesResponse>(
    ["reliability", "studies", status, q],
    rlUrl("studies", {}, { limit: 50, status, q }),
  );
  const configQ = useApiQuery<RelConfigResponse>(["reliability", "config"], rlUrl("config"));
  const canWrite = configQ.data?.can_write === true;

  const studies = studiesQ.data?.studies ?? [];

  const columns: SimpleColumn<StudyRow>[] = [
    {
      key: "study_code",
      header: "รหัส",
      renderCell: (r) => (
        <Link
          href={`/reliability/studies/${r.id}`}
          className="font-mono text-xs text-primary underline-offset-2 hover:underline"
        >
          {r.study_code}
        </Link>
      ),
    },
    {
      key: "title",
      header: "หัวข้อ",
      renderCell: (r) => (
        <span className="font-medium">
          {r.title}
          {r.scope_description ? (
            <span className="block text-xs font-normal text-muted-foreground">{r.scope_description}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "period",
      header: "ช่วงเวลา",
      renderCell: (r) => (
        <span className="text-xs tabular-nums">
          {r.period_start} → {r.period_end}
        </span>
      ),
    },
    {
      key: "analyst_name",
      header: "ผู้วิเคราะห์",
      renderCell: (r) => <span className="text-xs">{r.analyst_name ?? RL_DASH}</span>,
    },
    {
      key: "reviewer_name",
      header: "ผู้ตรวจทาน",
      renderCell: (r) => <span className="text-xs">{r.reviewer_name ?? RL_DASH}</span>,
    },
    {
      key: "link_count",
      header: "หลักฐาน",
      align: "right",
      renderCell: (r) => String(r.link_count ?? 0),
    },
    {
      key: "action_count",
      header: "งานที่ตั้งไว้",
      align: "right",
      renderCell: (r) => String(r.action_count ?? 0),
    },
    {
      key: "priority",
      header: "ความสำคัญ",
      align: "center",
      renderCell: (r) => (
        <span className="text-xs">{RL_PRIORITY_LABELS[r.priority]?.th ?? r.priority ?? RL_DASH}</span>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      align: "center",
      renderCell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          {RL_STUDY_STATUS_LABELS[r.status]?.th ?? r.status}
          <RelLamp status={STATUS_ANDON[r.status] ?? "NOT_ENOUGH_DATA"} />
        </span>
      ),
    },
  ];

  const submit = async () => {
    setSaving(true);
    try {
      const res = await saveStudy(form);
      if (res?.ok) {
        toast.success(`สร้างงานวิเคราะห์ ${res.study_code ?? ""} แล้ว`);
        setCreating(false);
        setForm(emptyStudy());
        studiesQ.refetch();
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
        { label: "วิศวกรรมความเสียหาย", href: "/reliability" },
        { label: "งานวิเคราะห์เชิงวิศวกรรม" },
      ]}
      actions={
        <>
          {canWrite && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
              สร้างงานวิเคราะห์
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => studiesQ.refetch()}>
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger aria-label="กรองตามสถานะ" className="w-48">
            <SelectValue placeholder="ทุกสถานะ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            {RL_STUDY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {RL_STUDY_STATUS_LABELS[s]?.th ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-64"
          placeholder="ค้นหาจากรหัสหรือหัวข้อ"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {configQ.data && !canWrite && (
        <RelRestricted message="บทบาทของคุณอ่านได้อย่างเดียว — การสร้างหรือแก้ไขงานวิเคราะห์ต้องมีสิทธิ์เขียน" />
      )}
      {studiesQ.error && <RelError message={studiesQ.error.message} />}
      {studiesQ.isLoading && <RelLoading />}

      {studiesQ.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{studies.length} งานวิเคราะห์</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {studies.length === 0 ? (
              <RelEmpty
                title="ยังไม่มีงานวิเคราะห์"
                description={
                  q || status
                    ? "ไม่พบงานวิเคราะห์ที่ตรงกับตัวกรอง ลองเปลี่ยนคำค้นหรือสถานะ"
                    : canWrite
                      ? "กด “สร้างงานวิเคราะห์” เพื่อเริ่มงานที่ระบุช่วงเวลา ขอบเขต และหลักฐานอ้างอิง"
                      : "ยังไม่มีงานวิเคราะห์ในระบบ"
                }
              />
            ) : (
              <SimpleDataTable columns={columns} data={studies} idKey="id" pageSize={15} />
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="สร้างงานวิเคราะห์"
        description="ต้องระบุช่วงเวลาและสิ่งที่คาดว่าจะศึกษา — งานวิเคราะห์ที่ไม่มีหน้าต่างเวลาใช้ตรวจสอบอะไรไม่ได้"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={submit} loading={saving} loadingText="กำลังบันทึก">
              บันทึกเป็นฉบับร่าง
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="หัวข้อ"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Textarea
            label="ขอบเขตที่ศึกษา"
            rows={2}
            hint="ระบุเป็นข้อความ — เลือกเครื่องจักรที่เกี่ยวข้องทีหลังจากหน้างานวิเคราะห์"
            value={form.scope_description}
            onChange={(e) => setForm({ ...form, scope_description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="เริ่ม"
              required
              type="date"
              value={form.period_start}
              onChange={(e) => setForm({ ...form, period_start: e.target.value })}
            />
            <Input
              label="สิ้นสุด"
              required
              type="date"
              value={form.period_end}
              onChange={(e) => setForm({ ...form, period_end: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="วิธีวิเคราะห์"
              placeholder="เช่น Weibull, Pareto, ก่อน–หลัง"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            />
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger aria-label="ความสำคัญ" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RL_PRIORITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.th}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            label="แหล่งข้อมูล"
            rows={2}
            placeholder="เช่น failure_events, work_orders, pm_history"
            value={form.data_sources}
            onChange={(e) => setForm({ ...form, data_sources: e.target.value })}
          />
          <Textarea
            label="ข้อจำกัดด้านคุณภาพข้อมูล"
            rows={2}
            value={form.data_quality_note}
            onChange={(e) => setForm({ ...form, data_quality_note: e.target.value })}
          />
          <Textarea
            label="สมมติฐาน"
            rows={2}
            value={form.assumptions}
            onChange={(e) => setForm({ ...form, assumptions: e.target.value })}
          />
        </div>
      </Dialog>
    </PageShell>
  );
}

export default function ReliabilityStudiesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <StudiesInner />
    </Suspense>
  );
}
