"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Link2, Plus, RefreshCw } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

import {
  RelEmpty,
  RelError,
  RelLamp,
  RelLoading,
  RelRestricted,
  RelSection,
} from "@/components/reliability/shared";
import {
  RL_ACTION_FLOW,
  RL_ACTION_STATUS_LABELS,
  RL_ACTION_TYPE_LABELS,
  RL_ACTION_TYPES,
  RL_DASH,
  RL_PRIORITY_LABELS,
  RL_STUDY_FLOW,
  RL_STUDY_LINK_TYPE_LABELS,
  RL_STUDY_LINK_TYPES,
  RL_STUDY_STATUS_LABELS,
  addStudyLink,
  createAction,
  rlIso,
  rlUrl,
  saveStudy,
  transitionAction,
  transitionStudy,
  useRelScopeOptions,
  type AssetOption,
  type RelActionRow,
  type RelConfigResponse,
  type RelStudyResponse,
  type StudyDetail,
  type StudyLink,
} from "@/lib/reliability";

/**
 * /reliability/studies/[id] — action=study_get.
 *
 * The study record holds narrative fields, declared windows, linked evidence
 * and the actions it raised. Nothing here computes a reliability metric; the
 * numbers live on the engine-backed pages linked from the study.
 */

const STUDY_ANDON: Record<string, string> = {
  draft: "NOT_ENOUGH_DATA",
  in_review: "PARTIAL",
  approved: "COMPLETE",
  closed: "COMPLETE",
  cancelled: "DEGRADED",
};

const ACTION_ANDON: Record<string, string> = {
  proposed: "NOT_ENOUGH_DATA",
  accepted: "PARTIAL",
  in_progress: "PARTIAL",
  completed: "COMPLETE",
  cancelled: "DEGRADED",
  rejected: "DEGRADED",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-border/50 py-2 sm:grid-cols-3 sm:gap-3 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm sm:col-span-2">{value || RL_DASH}</span>
    </div>
  );
}

