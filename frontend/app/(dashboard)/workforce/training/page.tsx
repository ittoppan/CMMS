"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { sendOrEnqueueDetailed } from "@/lib/offlineQueue";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { WORKFORCE_API, type Course, type Skill, type TrainingRecord } from "@/lib/workforce";
import AndonLamp from "@/components/AndonLamp";

/**
 * app/(dashboard)/workforce/training/page.tsx — courses, sessions, results (Phase 34)
 *
 * The grant is the whole point of this screen, so it is stated plainly: a course grants
 * AT MOST the single skill it is linked to, and only when the result is `passed` and the
 * score clears the course's pass_score. Nothing here is presented as a certificate —
 * a certificate is a separate object with its own issuer and expiry.
 */

interface Person {
  id: number;
  full_name: string;
  employee_code: string | null;
}

const TRAINING_STATUS_LABEL: Record<string, string> = {
  planned: "วางแผน",
  in_progress: "กำลังอบรม",
  passed: "ผ่าน",
  failed: "ไม่ผ่าน",
  expired: "หมดอายุ",
  cancelled: "ยกเลิก",
};

const TRAINING_STATUS_ANDON: Record<string, "ok" | "warn" | "down" | "idle"> = {
  planned: "idle",
  in_progress: "warn",
  passed: "ok",
  failed: "down",
  expired: "down",
  cancelled: "idle",
};

function statusMeta(v: string) {
  return {
    andon: TRAINING_STATUS_ANDON[v] ?? "idle",
    label: TRAINING_STATUS_LABEL[v] ?? v,
  };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function WorkforceTrainingPage() {
  const hero = usePageHero("workforce/training");
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [courseOpen, setCourseOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(
    null
  );

  const { data: cfg } = useApiQuery<{
    config: { require_reason: number | boolean };
    can: { training_manage: boolean };
  }>(
    ["workforce", "config"],
    `${WORKFORCE_API}?action=config`
  );

  const { data: options } = useApiQuery<{ people: Person[]; skills: Skill[] }>(
    ["workforce", "options"],
    `${WORKFORCE_API}?action=options`
  );

  const { data, isLoading } = useApiQuery<{ records: TrainingRecord[]; courses: Course[] }>(
    ["workforce", "training"],
    `${WORKFORCE_API}?action=training`
  );

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  const run = (body: Record<string, unknown>, kind: string, label: string, close: () => void) =>
    sendOrEnqueueDetailed({ url: WORKFORCE_API, method: "POST", body, kind, label }).then((res) => {
      close();
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "บันทึกเรียบร้อย" });
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({ tone: "warning", text: "บันทึกไว้ในคิวออฟไลน์แล้ว" });
      } else {
        setBanner({
          tone: "danger",
          text: res.message ? `บันทึกไม่สำเร็จ: ${res.message}` : "บันทึกไม่สำเร็จ",
        });
      }
    });

  const saveCourse = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      run(body, "workforce_course", `บันทึกหลักสูตร ${body.code ?? ""}`.trim(), () => setCourseOpen(false)),
  });

  const saveRecord = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      run(body, "workforce_training", "บันทึกการอบรม", () => setRecordOpen(false)),
  });

  const records = useMemo(() => {
    const list = data?.records ?? [];
    return statusFilter ? list.filter((r) => r.status === statusFilter) : list;
  }, [data?.records, statusFilter]);

  const courses = data?.courses ?? [];
  const canManage = cfg?.can.training_manage === true;
  const requireReason = cfg?.config.require_reason === 1 || cfg?.config.require_reason === true;

  const courseById = useMemo(() => {
    const m = new Map<number, Course>();
    courses.forEach((c) => m.set(c.id, c));
    return m;
  }, [courses]);

  const stats = useMemo(() => {
    const list = data?.records ?? [];
    return {
      total: list.length,
      planned: list.filter((r) => r.status === "planned" || r.status === "in_progress").length,
      passed: list.filter((r) => r.status === "passed").length,
      failed: list.filter((r) => r.status === "failed").length,
    };
  }, [data?.records]);

  const recordColumns: SimpleColumn<TrainingRecord>[] = [
    {
      key: "full_name",
      header: "ช่าง",
      renderCell: (r) =>
        r.full_name ? (
          <Link
            href={`/workforce/technicians/${r.user_id}`}
            className="font-medium text-[var(--cmms-primary-hover)] underline-offset-2 hover:underline"
          >
            {r.full_name}
          </Link>
        ) : (
          <span className="text-muted-foreground">#{r.user_id}</span>
        ),
    },
    {
      key: "course_name",
      header: "หลักสูตร",
      renderCell: (r) => {
        const c = r.course_id ? courseById.get(r.course_id) : undefined;
        return (
          <div>
            <div className="font-medium">{r.course_name ?? c?.name_th ?? `#${r.course_id}`}</div>
            {c?.grants_skill_name && (
              <div className="text-xs text-muted-foreground">
                ผ่านแล้วได้รับทักษะ “{c.grants_skill_name}” ระดับ {c.grants_level ?? 1}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "scheduled_date",
      header: "วันที่",
      renderCell: (r) => (
        <div className="text-sm">
          <div>{r.scheduled_date ?? "ไม่กำหนด"}</div>
          {r.completed_at && <div className="text-xs text-muted-foreground">เสร็จ {r.completed_at}</div>}
        </div>
      ),
    },
{
          key: "status",
          header: "สถานะ",
          renderCell: (r) => <AndonLamp status={statusMeta(r.status).andon} size="sm" showLabel />,
        },
    {
      key: "score",
      header: "คะแนน",
      align: "right",
      renderCell: (r) => {
        if (r.score == null) return <span className="text-muted-foreground">—</span>;
        const pass = r.course_id ? courseById.get(r.course_id)?.pass_score : null;
        const failed = pass != null && r.score < pass;
        return (
          <span className={failed ? "font-semibold text-red-600" : "font-medium"}>
            {r.score}
            {pass != null && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">/ ผ่านที่ {pass}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "expires_at",
      header: "หลักฐานหมดอายุ",
      renderCell: (r) =>
        r.expires_at ? (
          <span className="text-sm">{r.expires_at}</span>
        ) : (
          <span className="text-muted-foreground">ไม่มีวันหมดอายุ</span>
        ),
    },
{
          key: "granted",
          header: "ออกหลักฐาน",
          align: "center",
          renderCell: (r) =>
            r.granted ? (
              <AndonLamp status="ok" size="sm" showLabel />
            ) : r.status === "passed" ? (
              <AndonLamp status="warn" size="sm" showLabel />
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
  ];

  const courseColumns: SimpleColumn<Course>[] = [
    { key: "code", header: "รหัส", renderCell: (c) => <span className="font-mono text-sm">{c.code}</span> },
    {
      key: "name_th",
      header: "ชื่อหลักสูตร",
      renderCell: (c) => (
        <div>
          <div className="font-medium">{c.name_th}</div>
          {c.name_en && <div className="text-xs text-muted-foreground">{c.name_en}</div>}
        </div>
      ),
    },
    {
      key: "duration_hours",
      header: "ชั่วโมง",
      align: "right",
      renderCell: (c) => (c.duration_hours ? String(c.duration_hours) : "—"),
    },
    {
      key: "pass_score",
      header: "คะแนนผ่าน",
      align: "right",
      renderCell: (c) => c.pass_score ?? "—",
    },
    {
      key: "validity_days",
      header: "อายุหลักฐาน",
      align: "right",
      renderCell: (c) =>
        c.validity_days ? `${c.validity_days} วัน` : <span className="text-muted-foreground">ไม่มีวันหมดอายุ</span>,
    },
    {
      key: "grants",
      header: "ทักษะที่ให้",
      renderCell: (c) =>
        c.grants_skill_name ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <AndonLamp status="idle" size="sm" />
            <span>{c.grants_skill_name} (ระดับ {c.grants_level ?? 1})</span>
          </span>
        ) : (
          <span className="text-muted-foreground">ไม่ได้ให้ทักษะ</span>
        ),
    },
    {
      key: "is_mandatory",
      header: "บังคับ",
      align: "center",
      renderCell: (c) => (c.is_mandatory ? <AndonLamp status="warn" size="sm" showLabel /> : "—"),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "การอบรม" },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCourseOpen(true)}>
              เพิ่มหลักสูตร
            </Button>
            <Button onClick={() => setRecordOpen(true)}>บันทึกการอบรม</Button>
          </div>
        )
      }
    >
      <div className="space-y-6">
        {banner && <Alert variant={banner.tone}>{banner.text}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="รายการทั้งหมด" value={stats.total} />
          <Stat label="รอ/กำลังอบรม" value={stats.planned} />
          <Stat label="ผ่าน" value={stats.passed} tone="success" />
          <Stat label="ไม่ผ่าน" value={stats.failed} tone={stats.failed > 0 ? "danger" : undefined} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ผลการอบรม</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {(["", ...Object.keys(TRAINING_STATUS_LABEL)] as string[]).map((v) => (
                <button
                  key={v || "all"}
                  type="button"
                  onClick={() => setStatusFilter(v)}
                  aria-pressed={statusFilter === v}
                  className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                    statusFilter === v
                      ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)] text-white"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {v === "" ? "ทั้งหมด" : statusMeta(v).label}
                </button>
              ))}
            </div>
            <SimpleDataTable<TrainingRecord>
              columns={recordColumns}
              data={records}
              idKey="id"
              loading={isLoading}
              skeletonRows={8}
              pageSize={20}
              caption="ผลการอบรม"
              emptyTitle="ยังไม่มีผลการอบรม"
              emptyDescription="ยังไม่มีการอบรมที่บันทึกไว้"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenCheck className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              หลักสูตร
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleDataTable<Course>
              columns={courseColumns}
              data={courses}
              idKey="id"
              loading={isLoading}
              skeletonRows={6}
              pageSize={20}
              caption="หลักสูตรในระบบ"
              emptyTitle="ยังไม่มีหลักสูตร"
              emptyDescription="ยังไม่ได้กำหนดหลักสูตรในระบบ"
            />
          </CardContent>
        </Card>
      </div>

      <CourseDialog
        open={courseOpen}
        skills={options?.skills ?? []}
        pending={saveCourse.isPending}
        onClose={() => setCourseOpen(false)}
        onSubmit={(body) => saveCourse.mutate(body)}
      />

      <RecordDialog
        open={recordOpen}
        people={options?.people ?? []}
        courses={courses}
        requireReason={requireReason}
        pending={saveRecord.isPending}
        onClose={() => setRecordOpen(false)}
        onSubmit={(body) => saveRecord.mutate(body)}
      />
    </PageShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function CourseDialog({
  open,
  skills,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  skills: Skill[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [provider, setProvider] = useState("");
  const [hours, setHours] = useState(0);
  const [pass, setPass] = useState(80);
  const [validity, setValidity] = useState(0);
  const [grantsSkill, setGrantsSkill] = useState<number | "">("");
  const [grantsLevel, setGrantsLevel] = useState(3);
  const [mandatory, setMandatory] = useState(false);
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode("");
    setNameTh("");
    setNameEn("");
    setProvider("");
    setHours(0);
    setPass(80);
    setValidity(0);
    setGrantsSkill("");
    setGrantsLevel(3);
    setMandatory(false);
    setDesc("");
  }, [open]);

  const invalid = code.trim() === "" || nameTh.trim() === "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เพิ่มหลักสูตร"
      description="หลักสูตรให้ทักษาได้ไม่เกินหนึ่งรายการ และให้เฉพาะเมื่อผลเป็น “ผ่าน” เท่านั้น"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={pending || invalid}
            onClick={() =>
              onSubmit({
                action: "course_save",
                code: code.trim().toUpperCase(),
                name_th: nameTh.trim(),
                name_en: nameEn.trim(),
                provider: provider.trim(),
                duration_hours: hours,
                pass_score: pass,
                validity_days: validity,
                grants_skill_id: Number(grantsSkill) || 0,
                grants_level: Number(grantsSkill) ? grantsLevel : 0,
                is_mandatory: mandatory ? 1 : 0,
                description: desc.trim(),
              })
            }
          >
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cs-code">
              รหัส <span className="text-red-600">*</span>
            </Label>
            <Input
              id="cs-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 uppercase"
            />
          </div>
          <div>
            <Label htmlFor="cs-provider">หน่วยจัดอบรม</Label>
            <Input
              id="cs-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cs-nameth">
              ชื่อหลักสูตร (ไทย) <span className="text-red-600">*</span>
            </Label>
            <Input id="cs-nameth" value={nameTh} onChange={(e) => setNameTh(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cs-nameen">ชื่อหลักสูตร (อังกฤษ)</Label>
            <Input id="cs-nameen" value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="cs-hours">ชั่วโมง</Label>
            <Input
              id="cs-hours"
              type="number"
              min={0}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cs-pass">คะแนนผ่าน</Label>
            <Input
              id="cs-pass"
              type="number"
              min={0}
              max={100}
              value={pass}
              onChange={(e) => setPass(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cs-validity">อายุหลักฐาน (วัน)</Label>
            <Input
              id="cs-validity"
              type="number"
              min={0}
              value={validity}
              onChange={(e) => setValidity(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1"
            />
          </div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-sm font-medium">ทักษะที่หลักสูตรนี้ให้</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cs-skill">ทักษะ</Label>
              <Select
                value={grantsSkill === "" ? "__none__" : String(grantsSkill)}
                onValueChange={(v) => setGrantsSkill(v === "__none__" ? "" : Number(v))}
              >
                <SelectTrigger id="cs-skill" className="mt-1">
                  <SelectValue placeholder="ไม่ให้ทักษะ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ไม่ให้ทักษะ</SelectItem>
                  {skills.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name_th}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cs-level">ระดับที่ให้</Label>
              <Select
                value={String(grantsLevel)}
                onValueChange={(v) => setGrantsLevel(Number(v))}
                disabled={!grantsSkill}
              >
                <SelectTrigger id="cs-level" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      ระดับ {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
          หลักสูตรบังคับ
        </label>
        <div>
          <Label htmlFor="cs-desc">คำอธิบาย</Label>
          <Textarea
            id="cs-desc"
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    </Dialog>
  );
}

function RecordDialog({
  open,
  people,
  courses,
  requireReason,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  people: Person[];
  courses: Course[];
  requireReason: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [userId, setUserId] = useState<number | "">("");
  const [courseId, setCourseId] = useState<number | "">("");
  const [status, setStatus] = useState("planned");
  const [scheduled, setScheduled] = useState(isoToday);
  const [completed, setCompleted] = useState("");
  const [score, setScore] = useState<number | "">("");
  const [instructor, setInstructor] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setUserId("");
    setCourseId("");
    setStatus("planned");
    setScheduled(isoToday());
    setCompleted("");
    setScore("");
    setInstructor("");
    setReason("");
  }, [open]);

  const course = courseId ? courses.find((c) => c.id === courseId) : undefined;
  const invalid = userId === "" || courseId === "";
  const passedButNoScore = status === "passed" && score === "";
  const missingReason = requireReason && reason.trim() === "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="บันทึกการอบรม"
      description="การเปลี่ยนผลเป็น “ผ่าน” จะทำให้ระบบออกหลักฐานทักษะให้อัตโนมัติตามหลักสูตร"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={pending || invalid || passedButNoScore || missingReason}
            onClick={() =>
              onSubmit({
                action: "training_save",
                user_id: Number(userId),
                course_id: Number(courseId),
                status,
                scheduled_date: scheduled,
                completed_at: completed,
                score: score === "" ? null : Number(score),
                instructor: instructor.trim(),
                reason: reason.trim(),
              })
            }
          >
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tr-user">
              ช่าง <span className="text-red-600">*</span>
            </Label>
            <Select value={userId === "" ? "__none__" : String(userId)} onValueChange={(v) => setUserId(v === "__none__" ? "" : Number(v))}>
              <SelectTrigger id="tr-user" className="mt-1">
                <SelectValue placeholder="เลือกช่าง" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-course">
              หลักสูตร <span className="text-red-600">*</span>
            </Label>
            <Select value={courseId === "" ? "__none__" : String(courseId)} onValueChange={(v) => setCourseId(v === "__none__" ? "" : Number(v))}>
              <SelectTrigger id="tr-course" className="mt-1">
                <SelectValue placeholder="เลือกหลักสูตร" />
              </SelectTrigger>
              <SelectContent>
                {courses.length === 0 && <SelectItem value="__none__" disabled>ยังไม่มีหลักสูตร</SelectItem>}
                {courses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name_th}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {course && (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div>
              เกณฑ์ผ่าน: <strong>{course.pass_score ?? 80}</strong> คะแนน
            </div>
            <div className="text-muted-foreground">
              {course.grants_skill_name
                ? `ผ่านแล้วได้รับทักษะ “${course.grants_skill_name}” ระดับ ${course.grants_level ?? 1}`
                : "หลักสูตรนี้ไม่ได้ให้ทักษะใด"}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tr-status">สถานะ</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="tr-status" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRAINING_STATUS_LABEL).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-sched">วันที่อบรม</Label>
            <Input
              id="tr-sched"
              type="date"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tr-score">คะแนน</Label>
            <Input
              id="tr-score"
              type="number"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-1"
            />
            {passedButNoScore && (
              <p className="mt-1 text-xs text-red-600">ต้องระบุคะแนนเมื่อสถานะเป็น “ผ่าน”</p>
            )}
          </div>
          <div>
            <Label htmlFor="tr-done">วันที่เสร็จ</Label>
            <Input
              id="tr-done"
              type="date"
              value={completed}
              onChange={(e) => setCompleted(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="tr-inst">ผู้สอน</Label>
          <Input
            id="tr-inst"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="tr-reason">
            เหตุผล / หมายเหตุ{" "}
            {requireReason ? (
              <span className="text-red-600">*</span>
            ) : (
              <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
            )}
          </Label>
          <Textarea
            id="tr-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    </Dialog>
  );
}