function StudyInner({ studyId }: { studyId: number }) {
  const hero = usePageHero("reliability/studies");
  const router = useRouter();
  const { data: scopeOptions } = useRelScopeOptions();

  const [editing, setEditing] = useState<Partial<StudyDetail> | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [linkForm, setLinkForm] = useState({ link_type: "asset", target_id: "", title: "", note: "" });
  const [actionForm, setActionForm] = useState({
    action_type: "inspection_request",
    title: "",
    description: "",
    asset_id: "",
    priority: "medium",
    due_date: "",
  });

  const studyQ = useApiQuery<RelStudyResponse>(
    ["reliability", "study_get", studyId],
    rlUrl("study_get", {}, { id: studyId }),
  );
  const configQ = useApiQuery<RelConfigResponse>(["reliability", "config"], rlUrl("config"));
  const canWrite = configQ.data?.can_write === true;

  const study = studyQ.data?.study ?? null;
  const assets: AssetOption[] = scopeOptions?.assets ?? [];

  const saveEdits = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await saveStudy({
        id: studyId,
        title: editing.title,
        scope_description: editing.scope_description,
        asset_scope_note: editing.asset_scope_note,
        period_start: editing.period_start,
        period_end: editing.period_end,
        method: editing.method,
        method_note: editing.method_note,
        data_sources: editing.data_sources,
        data_quality_note: editing.data_quality_note,
        assumptions: editing.assumptions,
        findings: editing.findings,
        evidence_summary: editing.evidence_summary,
        conclusion: editing.conclusion,
        priority: editing.priority,
      });
      if (res?.ok) {
        toast.success("บันทึกงานวิเคราะห์แล้ว");
        setEditing(null);
        studyQ.refetch();
      } else {
        toast.error(res?.error ?? "บันทึกไม่สำเร็จ");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const move = async (to: string) => {
    setBusy(true);
    try {
      const res = await transitionStudy(studyId, to);
      if (res?.ok) {
        toast.success(`เปลี่ยนสถานะเป็น ${RL_STUDY_STATUS_LABELS[to]?.th ?? to} แล้ว`);
        studyQ.refetch();
      } else {
        toast.error(res?.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitLink = async () => {
    setBusy(true);
    try {
      const res = await addStudyLink(studyId, linkForm);
      if (res?.ok) {
        toast.success("เพิ่มหลักฐานอ้างอิงแล้ว");
        setLinkOpen(false);
        setLinkForm({ link_type: "asset", target_id: "", title: "", note: "" });
        studyQ.refetch();
      } else {
        toast.error(res?.error ?? "เพิ่มไม่สำเร็จ");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitAction = async () => {
    setBusy(true);
    try {
      const res = await createAction({
        ...actionForm,
        study_id: studyId,
        asset_id: Number(actionForm.asset_id) || 0,
      });
      if (res?.ok) {
        toast.success(
          `สร้างงาน ${res.action_code ?? ""} แล้ว · ส่งต่อไปยังโมดูล ${res.target_module ?? ""}`,
        );
        setActionOpen(false);
        setActionForm({
          action_type: "inspection_request",
          title: "",
          description: "",
          asset_id: "",
          priority: "medium",
          due_date: "",
        });
        studyQ.refetch();
      } else {
        toast.error(res?.error ?? "สร้างงานไม่สำเร็จ");
      }
    } finally {
      setBusy(false);
    }
  };

  const moveAction = async (action: RelActionRow, to: string) => {
    setBusy(true);
    try {
      const res = await transitionAction(action.id, to);
      if (res?.ok) {
        toast.success(`เปลี่ยนงานเป็น ${RL_ACTION_STATUS_LABELS[to]?.th ?? to} แล้ว`);
        studyQ.refetch();
      } else {
        toast.error(res?.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
      }
    } finally {
      setBusy(false);
    }
  };

  const actionColumns: SimpleColumn<RelActionRow>[] = [
    {
      key: "title",
      header: "งานที่ตั้งไว้",
      renderCell: (a) => (
        <span className="font-medium">
          {a.title}
          <span className="block text-xs font-normal text-muted-foreground">
            {RL_ACTION_TYPE_LABELS[a.action_type]?.th ?? a.action_type} → {a.target_module}
          </span>
        </span>
      ),
    },
    { key: "action_code", header: "รหัสงาน", renderCell: (a) => <span className="font-mono text-xs">{a.action_code}</span> },
    {
      key: "priority",
      header: "ความสำคัญ",
      align: "center",
      renderCell: (a) => (
        <span className="text-xs">{RL_PRIORITY_LABELS[a.priority]?.th ?? a.priority}</span>
      ),
    },
    {
      key: "due_date",
      header: "ครบกำหนด",
      align: "center",
      renderCell: (a) => <span className="text-xs">{a.due_date ?? RL_DASH}</span>,
    },
    {
      key: "status",
      header: "สถานะ",
      align: "center",
      renderCell: (a) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          {RL_ACTION_STATUS_LABELS[a.status]?.th ?? a.status}
          <RelLamp status={ACTION_ANDON[a.status] ?? a.status} />
        </span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "center" as const,
            renderCell: (a: RelActionRow) => (
              <div className="flex flex-wrap justify-center gap-1">
                {(RL_ACTION_FLOW[a.status] ?? []).map((to) => (
                  <Button
                    key={to}
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => moveAction(a, to)}
                  >
                    {RL_ACTION_STATUS_LABELS[to]?.th ?? to}
                  </Button>
                ))}
              </div>
            ),
          },
        ]
      : []),
  ];

  if (studyQ.error) {
    return (
      <PageShell title={hero.title} description={hero.desc}>
        <RelError message={studyQ.error.message} />
      </PageShell>
    );
  }

  if (studyQ.isLoading) {
    return (
      <PageShell title={hero.title} description={hero.desc}>
        <RelLoading />
      </PageShell>
    );
  }

  if (!study) {
    return (
      <PageShell title={hero.title} description={hero.desc}>
        <RelEmpty
          title="ไม่พบงานวิเคราะห์"
          description="งานวิเคราะห์อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง"
        />
        <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/reliability/studies")}>
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
          กลับไปรายการงานวิเคราะห์
        </Button>
      </PageShell>
    );
  }

  const nextStatuses = RL_STUDY_FLOW[study.status] ?? [];

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{study.study_code}</span>}
      title={study.title}
      description={study.scope_description ?? hero.desc}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "วิศวกรรมความเสียหาย", href: "/reliability" },
        { label: "งานวิเคราะห์", href: "/reliability/studies" },
        { label: study.study_code },
      ]}
      actions={
        <>
          {canWrite && (
            <Button size="sm" onClick={() => setActionOpen(true)}>
              <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
              ตั้งงาน
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" onClick={() => setEditing({ ...study })}>
              แก้ไข
            </Button>
          )}
          {canWrite &&
            nextStatuses.map((to) => (
              <Button
                key={to}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => move(to)}
              >
                → {RL_STUDY_STATUS_LABELS[to]?.th ?? to}
              </Button>
            ))}
          <Button variant="ghost" size="sm" onClick={() => studyQ.refetch()}>
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      }
    >
      {configQ.data && !canWrite && (
        <RelRestricted message="บทบาทของคุณอ่านได้อย่างเดียว — การแก้ไข เปลี่ยนสถานะ และตั้งงานถูกปิดใช้งาน" />
      )}

      <Card>
        <CardHeader className="pb-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">รายละเอียดงานวิเคราะห์</CardTitle>
            <span className="inline-flex items-center gap-1.5 text-xs">
              {RL_STUDY_STATUS_LABELS[study.status]?.th ?? study.status}
              <RelLamp status={STUDY_ANDON[study.status] ?? study.status} showStatusCode />
            </span>
          </div>
          <CardDescription className="text-xs">
            งานวิเคราะห์เป็นบันทึกเชิงวิศวกรรม ตัวเลขความเสียหายทั้งหมดมาจากหน้าเครื่องยนต์
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="ช่วงเวลาที่ศึกษา" value={`${study.period_start} → ${study.period_end}`} />
          <Row label="วิธีวิเคราะห์" value={study.method || RL_DASH} />
          <Row label="แหล่งข้อมูล" value={study.data_sources || RL_DASH} />
          <Row label="ขอบเขตเครื่องจักร" value={study.asset_scope_note || RL_DASH} />
          <Row label="สมมติฐาน" value={study.assumptions || RL_DASH} />
          <Row label="ข้อจำกัดด้านคุณภาพข้อมูล" value={study.data_quality_note || RL_DASH} />
          <Row label="สิ่งที่พบ" value={study.findings || RL_DASH} />
          <Row label="หลักฐานสนับสนุน" value={study.evidence_summary || RL_DASH} />
          <Row label="ข้อสรุป" value={study.conclusion || RL_DASH} />
          <Row label="ความสำคัญ" value={RL_PRIORITY_LABELS[study.priority]?.th ?? study.priority} />
          <Row label="ผู้วิเคราะห์ / ผู้ตรวจทาน" value={`${study.analyst_name ?? RL_DASH} / ${study.reviewer_name ?? RL_DASH}`} />
          <Row label="สร้างเมื่อ / แก้ไขล่าสุด" value={`${rlIso(study.created_at)} · ${rlIso(study.updated_at)}`} />
        </CardContent>
      </Card>

      <RelSection
        title="หลักฐานอ้างอิง"
        description="งานวิเคราะห์ต้องชี้ไปยังบันทึกจริง — ระบบไม่สร้างหลักฐานขึ้นเอง"
        actions={
          canWrite ? (
            <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
              <Link2 size={14} strokeWidth={1.75} aria-hidden="true" />
              เพิ่มหลักฐาน
            </Button>
          ) : undefined
        }
      >
        {study.links.length === 0 ? (
          <RelEmpty
            title="ยังไม่มีหลักฐานอ้างอิง"
            description={
              canWrite
                ? "เพิ่มเครื่องจักร ใบงานซ่อม RCA หรือผลวิเคราะห์ Weibull ที่ใช้ในงานนี้"
                : "ผู้ดูแลยังไม่ได้ผูกหลักฐานกับงานวิเคราะห์นี้"
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-4">
              <SimpleDataTable
                columns={linkColumns()}
                data={study.links}
                idKey="id"
                pageSize={10}
              />
            </CardContent>
          </Card>
        )}
      </RelSection>

      <RelSection title="งานที่ตั้งไว้จากงานวิเคราะห์นี้">
        {study.actions.length === 0 ? (
          <RelEmpty
            title="ยังไม่มีงานที่ตั้งไว้"
            description={
              canWrite
                ? "ตั้งงาน เช่น ขอตรวจสอบ ทบทวน PM หรือขอ RCA แล้วระบบจะบันทึกเป้าหมายโมดูลให้"
                : "งานวิเคราะห์นี้ยังไม่ได้ตั้งงานใด"
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-4">
              <SimpleDataTable columns={actionColumns} data={study.actions} idKey="id" pageSize={10} />
            </CardContent>
          </Card>
        )}
      </RelSection>

      {study.status_log.length > 0 && (
        <RelSection title="ประวัติการเปลี่ยนสถานะ">
          <Card>
            <CardContent className="pt-4">
              <ol className="space-y-2">
                {study.status_log.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-muted-foreground">{rlIso(s.created_at)}</span>
                    <span>
                      {RL_STUDY_STATUS_LABELS[s.from_status]?.th ?? s.from_status} →{" "}
                      {RL_STUDY_STATUS_LABELS[s.to_status]?.th ?? s.to_status}
                    </span>
                    {s.note ? <span className="text-muted-foreground">· {s.note}</span> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </RelSection>
      )}

      <p className="text-xs text-muted-foreground">
        <Link href="/reliability/studies" className="underline-offset-2 hover:underline">
          ← กลับไปรายการงานวิเคราะห์
        </Link>
      </p>

      {/* Edit narrative fields */}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="แก้ไขงานวิเคราะห์"
        description="ช่วงเวลาต้องประกาศเอง และต้องไม่ทับกับงานที่ประเมินไปแล้ว"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={saveEdits} loading={saving} loadingText="กำลังบันทึก">
              บันทึก
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <Input
              label="หัวข้อ"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            <Textarea
              label="ขอบเขตที่ศึกษา"
              rows={2}
              value={editing.scope_description ?? ""}
              onChange={(e) => setEditing({ ...editing, scope_description: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="เริ่ม"
                type="date"
                value={editing.period_start ?? ""}
                onChange={(e) => setEditing({ ...editing, period_start: e.target.value })}
              />
              <Input
                label="สิ้นสุด"
                type="date"
                value={editing.period_end ?? ""}
                onChange={(e) => setEditing({ ...editing, period_end: e.target.value })}
              />
            </div>
            <Input
              label="ขอบเขตเครื่องจักร"
              value={editing.asset_scope_note ?? ""}
              onChange={(e) => setEditing({ ...editing, asset_scope_note: e.target.value })}
            />
            <Input
              label="วิธีวิเคราะห์"
              value={editing.method ?? ""}
              onChange={(e) => setEditing({ ...editing, method: e.target.value })}
            />
            <Textarea
              label="แหล่งข้อมูล"
              rows={2}
              value={editing.data_sources ?? ""}
              onChange={(e) => setEditing({ ...editing, data_sources: e.target.value })}
            />
            <Textarea
              label="สมมติฐาน"
              rows={2}
              value={editing.assumptions ?? ""}
              onChange={(e) => setEditing({ ...editing, assumptions: e.target.value })}
            />
            <Textarea
              label="ข้อจำกัดด้านคุณภาพข้อมูล"
              rows={2}
              value={editing.data_quality_note ?? ""}
              onChange={(e) => setEditing({ ...editing, data_quality_note: e.target.value })}
            />
            <Textarea
              label="สิ่งที่พบ"
              rows={3}
              value={editing.findings ?? ""}
              onChange={(e) => setEditing({ ...editing, findings: e.target.value })}
            />
            <Textarea
              label="หลักฐานสนับสนุน"
              rows={3}
              value={editing.evidence_summary ?? ""}
              onChange={(e) => setEditing({ ...editing, evidence_summary: e.target.value })}
            />
            <Textarea
              label="ข้อสรุป"
              rows={3}
              value={editing.conclusion ?? ""}
              onChange={(e) => setEditing({ ...editing, conclusion: e.target.value })}
            />
          </div>
        )}
      </Dialog>

      {/* Link evidence */}
      <Dialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="เพิ่มหลักฐานอ้างอิง"
        description="ระบุชนิดบันทึกและรหัสจริงที่ต้องการอ้างอิง"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setLinkOpen(false)}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={submitLink} loading={busy} loadingText="กำลังบันทึก">
              เพิ่ม
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            value={linkForm.link_type}
            onValueChange={(v) => setLinkForm({ ...linkForm, link_type: v, target_id: "" })}
          >
            <SelectTrigger aria-label="ชนิดบันทึก" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RL_STUDY_LINK_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {RL_STUDY_LINK_TYPE_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {linkForm.link_type === "asset" && assets.length > 0 ? (
            <Select
              value={linkForm.target_id}
              onValueChange={(v) => setLinkForm({ ...linkForm, target_id: v })}
            >
              <SelectTrigger aria-label="เลือกเครื่องจักร" className="w-full">
                <SelectValue placeholder="เลือกเครื่องจักร" />
              </SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              label="รหัสบันทึก"
              required
              hint="รหัสจริงของบันทึกที่ต้องการอ้างอิง"
              value={linkForm.target_id}
              onChange={(e) => setLinkForm({ ...linkForm, target_id: e.target.value })}
            />
          )}
          <Input
            label="ชื่อที่แสดง"
            value={linkForm.title}
            onChange={(e) => setLinkForm({ ...linkForm, title: e.target.value })}
          />
          <Textarea
            label="หมายเหตุว่าบันทึกนี้เกี่ยวข้องอย่างไร"
            rows={2}
            value={linkForm.note}
            onChange={(e) => setLinkForm({ ...linkForm, note: e.target.value })}
          />
        </div>
      </Dialog>

      {/* Raise an action */}
      <Dialog
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        title="ตั้งงานจากงานวิเคราะห์"
        description="ระบบจะบันทึกเป้าหมายโมดูลให้อัตโนมัติจากชนิดงานที่เลือก"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setActionOpen(false)}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={submitAction} loading={busy} loadingText="กำลังบันทึก">
              ตั้งงาน
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            value={actionForm.action_type}
            onValueChange={(v) => setActionForm({ ...actionForm, action_type: v })}
          >
            <SelectTrigger aria-label="ชนิดงาน" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(RL_ACTION_TYPES).map((t) => (
                <SelectItem key={t} value={t}>
                  {RL_ACTION_TYPE_LABELS[t]?.th ?? t} → {RL_ACTION_TYPES[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            label="หัวข้องาน"
            required
            value={actionForm.title}
            onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })}
          />
          <Textarea
            label="รายละเอียด"
            rows={2}
            value={actionForm.description}
            onChange={(e) => setActionForm({ ...actionForm, description: e.target.value })}
          />
          <Select
            value={actionForm.asset_id || "none"}
            onValueChange={(v) =>
              setActionForm({ ...actionForm, asset_id: v === "none" ? "" : v })
            }
          >
            <SelectTrigger aria-label="เครื่องจักรที่เกี่ยวข้อง" className="w-full">
              <SelectValue placeholder="ไม่ระบุเครื่องจักร" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ไม่ระบุ</SelectItem>
              {assets.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.code} · {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={actionForm.priority}
              onValueChange={(v) => setActionForm({ ...actionForm, priority: v })}
            >
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
            <Input
              label="ครบกำหนด"
              type="date"
              value={actionForm.due_date}
              onChange={(e) => setActionForm({ ...actionForm, due_date: e.target.value })}
            />
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}

function linkColumns(): SimpleColumn<StudyLink>[] {
  return [
    {
      key: "link_type",
      header: "ชนิดบันทึก",
      renderCell: (l) => (
        <span className="text-xs">{RL_STUDY_LINK_TYPE_LABELS[l.link_type] ?? l.link_type}</span>
      ),
    },
    {
      key: "target_id",
      header: "รหัสอ้างอิง",
      renderCell: (l) => <span className="font-mono text-xs">{l.target_id}</span>,
    },
    { key: "title", header: "ชื่อที่แสดง" },
    { key: "note", header: "หมายเหตุ" },
    {
      key: "created_at",
      header: "เพิ่มเมื่อ",
      align: "right",
      renderCell: (l) => <span className="text-xs">{rlIso(l.created_at)}</span>,
    },
  ];
}

export default function ReliabilityStudyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <PageShell title="งานวิเคราะห์" description="รหัสงานวิเคราะห์ไม่ถูกต้อง">
        <RelEmpty
          title="รหัสงานวิเคราะห์ไม่ถูกต้อง"
          description="กรุณาเปิดงานวิเคราะห์จากรายการ"
        />
      </PageShell>
    );
  }
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <StudyInner studyId={id} />
    </Suspense>
  );
}
